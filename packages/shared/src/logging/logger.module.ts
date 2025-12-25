/**
 * 日志模块
 * 提供全局日志服务，支持动态配置
 */

import { DynamicModule, Global, Module, Provider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { StructuredLoggerService, LoggerConfig } from './logger.service';

/**
 * 异步配置选项
 */
export interface LoggerModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<LoggerConfig> | LoggerConfig;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  imports?: unknown[];
}

/**
 * Logger 模块配置 token
 */
export const LOGGER_CONFIG = 'LOGGER_CONFIG';

@Global()
@Module({})
export class LoggerModule {
  /**
   * 同步注册
   */
  static forRoot(config: LoggerConfig = {}): DynamicModule {
    const loggerProvider: Provider = {
      provide: StructuredLoggerService,
      useFactory: () => new StructuredLoggerService(config),
    };

    return {
      module: LoggerModule,
      providers: [
        {
          provide: LOGGER_CONFIG,
          useValue: config,
        },
        loggerProvider,
      ],
      exports: [StructuredLoggerService, LOGGER_CONFIG],
    };
  }

  /**
   * 异步注册
   */
  static forRootAsync(options: LoggerModuleAsyncOptions): DynamicModule {
    const loggerProvider: Provider = {
      provide: StructuredLoggerService,
      useFactory: async (...args: unknown[]) => {
        const config = await options.useFactory(...args);
        return new StructuredLoggerService(config);
      },
      inject: options.inject || [],
    };

    return {
      module: LoggerModule,
      imports: options.imports as DynamicModule[] || [],
      providers: [
        {
          provide: LOGGER_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        loggerProvider,
      ],
      exports: [StructuredLoggerService, LOGGER_CONFIG],
    };
  }

  /**
   * 功能模块注册（非全局）
   */
  static forFeature(config: LoggerConfig = {}): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: StructuredLoggerService,
          useFactory: () => new StructuredLoggerService(config),
        },
      ],
      exports: [StructuredLoggerService],
    };
  }
}
