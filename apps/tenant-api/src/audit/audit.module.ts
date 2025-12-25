/**
 * 审计模块
 * 提供审计日志查询 API
 */

import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
