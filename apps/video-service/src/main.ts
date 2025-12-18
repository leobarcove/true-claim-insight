import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      },
    }),
  );

  const configService = app.get(ConfigService);

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // Compression
  await app.register(compression, { encodings: ['gzip', 'deflate'] });

  // CORS - allow frontend apps
  app.enableCors({
    origin: [
      'http://localhost:4000', // adjuster-portal
      'http://localhost:4001', // claimant-web
    ],
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
      'access-token',
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

  const port = configService.get<number>('PORT', 3002);
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
