import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter, AllExceptionsFilter } from './filters';
import { ResponseInterceptor } from './interceptors';
import { EncryptionService } from './services/encryption.service';

/**
 * 公共模块
 * 提供全局异常过滤器、响应拦截器和公共服务
 */
@Global()
@Module({
  providers: [
    // 全局异常过滤器 (顺序重要: AllExceptionsFilter 在前作为兜底)
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // 全局响应拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // 公共服务
    EncryptionService,
  ],
  exports: [EncryptionService],
})
export class CommonModule {}
