/**
 * 限流装饰器
 * 用于配置 API 端点的限流规则
 */

import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_STRATEGIES, RateLimitConfig } from './rate-limiter.service';

/**
 * 限流配置元数据键
 */
export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * 限流选项
 */
export interface RateLimitOptions {
  /** 使用预定义策略名称 */
  strategy?: keyof typeof RATE_LIMIT_STRATEGIES;
  /** 自定义配置 (覆盖策略) */
  config?: Partial<RateLimitConfig>;
  /** 是否跳过限流 */
  skip?: boolean;
  /** 自定义键生成函数 */
  keyGenerator?: 'ip' | 'user' | 'tenant' | 'composite';
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 限流装饰器
 * @param options 限流选项
 *
 * @example
 * ```typescript
 * // 使用预定义策略
 * @RateLimit({ strategy: 'login' })
 * async login() {}
 *
 * // 使用自定义配置
 * @RateLimit({
 *   config: { windowSizeSeconds: 60, maxRequests: 10 }
 * })
 * async customEndpoint() {}
 *
 * // 跳过限流
 * @RateLimit({ skip: true })
 * async skipLimit() {}
 * ```
 */
export const RateLimit = (options: RateLimitOptions = {}) => {
  return SetMetadata(RATE_LIMIT_KEY, options);
};

/**
 * 登录限流装饰器 (5次/15分钟)
 */
export const LoginRateLimit = () => RateLimit({ strategy: 'login' });

/**
 * 注册限流装饰器 (3次/小时)
 */
export const RegisterRateLimit = () => RateLimit({ strategy: 'register' });

/**
 * 敏感操作限流装饰器 (10次/分钟/用户)
 */
export const SensitiveRateLimit = () =>
  RateLimit({ strategy: 'sensitive', keyGenerator: 'user' });

/**
 * 密码重置限流装饰器 (3次/小时)
 */
export const PasswordResetRateLimit = () => RateLimit({ strategy: 'passwordReset' });

/**
 * 导出限流装饰器 (5次/小时/用户)
 */
export const ExportRateLimit = () =>
  RateLimit({ strategy: 'export', keyGenerator: 'user' });

/**
 * 高频 API 限流装饰器 (1000次/分钟/租户)
 */
export const HighFrequencyRateLimit = () =>
  RateLimit({ strategy: 'highFrequency', keyGenerator: 'tenant' });

/**
 * 跳过限流装饰器
 */
export const SkipRateLimit = () => RateLimit({ skip: true });

/**
 * 自定义限流装饰器
 * @param maxRequests 最大请求数
 * @param windowSeconds 时间窗口 (秒)
 */
export const CustomRateLimit = (maxRequests: number, windowSeconds: number) =>
  RateLimit({
    config: {
      name: 'custom',
      windowSizeSeconds: windowSeconds,
      maxRequests,
    },
  });
