/**
 * 指标模块
 * 提供 Prometheus 指标收集功能的 NestJS 模块
 */

import { Module, DynamicModule, Global, Provider } from '@nestjs/common';
import { MetricsService, MetricsConfig } from './metrics.service';

/**
 * 指标配置 token
 */
export const METRICS_CONFIG = 'METRICS_CONFIG';

/**
 * 异步模块配置选项
 */
export interface MetricsModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<MetricsConfig> | MetricsConfig;
}

@Global()
@Module({})
export class MetricsModule {
  /**
   * 同步配置模块
   */
  static forRoot(config: MetricsConfig = {}): DynamicModule {
    const metricsServiceProvider: Provider = {
      provide: MetricsService,
      useFactory: () => new MetricsService(config),
    };

    return {
      module: MetricsModule,
      providers: [
        {
          provide: METRICS_CONFIG,
          useValue: config,
        },
        metricsServiceProvider,
      ],
      exports: [MetricsService, METRICS_CONFIG],
    };
  }

  /**
   * 异步配置模块
   */
  static forRootAsync(options: MetricsModuleAsyncOptions): DynamicModule {
    const metricsServiceProvider: Provider = {
      provide: MetricsService,
      useFactory: (config: MetricsConfig) => new MetricsService(config),
      inject: [METRICS_CONFIG],
    };

    const asyncConfigProvider: Provider = {
      provide: METRICS_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: MetricsModule,
      imports: options.imports || [],
      providers: [asyncConfigProvider, metricsServiceProvider],
      exports: [MetricsService, METRICS_CONFIG],
    };
  }

  /**
   * 创建特性模块（用于非全局导入）
   */
  static forFeature(config: MetricsConfig = {}): DynamicModule {
    return {
      module: MetricsModule,
      providers: [
        {
          provide: METRICS_CONFIG,
          useValue: config,
        },
        {
          provide: MetricsService,
          useFactory: () => new MetricsService(config),
        },
      ],
      exports: [MetricsService],
    };
  }
}
