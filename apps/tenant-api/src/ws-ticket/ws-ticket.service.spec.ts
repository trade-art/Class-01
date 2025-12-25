import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { WsTicketService } from './ws-ticket.service';
import { CacheService } from '../common/services/cache.service';
import { RequestContext, AuthType } from '../auth/interfaces/request-context.interface';

describe('WsTicketService', () => {
  let service: WsTicketService;
  let cacheService: CacheService;
  let configService: ConfigService;

  const mockTenantId = 'tenant-test-123';
  const mockManagerId = 'manager-test-456';
  const mockApiKeyId = 'api-key-test-789';
  const mockServerId = 'server-test-abc';

  // Mock RequestContext
  const mockContext: RequestContext = {
    authType: AuthType.API_KEY,
    tenantId: mockTenantId,
    serverId: mockServerId,
    platformType: 'MT5',
    managerId: mockManagerId,
    apiKeyId: mockApiKeyId,
  };

  const mockCacheService = {
    isAvailable: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsTicketService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WsTicketService>(WsTicketService);
    cacheService = module.get<CacheService>(CacheService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // generateTicket() 测试
  // ============================================

  describe('generateTicket', () => {
    beforeEach(() => {
      mockCacheService.isAvailable.mockReturnValue(true);
      mockCacheService.set.mockResolvedValue(true);
      mockConfigService.get.mockReturnValue('wss://test.example.com:8443');
    });

    it('应成功生成 WS Ticket', async () => {
      const scopes = ['quotes:read', 'positions:read'];

      const result = await service.generateTicket(mockContext, scopes);

      expect(result).toBeDefined();
      expect(result.ticket).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result.endpoint).toBe('wss://test.example.com:8443');
      expect(result.expiresIn).toBe(30);
      expect(result.channels).toEqual(expect.arrayContaining(['quotes', 'positions']));
    });

    it('Ticket 应该是有效的 hex 字符串', async () => {
      const result = await service.generateTicket(mockContext, ['*']);

      // 验证是 64 字符的 hex 字符串
      expect(result.ticket).toMatch(/^[0-9a-f]{64}$/);
    });

    it('应正确存储 Ticket 到 Redis', async () => {
      const scopes = ['quotes:read'];

      await service.generateTicket(mockContext, scopes);

      // 验证 CacheService.set 被调用
      expect(mockCacheService.set).toHaveBeenCalledTimes(1);

      // 验证存储的数据结构
      const [key, data, ttl] = mockCacheService.set.mock.calls[0];
      expect(key).toMatch(/^ws:ticket:[0-9a-f]{64}$/);
      expect(data.tenantId).toBe(mockTenantId);
      expect(data.managerId).toBe(mockManagerId);
      expect(data.apiKeyId).toBe(mockApiKeyId);
      expect(data.serverId).toBe(mockServerId);
      expect(data.scopes).toEqual(scopes);
      expect(data.channels).toEqual(['quotes']);
      expect(data.createdAt).toBeDefined();
      expect(ttl).toBe(30);
    });

    it('Redis 不可用时应抛出 503 错误', async () => {
      mockCacheService.isAvailable.mockReturnValue(false);

      await expect(service.generateTicket(mockContext, ['*'])).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('Redis 存储失败时应抛出 503 错误', async () => {
      mockCacheService.isAvailable.mockReturnValue(true);
      mockCacheService.set.mockResolvedValue(false);

      await expect(service.generateTicket(mockContext, ['*'])).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('未配置 WS 端点时应使用默认值', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = await service.generateTicket(mockContext, ['*']);

      expect(result.endpoint).toBe('wss://localhost:8443');
    });
  });

  // ============================================
  // calculateChannels() 测试
  // ============================================

  describe('calculateChannels', () => {
    it('通配符 scope (*) 应返回所有频道', () => {
      const result = service.calculateChannels(['*']);

      expect(result).toEqual(expect.arrayContaining(['quotes', 'positions', 'orders']));
      expect(result).toHaveLength(3);
    });

    it('quotes:read scope 应返回 quotes 频道', () => {
      const result = service.calculateChannels(['quotes:read']);

      expect(result).toEqual(['quotes']);
    });

    it('positions:read scope 应返回 positions 频道', () => {
      const result = service.calculateChannels(['positions:read']);

      expect(result).toEqual(['positions']);
    });

    it('orders:read scope 应返回 orders 频道', () => {
      const result = service.calculateChannels(['orders:read']);

      expect(result).toEqual(['orders']);
    });

    it('多个 scope 应返回对应的多个频道', () => {
      const result = service.calculateChannels(['quotes:read', 'positions:read']);

      expect(result).toEqual(expect.arrayContaining(['quotes', 'positions']));
      expect(result).toHaveLength(2);
    });

    it(':write scope 应包含对应的 :read 频道', () => {
      const result = service.calculateChannels(['positions:write']);

      expect(result).toEqual(['positions']);
    });

    it('未知 scope 应返回空数组', () => {
      const result = service.calculateChannels(['unknown:read', 'another:scope']);

      expect(result).toEqual([]);
    });

    it('空 scopes 应返回空数组', () => {
      const result = service.calculateChannels([]);

      expect(result).toEqual([]);
    });

    it('混合 scope 应正确过滤', () => {
      const result = service.calculateChannels([
        'quotes:read',
        'unknown:read',
        'positions:write',
      ]);

      expect(result).toEqual(expect.arrayContaining(['quotes', 'positions']));
      expect(result).toHaveLength(2);
    });
  });
});
