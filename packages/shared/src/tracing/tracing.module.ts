/**
 * 追踪模块
 * 提供分布式追踪功能的 NestJS 模块
 */

import { Module, DynamicModule, Global, Provider } from '@nestjs/common';
import { TracingService, TracingConfig } from './tracing.service';

/**
 * 追踪配置 token
 */
export const TRACING_CONFIG = 'TRACING_CONFIG';

/**
 * 异步模块配置选项
 */
export interface TracingModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<TracingConfig> | TracingConfig;
}

@Global()
@Module({})
export class TracingModule {
  /**
   * 同步配置模块
   */
  static forRoot(config: TracingConfig = {}): DynamicModule {
    const tracingServiceProvider: Provider = {
      provide: TracingService,
      useFactory: () => new TracingService(config),
    };

    return {
      module: TracingModule,
      providers: [
        {
          provide: TRACING_CONFIG,
          useValue: config,
        },
        tracingServiceProvider,
      ],
      exports: [TracingService, TRACING_CONFIG],
    };
  }

  /**
   * 异步配置模块
   */
  static forRootAsync(options: TracingModuleAsyncOptions): DynamicModule {
    const tracingServiceProvider: Provider = {
      provide: TracingService,
      useFactory: (config: TracingConfig) => new TracingService(config),
      inject: [TRACING_CONFIG],
    };

    const asyncConfigProvider: Provider = {
      provide: TRACING_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: TracingModule,
      imports: options.imports || [],
      providers: [asyncConfigProvider, tracingServiceProvider],
      exports: [TracingService, TRACING_CONFIG],
    };
  }

  /**
   * 创建特性模块（用于非全局导入）
   */
  static forFeature(config: TracingConfig = {}): DynamicModule {
    return {
      module: TracingModule,
      providers: [
        {
          provide: TRACING_CONFIG,
          useValue: config,
        },
        {
          provide: TracingService,
          useFactory: () => new TracingService(config),
        },
      ],
      exports: [TracingService],
    };
  }
}
