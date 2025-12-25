/**
 * RateLimiterService Mock
 * 用于 E2E 测试，绕过 Redis 频率限制
 */

import { RateLimitResult } from '../../src/security/rate-limiter.service';

/**
 * Mock RateLimiterService
 * 始终允许请求通过，避免测试受频率限制影响
 */
export class MockRateLimiterService {
  private readonly defaultResult: RateLimitResult = {
    allowed: true,
    current: 1,
    limit: 100,
    remaining: 99,
    resetAt: Date.now() + 60000, // 时间戳，不是 Date 对象
    retryAfter: 0,
  };

  /**
   * 检查请求是否允许 - 始终返回允许
   */
  checkLimit = jest.fn().mockResolvedValue(this.defaultResult);

  /**
   * 检查登录请求
   */
  checkLoginLimit = jest.fn().mockResolvedValue(this.defaultResult);

  /**
   * 检查通用请求
   */
  checkGeneralLimit = jest.fn().mockResolvedValue(this.defaultResult);

  /**
   * 检查敏感操作
   */
  checkSensitiveLimit = jest.fn().mockResolvedValue(this.defaultResult);

  /**
   * 检查 API Key 请求限制
   */
  checkApiKeyLimit = jest.fn().mockResolvedValue(this.defaultResult);

  /**
   * 重置限制
   */
  resetLimit = jest.fn().mockResolvedValue(undefined);

  /**
   * 获取限制状态
   */
  getStatus = jest.fn().mockResolvedValue({
    current: 0,
    limit: 100,
    remaining: 100,
    resetAt: Date.now() + 60000,
  });

  /**
   * 生成限流键
   */
  generateKey = jest.fn().mockImplementation((options: {
    ip?: string;
    userId?: string;
    tenantId?: string;
    endpoint?: string;
  }): string => {
    const parts: string[] = [];
    if (options.tenantId) {
      parts.push(`tenant:${options.tenantId}`);
    }
    if (options.userId) {
      parts.push(`user:${options.userId}`);
    }
    if (options.ip) {
      parts.push(`ip:${options.ip}`);
    }
    if (options.endpoint) {
      parts.push(`endpoint:${options.endpoint}`);
    }
    return parts.join(':') || 'global';
  });

  /**
   * 检查频率限制是否启用
   */
  isRateLimitEnabled = jest.fn().mockReturnValue(true);

  /**
   * 模块初始化钩子
   */
  onModuleInit = jest.fn().mockResolvedValue(undefined);

  /**
   * 模块销毁钩子
   */
  onModuleDestroy = jest.fn().mockResolvedValue(undefined);

  /**
   * 重置所有 mock
   */
  resetMocks(): void {
    this.checkLimit.mockClear();
    this.checkLoginLimit.mockClear();
    this.checkGeneralLimit.mockClear();
    this.checkSensitiveLimit.mockClear();
    this.checkApiKeyLimit.mockClear();
    this.resetLimit.mockClear();
    this.getStatus.mockClear();
    this.generateKey.mockClear();
    this.isRateLimitEnabled.mockClear();
    this.onModuleInit.mockClear();
    this.onModuleDestroy.mockClear();
  }
}
