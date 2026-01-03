import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocket } from 'ws';
import axios from 'axios';
import { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';

@Injectable()
export class PhoneService implements OnModuleDestroy {
  private readonly logger = new Logger(PhoneService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY!;
  private sockets = new Map<string, WebSocket>();

  private get authHeader() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async acceptCallWithRetry(
    callId: string,
    opts?: { instructions?: string; model?: string },
  ) {
    const body: RealtimeSessionCreateRequest = {
      type: 'realtime',
      model: opts?.model || 'gpt-realtime',
      output_modalities: ['audio'],
      audio: {
        input: {
          format: 'pcm16',
          turn_detection: { type: 'semantic_vad', create_response: true },
        },
        output: {
          format: 'g711_ulaw',
          voice: 'coral',
          speed: 1.0,
        },
      },
      instructions:
        opts?.instructions ||
        `You are a helpful assistant for a restaurant, we always availability for bookings.
         Speak clearly and briefly.
          Confirm understanding before taking actions.
          Your default language is English, unless a user uses a different language`,
    };

    try {
      await axios.post(
        `https://api.openai.com/v1/realtime/calls/${callId}/accept`,
        body,
        { headers: { ...this.authHeader, 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      console.log('Error yacho', e.message);
    }
  }

  async connect(callId: string) {
    const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;

    const ws = new WebSocket(url, {
      headers: this.authHeader,
    });

    this.sockets.set(callId, ws);

    ws.on('open', () => {
      this.logger.log(`WS open for call ${callId}`);

      const responseCreate = {
        type: 'response.create',
        response: {
          instructions: `Greet the user and ask them what they need assistance with.
             Use English as a default language.
             For booking cancellation, ask for booking reference and name only.
             If a user is silent for more than 3 seconds, ask if they are still there or if they need help with anything`,
        },
      };
      ws.send(JSON.stringify(responseCreate));
    });

    ws.on('message', (data) => {
      // OpenAI events are JSON strings
      try {
        const text = data.toString();
        this.logger.debug(`WS message (${callId}): ${text}`);
        // TODO: route events as needed
      } catch (e) {
        this.logger.error(`Failed to parse WS message for ${callId}`, e as any);
      }
    });

    ws.on('error', (err) => {
      this.logger.error(`WS error for ${callId}: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      this.logger.log(
        `WS closed for ${callId}: code=${code} reason=${reason.toString()}`,
      );
      this.sockets.delete(callId);
    });
  }

    ws.on('error', (err) => {
      this.logger.error(`WS error for ${callId}: ${err.message}`, err.stack);
    });
  }

  async handleIncomingCall(callId: string) {
    await this.acceptCall(callId);
    // Don’t block the HTTP handler; start WS in background
    setImmediate(() => {
      this.connect(callId).catch((e) =>
        this.logger.error(
          `Failed to connect WS for ${callId}: ${e.message}`,
          e.stack,
        ),
      );
    });
  }

  async terminateCall(callId: string) {
    try {
      this.logger.log(`Handling incoming call: ${callId}`);
      // Step 1: Accept the call (wait for success)
      await this.acceptCallWithRetry(callId);

      // Step 2: Connect WebSocket
      await this.connect(callId);
    } catch (e: any) {
      this.logger.error(
        `Initialization failed for ${callId}: ${e.response?.data?.error?.message || e.message}`,
      );
    }
  }

  close(callId: string) {
    const sock = this.sockets.get(callId);
    if (sock && sock.readyState === WebSocket.OPEN) sock.close(1000, 'done');
    this.sockets.delete(callId);
  }

  onModuleDestroy() {
    for (const [id, sock] of this.sockets) {
      sock.close(1000);
    }
  }
}
