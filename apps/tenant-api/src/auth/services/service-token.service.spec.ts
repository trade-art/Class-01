/**
 * ServiceTokenService 单元测试
 *
 * 测试覆盖：
 * - Token 生成
 * - Token 验证
 * - Token 刷新
 * - 密码加密/解密
 * - 边界情况处理
 *
 * Requirements: REQ-ST1.1, REQ-ST1.2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  ServiceTokenService,
  ServiceTokenPayload,
  GenerateTokenRequest,
} from './service-token.service';

describe('ServiceTokenService', () => {
  let service: ServiceTokenService;

  // 测试用的固定配置
  const TEST_JWT_SECRET = 'test-jwt-secret-key-for-unit-tests-only';
  const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const TEST_EXPIRES_IN = 3600;
  const TEST_ISSUER = 'test-issuer';

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'serviceToken.jwtSecret': TEST_JWT_SECRET,
        'serviceToken.encryptionKey': TEST_ENCRYPTION_KEY,
        'serviceToken.expiresIn': TEST_EXPIRES_IN,
        'serviceToken.issuer': TEST_ISSUER,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceTokenService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ServiceTokenService>(ServiceTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw error if encryption key is not 32 bytes', async () => {
      const invalidConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, any> = {
            'serviceToken.jwtSecret': TEST_JWT_SECRET,
            'serviceToken.encryptionKey': '0123456789abcdef', // 只有 8 字节
            'serviceToken.expiresIn': TEST_EXPIRES_IN,
            'serviceToken.issuer': TEST_ISSUER,
          };
          return config[key];
        }),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            ServiceTokenService,
            {
              provide: ConfigService,
              useValue: invalidConfigService,
            },
          ],
        }).compile(),
      ).rejects.toThrow('32 bytes');
    });
  });

  describe('generateToken', () => {
    const validRequest: GenerateTokenRequest = {
      tenantId: 'tenant-123',
      instanceId: 'instance-456',
      serverId: 'server-789',
      managerLogin: 10007,
      managerPassword: 'test-password',
      scopes: ['trade:read', 'account:read'],
    };

    it('should generate a valid JWT token', () => {
      const result = service.generateToken(validRequest);

      expect(result.token).toBeDefined();
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should include correct payload in token', () => {
      const result = service.generateToken(validRequest);

      const decoded = jwt.verify(result.token, TEST_JWT_SECRET) as ServiceTokenPayload;

      expect(decoded.tenantId).toBe(validRequest.tenantId);
      expect(decoded.instanceId).toBe(validRequest.instanceId);
      expect(decoded.serverId).toBe(validRequest.serverId);
      expect(decoded.managerLogin).toBe(validRequest.managerLogin);
      expect(decoded.scopes).toEqual(validRequest.scopes);
      expect(decoded.encryptedPassword).toBeDefined();
      expect(decoded.iss).toBe(TEST_ISSUER);
    });

    it('should use default scopes when not provided', () => {
      const requestWithoutScopes: GenerateTokenRequest = {
        ...validRequest,
        scopes: undefined,
      };

      const result = service.generateToken(requestWithoutScopes);
      const decoded = jwt.verify(result.token, TEST_JWT_SECRET) as ServiceTokenPayload;

      expect(decoded.scopes).toEqual(['*']);
    });

    it('should use custom expiresIn when provided', () => {
      const customExpiry = 7200; // 2 小时
      const requestWithCustomExpiry: GenerateTokenRequest = {
        ...validRequest,
        expiresIn: customExpiry,
      };

      const now = Math.floor(Date.now() / 1000);
      const result = service.generateToken(requestWithCustomExpiry);

      // 验证过期时间在预期范围内 (允许 5 秒误差)
      expect(result.expiresAt).toBeGreaterThanOrEqual(now + customExpiry - 5);
      expect(result.expiresAt).toBeLessThanOrEqual(now + customExpiry + 5);
    });

    it('should encrypt password in token', () => {
      const result = service.generateToken(validRequest);
      const decoded = jwt.verify(result.token, TEST_JWT_SECRET) as ServiceTokenPayload;

      // 加密后的密码应该是 Base64 编码的
      expect(decoded.encryptedPassword).toMatch(/^[A-Za-z0-9+/]+=*$/);
      // 加密后的密码不应该包含原始密码
      expect(decoded.encryptedPassword).not.toContain(validRequest.managerPassword);
    });
  });

  describe('validateToken', () => {
    const validRequest: GenerateTokenRequest = {
      tenantId: 'tenant-123',
      instanceId: 'instance-456',
      serverId: 'server-789',
      managerLogin: 10007,
      managerPassword: 'test-password',
      scopes: ['trade:read'],
    };

    it('should validate a valid token', () => {
      const { token } = service.generateToken(validRequest);
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.tenantId).toBe(validRequest.tenantId);
      expect(result.decryptedPassword).toBe(validRequest.managerPassword);
    });

    it('should reject expired token', async () => {
      // 生成一个立即过期的 token
      const expiredRequest: GenerateTokenRequest = {
        ...validRequest,
        expiresIn: 1, // 1 秒后过期
      };

      const { token } = service.generateToken(expiredRequest);

      // 等待 token 过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = service.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should allow ignoring expiration', async () => {
      // 生成一个立即过期的 token
      const expiredRequest: GenerateTokenRequest = {
        ...validRequest,
        expiresIn: 1,
      };

      const { token } = service.generateToken(expiredRequest);

      // 等待 token 过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = service.validateToken(token, { ignoreExpiration: true });

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('should reject token with invalid signature', () => {
      const { token } = service.generateToken(validRequest);

      // 篡改 token (改变最后几个字符)
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      const result = service.validateToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('should reject malformed token', () => {
      const result = service.validateToken('not-a-valid-jwt');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('should reject token with wrong issuer', () => {
      // 使用不同的 issuer 生成 token
      const wrongIssuerToken = jwt.sign(
        {
          tenantId: 'tenant-123',
          instanceId: 'instance-456',
          serverId: 'server-789',
          managerLogin: 10007,
          encryptedPassword: 'encrypted',
          scopes: ['*'],
        },
        TEST_JWT_SECRET,
        { issuer: 'wrong-issuer', expiresIn: 3600 },
      );

      const result = service.validateToken(wrongIssuerToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
    });
  });

  describe('refreshToken', () => {
    const validRequest: GenerateTokenRequest = {
      tenantId: 'tenant-123',
      instanceId: 'instance-456',
      serverId: 'server-789',
      managerLogin: 10007,
      managerPassword: 'test-password',
      scopes: ['trade:read', 'account:read'],
    };

    it('should refresh a valid token', () => {
      const original = service.generateToken(validRequest);
      const refreshed = service.refreshToken(original.token, validRequest.managerPassword);

      expect(refreshed.token).toBeDefined();
      expect(refreshed.token).not.toBe(original.token);
      expect(refreshed.tokenType).toBe('Bearer');
    });

    it('should preserve payload when refreshing', () => {
      const original = service.generateToken(validRequest);
      const refreshed = service.refreshToken(original.token, validRequest.managerPassword);

      const decoded = jwt.verify(refreshed.token, TEST_JWT_SECRET) as ServiceTokenPayload;

      expect(decoded.tenantId).toBe(validRequest.tenantId);
      expect(decoded.instanceId).toBe(validRequest.instanceId);
      expect(decoded.serverId).toBe(validRequest.serverId);
      expect(decoded.managerLogin).toBe(validRequest.managerLogin);
      expect(decoded.scopes).toEqual(validRequest.scopes);
    });

    it('should use new expiry when provided', () => {
      const original = service.generateToken(validRequest);
      const newExpiry = 7200;
      const refreshed = service.refreshToken(original.token, validRequest.managerPassword, newExpiry);

      const now = Math.floor(Date.now() / 1000);
      expect(refreshed.expiresAt).toBeGreaterThanOrEqual(now + newExpiry - 5);
      expect(refreshed.expiresAt).toBeLessThanOrEqual(now + newExpiry + 5);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        service.refreshToken('invalid-token', validRequest.managerPassword);
      }).toThrow();
    });

    it('should allow refreshing expired token', async () => {
      const expiredRequest: GenerateTokenRequest = {
        ...validRequest,
        expiresIn: 1,
      };

      const original = service.generateToken(expiredRequest);

      // 等待 token 过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 应该能够刷新过期的 token
      const refreshed = service.refreshToken(original.token, validRequest.managerPassword);
      expect(refreshed.token).toBeDefined();
    });
  });

  describe('encryptPassword / decryptPassword', () => {
    const testPasswords = [
      'simple',
      'complex-password-123!@#',
      '中文密码',
      'émojis-🔐-password',
      '',
      'a'.repeat(100), // 长密码
    ];

    it.each(testPasswords)('should encrypt and decrypt password: %s', (password) => {
      const encrypted = service.encryptPassword(password);
      const decrypted = service.decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const password = 'test-password';
      const encrypted1 = service.encryptPassword(password);
      const encrypted2 = service.encryptPassword(password);

      expect(encrypted1).not.toBe(encrypted2);

      // 但解密后应该相同
      expect(service.decryptPassword(encrypted1)).toBe(password);
      expect(service.decryptPassword(encrypted2)).toBe(password);
    });

    it('should fail to decrypt with tampered ciphertext', () => {
      const password = 'test-password';
      const encrypted = service.encryptPassword(password);

      // 篡改密文
      const tamperedEncrypted = 'A' + encrypted.slice(1);

      expect(() => {
        service.decryptPassword(tamperedEncrypted);
      }).toThrow();
    });

    it('should produce Base64 encoded output', () => {
      const encrypted = service.encryptPassword('test');
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('getTokenRemainingTime', () => {
    it('should return remaining time for valid token', () => {
      const expiresIn = 3600;
      const { token } = service.generateToken({
        tenantId: 'tenant-123',
        instanceId: 'instance-456',
        serverId: 'server-789',
        managerLogin: 10007,
        managerPassword: 'test',
        expiresIn,
      });

      const remaining = service.getTokenRemainingTime(token);

      // 允许 5 秒误差
      expect(remaining).toBeGreaterThanOrEqual(expiresIn - 5);
      expect(remaining).toBeLessThanOrEqual(expiresIn);
    });

    it('should return 0 for expired token', async () => {
      const { token } = service.generateToken({
        tenantId: 'tenant-123',
        instanceId: 'instance-456',
        serverId: 'server-789',
        managerLogin: 10007,
        managerPassword: 'test',
        expiresIn: 1,
      });

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const remaining = service.getTokenRemainingTime(token);
      expect(remaining).toBe(0);
    });

    it('should return -1 for invalid token', () => {
      const remaining = service.getTokenRemainingTime('invalid-token');
      expect(remaining).toBe(-1);
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return true when token expires within threshold', () => {
      const { token } = service.generateToken({
        tenantId: 'tenant-123',
        instanceId: 'instance-456',
        serverId: 'server-789',
        managerLogin: 10007,
        managerPassword: 'test',
        expiresIn: 100, // 100 秒后过期
      });

      // 使用 200 秒的阈值，应该返回 true
      expect(service.isTokenExpiringSoon(token, 200)).toBe(true);

      // 使用 50 秒的阈值，应该返回 false
      expect(service.isTokenExpiringSoon(token, 50)).toBe(false);
    });

    it('should return true for expired token', async () => {
      const { token } = service.generateToken({
        tenantId: 'tenant-123',
        instanceId: 'instance-456',
        serverId: 'server-789',
        managerLogin: 10007,
        managerPassword: 'test',
        expiresIn: 1,
      });

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(service.isTokenExpiringSoon(token)).toBe(true);
    });

    it('should return false for invalid token', () => {
      expect(service.isTokenExpiringSoon('invalid-token')).toBe(false);
    });
  });
});
