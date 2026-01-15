import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.useWebSocketAdapter(new WsAdapter(app));

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  console.log(`App listening on ${port}`);
}

bootstrap();
