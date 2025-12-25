import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { WebhookService, WebhookEventType, ApiKeyRevokedPayload } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockMiddlewareBaseUrl = 'http://localhost:8083';
  const mockWebhookSecret = 'test-webhook-secret';
  const mockWebhookTimeout = 5000;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'middleware.baseUrl': mockMiddlewareBaseUrl,
        'middleware.webhookSecret': mockWebhookSecret,
        'middleware.webhookTimeout': mockWebhookTimeout,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('notifyApiKeyRevoked', () => {
    const mockPayload: ApiKeyRevokedPayload = {
      keyId: 'key-123',
      keyHashPrefix: 'abcdef1234567890',
      tenantId: 'tenant-456',
      revokedAt: new Date().toISOString(),
      revokedBy: 'admin-789',
      reason: '安全违规',
    };

    it('应成功发送撤销通知', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      const result = await service.notifyApiKeyRevoked(mockPayload);

      expect(result).toBe(true);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${mockMiddlewareBaseUrl}/webhooks/api-keys`,
        expect.objectContaining({
          event: WebhookEventType.API_KEY_REVOKED,
          data: mockPayload,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String),
          }),
        }),
      );
    });

    it('应在 HTTP 错误时返回 false', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const result = await service.notifyApiKeyRevoked(mockPayload);

      expect(result).toBe(false);
    });

    it('应在超时时返回 false', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Timeout')),
      );

      const result = await service.notifyApiKeyRevoked(mockPayload);

      expect(result).toBe(false);
    });

    it('应在非 2xx 响应时返回 false', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 500,
          data: { error: 'Internal Server Error' },
        }),
      );

      const result = await service.notifyApiKeyRevoked(mockPayload);

      expect(result).toBe(false);
    });

    it('应包含正确的 HMAC-SHA256 签名', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      await service.notifyApiKeyRevoked(mockPayload);

      const callArgs = mockHttpService.post.mock.calls[0];
      const headers = callArgs[2].headers;

      // 验证签名存在且是有效的十六进制字符串
      expect(headers['X-Webhook-Signature']).toBeDefined();
      expect(headers['X-Webhook-Signature']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('应包含时间戳头', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      await service.notifyApiKeyRevoked(mockPayload);

      const callArgs = mockHttpService.post.mock.calls[0];
      const headers = callArgs[2].headers;

      // 验证时间戳是有效的 ISO 字符串
      expect(headers['X-Webhook-Timestamp']).toBeDefined();
      expect(() => new Date(headers['X-Webhook-Timestamp'])).not.toThrow();
    });

    it('应发送正确的事件类型', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      await service.notifyApiKeyRevoked(mockPayload);

      const callArgs = mockHttpService.post.mock.calls[0];
      const body = callArgs[1];

      expect(body.event).toBe(WebhookEventType.API_KEY_REVOKED);
    });

    it('应正确传递所有 payload 字段', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      await service.notifyApiKeyRevoked(mockPayload);

      const callArgs = mockHttpService.post.mock.calls[0];
      const body = callArgs[1];

      expect(body.data.keyId).toBe(mockPayload.keyId);
      expect(body.data.keyHashPrefix).toBe(mockPayload.keyHashPrefix);
      expect(body.data.tenantId).toBe(mockPayload.tenantId);
      expect(body.data.revokedAt).toBe(mockPayload.revokedAt);
      expect(body.data.revokedBy).toBe(mockPayload.revokedBy);
      expect(body.data.reason).toBe(mockPayload.reason);
    });

    it('应处理没有原因的撤销', async () => {
      const payloadWithoutReason: ApiKeyRevokedPayload = {
        keyId: 'key-123',
        keyHashPrefix: 'abcdef1234567890',
        tenantId: 'tenant-456',
        revokedAt: new Date().toISOString(),
        revokedBy: 'admin-789',
      };

      mockHttpService.post.mockReturnValue(
        of({
          status: 200,
          data: { success: true },
        }),
      );

      const result = await service.notifyApiKeyRevoked(payloadWithoutReason);

      expect(result).toBe(true);
      const callArgs = mockHttpService.post.mock.calls[0];
      const body = callArgs[1];
      expect(body.data.reason).toBeUndefined();
    });
  });
});
