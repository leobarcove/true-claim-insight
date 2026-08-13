import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 50 * 1024 * 1024, // 50MB
    })
  );

  // Register multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Local filesystem fallback for Trinity report PDFs: when
  // SUPABASE_URL is empty the StorageService writes to
  // apps/risk-engine/storage/ and we serve those files under /storage/*
  // so the adjuster portal can fetch them via the URL recorded on the
  // claim's trinity_check row.
  if (!process.env.SUPABASE_URL) {
    const localRoot = join(process.cwd(), 'storage');
    mkdirSync(localRoot, { recursive: true });
    await app.register(fastifyStatic, {
      root: localRoot,
      prefix: '/storage/',
      decorateReply: false,
    });
  }

  // Global prefixes and pipes
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Risk Engine Service')
    .setDescription('AI and fraud risk assessment engine')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // Enable CORS
  app.enableCors();

  // See apps/api-gateway/src/main.ts for the precedence rationale. 3004 is the
  // compose-network port staging binds, not a local one.
  const port = Number(process.env.PORT ?? process.env.RISK_ENGINE_PORT ?? 3004);
  await app.listen(port, '0.0.0.0');
  console.log(`Risk Engine Service is running on: http://localhost:${port}/api/v1/docs`);
}
bootstrap();
