/**
 * 限流服务单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService, RateLimitConfig, RATE_LIMIT_STRATEGIES } from '../rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                'redis.host': null, // 禁用 Redis，使用默认允许逻辑
                'redis.port': null,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('should allow requests when Redis is not available', async () => {
      const key = 'test-user-1';
      const config: RateLimitConfig = {
        name: 'test',
        windowSizeSeconds: 60,
        maxRequests: 10,
      };

      const result = await service.checkLimit(key, config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
      expect(result.limit).toBe(10);
    });

    it('should use predefined strategies', () => {
      // 验证预定义策略存在
      expect(RATE_LIMIT_STRATEGIES.general).toBeDefined();
      expect(RATE_LIMIT_STRATEGIES.login).toBeDefined();
      expect(RATE_LIMIT_STRATEGIES.register).toBeDefined();
      expect(RATE_LIMIT_STRATEGIES.sensitive).toBeDefined();
      expect(RATE_LIMIT_STRATEGIES.passwordReset).toBeDefined();
    });

    it('should have correct general strategy config', () => {
      const general = RATE_LIMIT_STRATEGIES.general;

      expect(general.name).toBe('general');
      expect(general.windowSizeSeconds).toBe(60);
      expect(general.maxRequests).toBe(100);
    });

    it('should have correct login strategy config', () => {
      const login = RATE_LIMIT_STRATEGIES.login;

      expect(login.name).toBe('login');
      expect(login.windowSizeSeconds).toBe(900); // 15 分钟
      // 开发环境 100次/15分钟, 生产环境 5次/15分钟
      const expectedMaxRequests = process.env.NODE_ENV === 'production' ? 5 : 100;
      expect(login.maxRequests).toBe(expectedMaxRequests);
    });

    it('should have correct register strategy config', () => {
      const register = RATE_LIMIT_STRATEGIES.register;

      expect(register.name).toBe('register');
      expect(register.windowSizeSeconds).toBe(3600); // 1 小时
      // 开发环境 30次/小时, 生产环境 3次/小时
      const expectedMaxRequests = process.env.NODE_ENV === 'production' ? 3 : 30;
      expect(register.maxRequests).toBe(expectedMaxRequests);
    });
  });

  describe('checkStrategyLimit', () => {
    it('should return allowed result for valid strategy', async () => {
      const result = await service.checkStrategyLimit('general', 'test-ip');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
    });

    it('should handle unknown strategy gracefully', async () => {
      const result = await service.checkStrategyLimit('unknown' as any, 'test-ip');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeGreaterThan(0);
    });
  });

  describe('resetLimit', () => {
    it('should return true when Redis is not available', async () => {
      const result = await service.resetLimit('test-key', 'general');

      expect(result).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return allowed status when Redis is not available', async () => {
      const status = await service.getStatus('test-key', 'general');

      expect(status.allowed).toBe(true);
      expect(status.current).toBe(0);
      expect(status.remaining).toBe(100);
    });
  });

  describe('generateKey', () => {
    it('should generate key with IP', () => {
      const key = service.generateKey({ ip: '192.168.1.1' });
      expect(key).toContain('ip:192.168.1.1');
    });

    it('should generate key with user ID', () => {
      const key = service.generateKey({ userId: 'user-123' });
      expect(key).toContain('user:user-123');
    });

    it('should generate key with tenant ID', () => {
      const key = service.generateKey({ tenantId: 'tenant-456' });
      expect(key).toContain('tenant:tenant-456');
    });

    it('should generate composite key', () => {
      const key = service.generateKey({
        tenantId: 'tenant-1',
        userId: 'user-1',
        ip: '127.0.0.1',
      });

      expect(key).toContain('tenant:tenant-1');
      expect(key).toContain('user:user-1');
      expect(key).toContain('ip:127.0.0.1');
    });

    it('should return global for empty options', () => {
      const key = service.generateKey({});
      expect(key).toBe('global');
    });
  });
});
