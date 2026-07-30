import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, SENSITIVE_FIELD_OMIT, type TciPrismaOptions } from '@tci/prisma-client';

@Injectable()
export class PrismaService
  extends PrismaClient<TciPrismaOptions>
  implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Ciphertext and blind indexes never leave the database by default.
      omit: SENSITIVE_FIELD_OMIT,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL +
            (process.env.DATABASE_URL?.includes('?') ? '&' : '?') +
            'connection_limit=5',
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Clean database for testing
   * Only available in test environment
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase only available in test environment');
    }

    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter(name => name !== '_prisma_migrations')
      .map(name => `"public"."${name}"`)
      .join(', ');

    try {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
      console.error('Error cleaning database:', error);
    }
  }
}
