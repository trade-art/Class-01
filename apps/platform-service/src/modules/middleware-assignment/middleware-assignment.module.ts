import { Module } from '@nestjs/common';
import { MiddlewareAssignmentController } from './middleware-assignment.controller';
import { MiddlewareAssignmentService } from './middleware-assignment.service';

/**
 * 中间件分配管理模块
 * 管理中间件与租户之间的分配关系
 */
@Module({
  controllers: [MiddlewareAssignmentController],
  providers: [MiddlewareAssignmentService],
  exports: [MiddlewareAssignmentService],
})
export class MiddlewareAssignmentModule {}
