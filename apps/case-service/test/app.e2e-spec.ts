import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

describe('Case Service (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Checks', () => {
    it('/api/v1/health/liveness (GET)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/liveness',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toHaveProperty('status', 'ok');
    });
  });

  describe('Claims', () => {
    it('/api/v1/claims (GET) - should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claims',
      });

      // Without auth, should return 401
      expect(response.statusCode).toBe(401);
    });
  });
});
