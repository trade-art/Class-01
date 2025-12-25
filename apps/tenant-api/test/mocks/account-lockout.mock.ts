/**
 * AccountLockoutService Mock
 * 用于 E2E 测试，绕过 Redis 锁定机制
 */

import { LockoutStatus } from '../../src/security/account-lockout.service';

/**
 * Mock AccountLockoutService
 * 始终返回未锁定状态，避免测试间相互影响
 */
export class MockAccountLockoutService {
  private readonly defaultStatus: LockoutStatus = {
    isLocked: false,
    remainingSeconds: 0,
    failedAttempts: 0,
    lockoutCount: 0,
  };

  /**
   * 获取锁定状态 - 始终返回未锁定
   */
  getLockoutStatus = jest.fn().mockResolvedValue(this.defaultStatus);

  /**
   * 记录失败尝试 - 不执行实际锁定
   */
  recordFailedAttempt = jest.fn().mockResolvedValue(this.defaultStatus);

  /**
   * 重置失败尝试
   */
  resetFailedAttempts = jest.fn().mockResolvedValue(undefined);

  /**
   * 完全重置锁定状态
   */
  fullyResetLockout = jest.fn().mockResolvedValue(undefined);

  /**
   * 检查是否锁定 - 始终返回 false
   */
  isLocked = jest.fn().mockResolvedValue(false);

  /**
   * 获取失败尝试历史 - 返回空数组
   */
  getFailedAttempts = jest.fn().mockResolvedValue([]);

  /**
   * 获取配置
   */
  getConfig = jest.fn().mockReturnValue({
    maxAttempts: 5,
    lockoutDurationSeconds: 900,
    attemptWindowSeconds: 900,
    progressiveLockout: true,
    maxLockoutDurationSeconds: 86400,
  });

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
    this.getLockoutStatus.mockClear();
    this.recordFailedAttempt.mockClear();
    this.resetFailedAttempts.mockClear();
    this.fullyResetLockout.mockClear();
    this.isLocked.mockClear();
    this.getFailedAttempts.mockClear();
    this.getConfig.mockClear();
    this.onModuleInit.mockClear();
    this.onModuleDestroy.mockClear();
  }
}
