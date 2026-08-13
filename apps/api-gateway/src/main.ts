import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';

import { AppModule } from './app.module';
import multipart from '@fastify/multipart';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 500 * 1024 * 1024, // 500MB
    })
  );

  const configService = app.get(ConfigService);
  // Precedence: PORT (explicit one-off or container override) > the named
  // variable from the root .env allocation block > 3000, which is the
  // compose-network port staging binds. Each service reads a DIFFERENT named
  // variable so one shared .env can allocate the whole stack — a bare PORT
  // there would make every service fight for the same number.
  const port = Number(
    configService.get('PORT') ?? configService.get('API_GATEWAY_PORT') ?? 3000,
  );
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: nodeEnv === 'production',
  });

  // Compression
  await app.register(compress, { encodings: ['gzip', 'deflate'] });

  await app.register(cookie, {
    secret: configService.get<string>('COOKIE_SECRET', 'tci-cookie-secret'),
  });

  // Enable multipart support
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
    },
  });

  // CORS configuration. Staging/production set CORS_ORIGINS (comma-separated,
  // e.g. the Caddy-served frontend origins); the localhost pair is the dev
  // fallback. Behind the staging edge the frontends are same-origin, so this
  // list only matters for cross-origin callers.
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? [
    'http://localhost:4000', // adjuster-portal
    'http://localhost:4001', // claimant-web
  ];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-Id'],
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
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('True Claim Insight API')
      .setDescription('API Gateway for True Claim Insight platform')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'access-token'
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management endpoints')
      .addTag('health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(`Swagger docs available at http://localhost:${port}/docs`);
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`API Gateway running on http://localhost:${port}`);
  logger.log(`Environment: ${nodeEnv}`);
}

bootstrap();
