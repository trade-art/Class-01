/**
 * 数据导出模块
 * 提供安全的数据导出功能
 */

import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { SecurityModule } from '../security/security.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [SecurityModule, PrismaModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
