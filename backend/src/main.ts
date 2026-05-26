import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS since our iOS app and other clients will connect locally
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  
  await app.listen(3000);
  console.log('----------------------------------------------------');
  console.log('Streaming Chat Backend running on: http://localhost:3000');
  console.log('WebSocket Gateway listening on port 3000');
  console.log('----------------------------------------------------');
}
bootstrap();
