import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  // Railway injeta PORT; localmente usa CORE_PORT (default 3000).
  const port = Number(process.env.PORT) || config.get<number>('CORE_PORT', 3000);

  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Core ouvindo na porta ${port}`);
}

bootstrap();
