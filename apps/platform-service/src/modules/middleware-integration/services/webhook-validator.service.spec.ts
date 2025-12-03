/**
 * WebhookValidatorService 单元测试
 *
 * 测试内容:
 * - HMAC-SHA256 签名验证
 * - 时间戳有效性检查
 * - 时间安全比较
 * - Secret 生成
 *
 * middleware-integration Task 8.6
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WebhookValidatorService } from './webhook-validator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createHmac } from 'crypto';

describe('WebhookValidatorService', () => {
  let service: WebhookValidatorService;
  let prismaService: {
    middlewareInstance: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockSecret = 'whsec_test-secret-12345';
  const mockInstanceId = 'test-instance-id';

  // 辅助函数：生成有效签名
  const generateSignature = (secret: string, timestamp: string, body: string): string => {
    const payload = `${timestamp}.${body}`;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  };

  beforeEach(async () => {
    prismaService = {
      middlewareInstance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookValidatorService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<WebhookValidatorService>(WebhookValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateWebhook', () => {
    it('有效签名应通过验证', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, timestamp, body);

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        timestamp,
        body,
      );

      expect(result.isValid).toBe(true);
      expect(result.instanceId).toBe(mockInstanceId);
    });

    it('无效签名应验证失败', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const invalidSignature = 'sha256=invalid-signature';

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        invalidSignature,
        timestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('过期时间戳应验证失败', async () => {
      // 10 分钟前的时间戳
      const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, expiredTimestamp, body);

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        expiredTimestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Timestamp expired or invalid');
    });

    it('未来时间戳 (在有效期内) 应通过验证', async () => {
      // 2 分钟后的时间戳 (在 5 分钟有效期内)
      const futureTimestamp = (Date.now() + 2 * 60 * 1000).toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, futureTimestamp, body);

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        futureTimestamp,
        body,
      );

      expect(result.isValid).toBe(true);
    });

    it('无效时间戳格式应验证失败', async () => {
      const invalidTimestamp = 'not-a-number';
      const body = '{"event":"test"}';
      const signature = 'sha256=any';

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        invalidTimestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Timestamp expired or invalid');
    });

    it('实例不存在应验证失败', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const signature = 'sha256=any';

      prismaService.middlewareInstance.findUnique.mockResolvedValue(null);

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        timestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Instance not found');
    });

    it('未配置 Webhook Secret 应验证失败', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const signature = 'sha256=any';

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: null,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        timestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Webhook secret not configured for this instance');
    });

    it('数据库错误应返回验证失败', async () => {
      prismaService.middlewareInstance.findUnique.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await service.validateWebhook(
        mockInstanceId,
        'sha256=any',
        Date.now().toString(),
        '{}',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('修改后的请求体应验证失败', async () => {
      const timestamp = Date.now().toString();
      const originalBody = '{"event":"test"}';
      const modifiedBody = '{"event":"modified"}';
      const signature = generateSignature(mockSecret, timestamp, originalBody);

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        timestamp,
        modifiedBody,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('generateWebhookSecret', () => {
    it('应生成新的 Webhook Secret', async () => {
      prismaService.middlewareInstance.update.mockResolvedValue({
        id: mockInstanceId,
      });

      const secret = await service.generateWebhookSecret(mockInstanceId);

      expect(secret).toMatch(/^whsec_[A-Za-z0-9]{32}$/);
      expect(prismaService.middlewareInstance.update).toHaveBeenCalledWith({
        where: { id: mockInstanceId },
        data: { webhookSecret: secret },
      });
    });

    it('生成的 Secret 应该唯一', async () => {
      prismaService.middlewareInstance.update.mockResolvedValue({
        id: mockInstanceId,
      });

      const secret1 = await service.generateWebhookSecret(mockInstanceId);
      const secret2 = await service.generateWebhookSecret(mockInstanceId);

      expect(secret1).not.toBe(secret2);
    });
  });

  describe('签名格式', () => {
    it('签名应以 sha256= 开头', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, timestamp, body);

      expect(signature.startsWith('sha256=')).toBe(true);
    });

    it('签名应为小写十六进制', async () => {
      const timestamp = Date.now().toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, timestamp, body);

      const hexPart = signature.replace('sha256=', '');
      expect(hexPart).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('时间窗口边界', () => {
    it('刚好在 5 分钟边界内应通过', async () => {
      // 4 分 59 秒前
      const timestamp = (Date.now() - 4 * 60 * 1000 - 59 * 1000).toString();
      const body = '{"event":"test"}';
      const signature = generateSignature(mockSecret, timestamp, body);

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        signature,
        timestamp,
        body,
      );

      expect(result.isValid).toBe(true);
    });

    it('刚好超过 5 分钟应失败', async () => {
      // 5 分 1 秒前
      const timestamp = (Date.now() - 5 * 60 * 1000 - 1000).toString();
      const body = '{"event":"test"}';

      prismaService.middlewareInstance.findUnique.mockResolvedValue({
        id: mockInstanceId,
        webhookSecret: mockSecret,
      });

      const result = await service.validateWebhook(
        mockInstanceId,
        'sha256=any',
        timestamp,
        body,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Timestamp expired or invalid');
    });
  });
});
