import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  // Create Fastify adapter with optimised settings
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV !== 'production',
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: nodeEnv === 'production',
  });

  // Compression for responses
  await app.register(compression, { encodings: ['gzip', 'deflate'] });

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS configuration
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGINS', '*').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger documentation (non-production only)
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('True Claim Insight - Case Service')
      .setDescription('Claims lifecycle management API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('claims', 'Claims management endpoints')
      .addTag('adjusters', 'Adjuster queue and assignment')
      .addTag('documents', 'Document upload and retrieval')
      .addTag('health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║         True Claim Insight - Case Service                 ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Environment: ${nodeEnv.padEnd(42)}║
  ║  Port: ${port.toString().padEnd(49)}║
  ║  API Docs: http://localhost:${port}/api/docs${' '.repeat(19)}║
  ║  Health: http://localhost:${port}/api/v1/health${' '.repeat(15)}║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
