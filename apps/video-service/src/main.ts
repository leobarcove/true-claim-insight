import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';

import { AppModule } from './app.module';

// Polyfill for BigInt serialization
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      },
    })
  );

  const configService = app.get(ConfigService);

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // Compression
  await app.register(compression, { encodings: ['gzip', 'deflate'] });

  // Multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
    },
  });

  // CORS — which browser origins may call this service with credentials.
  //
  // The literal 4000/4001 pair that used to be here is the container-network
  // default, not a local one: with the portals on 4300/4301 it silently
  // rejects every browser call, and it has no env override at all, unlike the
  // gateway which reads CORS_ORIGINS.
  //
  // TODO(policy): decide the origin policy — see the note in the chat.
  // CORS_ORIGINS is a comma-separated list, already set in the root .env.
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? [
    'http://localhost:4000', // adjuster-portal (container-network default)
    'http://localhost:4001', // claimant-web (container-network default)
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Video Service')
    .setDescription('Daily.co video room management API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token'
    )
    .addTag('rooms', 'Video room management')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // See apps/api-gateway/src/main.ts for the precedence rationale. 3002 is the
  // compose-network port staging binds, not a local one.
  const port = Number(
    configService.get('PORT') ?? configService.get('VIDEO_SERVICE_PORT') ?? 3002,
  );
  await app.listen(port, '0.0.0.0');

  logger.log(`Swagger docs available at http://localhost:${port}/docs`);

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║         True Claim Insight - Video Service                ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Environment: ${configService.get('NODE_ENV', 'development').padEnd(40)}║
  ║  Port: ${port.toString().padEnd(48)}║
  ║  API Docs: http://localhost:${port}/docs                      ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
