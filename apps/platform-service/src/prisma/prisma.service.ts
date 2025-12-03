import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Explicitly set datasource URL to work around Windows Prisma bug
    const databaseUrl = process.env.DATABASE_URL ||
      'postgresql://mt5admin:mt5platform2024@127.0.0.1:5433/mt5_platform?schema=platform';

    super({
      log: process.env.NODE_ENV === 'development'
        ? ['info', 'warn', 'error']
        : ['error'],
      datasources: {
        db: {
          url: databaseUrl,
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

  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'production') {
      // Truncate all tables in reverse order of dependencies
      const tablenames = await this.$queryRaw<
        Array<{ tablename: string }>
      >`SELECT tablename FROM pg_tables WHERE schemaname='platform'`;

      for (const { tablename } of tablenames) {
        if (tablename !== '_prisma_migrations') {
          await this.$executeRawUnsafe(
            `TRUNCATE TABLE "platform"."${tablename}" CASCADE;`,
          );
        }
      }
    }
  }
}
