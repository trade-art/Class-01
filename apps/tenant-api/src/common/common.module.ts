import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter, HttpExceptionFilter } from './filters';
import { ResponseInterceptor } from './interceptors';
import { CacheService } from './services';

/**
 * 公共模块
 * 提供全局异常过滤器、响应拦截器和缓存服务
 */
@Global()
@Module({
  providers: [
    // 注意：过滤器按注册顺序的逆序执行
    // AllExceptionsFilter 作为兜底，需要先注册
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // Redis 缓存服务
    CacheService,
  ],
  exports: [CacheService],
})
export class CommonModule {}
