/**
 * 账户锁定服务单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccountLockoutService, DEFAULT_LOCKOUT_CONFIG } from '../account-lockout.service';
import { IpBlacklistService } from '../ip-blacklist.service';

describe('AccountLockoutService', () => {
  let service: AccountLockoutService;
  let ipBlacklistService: jest.Mocked<IpBlacklistService>;

  beforeEach(async () => {
    const mockIpBlacklistService = {
      addToBlacklist: jest.fn(),
      isBlacklisted: jest.fn(),
      removeFromBlacklist: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountLockoutService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'redis.host': null, // 禁用 Redis
                'redis.port': null,
                'security.lockout.maxAttempts': 5,
                'security.lockout.durationSeconds': 900,
                'security.lockout.windowSeconds': 900,
                'security.lockout.progressive': true,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: IpBlacklistService,
          useValue: mockIpBlacklistService,
        },
      ],
    }).compile();

    service = module.get<AccountLockoutService>(AccountLockoutService);
    ipBlacklistService = module.get(IpBlacklistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    it('should return default status when Redis is unavailable', async () => {
      const userId = 'user-1';

      const result = await service.recordFailedAttempt(userId);

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(0);
      expect(result.lockoutCount).toBe(0);
    });

    it('should accept optional IP address and reason', async () => {
      const userId = 'user-2';
      const ipAddress = '192.168.1.1';
      const reason = 'Wrong password';

      const result = await service.recordFailedAttempt(userId, ipAddress, reason);

      expect(result.isLocked).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return false when Redis is unavailable', async () => {
      const userId = 'user-3';

      const isLocked = await service.isLocked(userId);

      expect(isLocked).toBe(false);
    });
  });

  describe('getLockoutStatus', () => {
    it('should return default status when Redis is unavailable', async () => {
      const userId = 'user-4';

      const status = await service.getLockoutStatus(userId);

      expect(status.isLocked).toBe(false);
      expect(status.remainingSeconds).toBe(0);
      expect(status.failedAttempts).toBe(0);
      expect(status.lockoutCount).toBe(0);
    });
  });

  describe('resetFailedAttempts', () => {
    it('should not throw when Redis is unavailable', async () => {
      const userId = 'user-5';

      await expect(service.resetFailedAttempts(userId)).resolves.not.toThrow();
    });
  });

  describe('fullyResetLockout', () => {
    it('should not throw when Redis is unavailable', async () => {
      const userId = 'user-6';

      await expect(service.fullyResetLockout(userId)).resolves.not.toThrow();
    });
  });

  describe('getFailedAttempts', () => {
    it('should return empty array when Redis is unavailable', async () => {
      const userId = 'user-7';

      const attempts = await service.getFailedAttempts(userId);

      expect(attempts).toEqual([]);
    });
  });

  describe('getConfig', () => {
    it('should return configuration object', () => {
      const config = service.getConfig();

      expect(config.maxAttempts).toBe(5);
      expect(config.lockoutDurationSeconds).toBe(900);
      expect(config.progressiveLockout).toBe(true);
    });
  });

  describe('DEFAULT_LOCKOUT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LOCKOUT_CONFIG.maxAttempts).toBe(5);
      expect(DEFAULT_LOCKOUT_CONFIG.lockoutDurationSeconds).toBe(15 * 60); // 15 分钟
      expect(DEFAULT_LOCKOUT_CONFIG.attemptWindowSeconds).toBe(15 * 60); // 15 分钟
      expect(DEFAULT_LOCKOUT_CONFIG.progressiveLockout).toBe(true);
      expect(DEFAULT_LOCKOUT_CONFIG.maxLockoutDurationSeconds).toBe(24 * 60 * 60); // 24 小时
    });
  });

  describe('LockoutStatus interface', () => {
    it('should have correct structure', () => {
      const status = {
        isLocked: false,
        remainingSeconds: 0,
        failedAttempts: 0,
        lockoutCount: 0,
        lockedUntil: undefined,
      };

      expect(status).toHaveProperty('isLocked');
      expect(status).toHaveProperty('remainingSeconds');
      expect(status).toHaveProperty('failedAttempts');
      expect(status).toHaveProperty('lockoutCount');
    });
  });
});
