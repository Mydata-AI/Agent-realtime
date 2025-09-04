import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { OpenAI } from 'openai';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  private readonly client = new OpenAI();
  private readonly webhookSecret = process.env.OPENAI_WEBHOOK_VERIFICATION_KEY;

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: any) {
    const event = this.client.webhooks.unwrap(
      req.body,
      req.headers,
      this.webhookSecret,
    );
    return 'pong';
  }
}
