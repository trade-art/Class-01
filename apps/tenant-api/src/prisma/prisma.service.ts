import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 服务
 * 共享 platform-service 的数据库 schema
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 使用与 platform-service 相同的数据库连接
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
}
