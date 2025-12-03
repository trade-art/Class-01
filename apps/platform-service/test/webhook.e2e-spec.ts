/**
 * Webhook 模块 E2E 契约测试
 *
 * 测试端点：
 * - POST /webhook/middleware - 通用 Webhook 接收端点
 * - POST /webhook/middleware/mt5/status - MT5 状态变更端点
 * - POST /webhook/middleware/circuit-breaker - 熔断器状态变更端点
 * - POST /webhook/middleware/metrics - 性能指标上报端点
 * - POST /webhook/middleware/error - 错误报告端点
 * - POST /webhook/middleware/heartbeat - 心跳端点 (不需要签名验证)
 *
 * 签名验证: 使用 HMAC-SHA256 签名，格式为 sha256=<hex>
 * 时间戳有效期: 5 分钟
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPrismaService } from './mocks/prisma.mock';
import { TEST_INSTANCE } from './fixtures/test-data';
import { expectSuccessResponse, expectErrorResponse, getSuccessData } from './utils/validators';

describe('Webhook 模块契约测试 (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: MockPrismaService;

  // Webhook Secret 用于签名验证
  const WEBHOOK_SECRET = 'whsec_test_secret_for_e2e_testing';

  /**
   * 生成 Webhook 签名
   * 签名格式: sha256=HMAC-SHA256(secret, timestamp + '.' + body)
   */
  function generateSignature(timestamp: string, body: string): string {
    const payload = `${timestamp}.${body}`;
    const hmac = createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * 获取当前时间戳 (毫秒)
   */
  function getCurrentTimestamp(): string {
    return Date.now().toString();
  }

  /**
   * 获取过期时间戳 (6 分钟前)
   */
  function getExpiredTimestamp(): string {
    return (Date.now() - 6 * 60 * 1000).toString();
  }

  beforeAll(async () => {
    mockPrismaService = new MockPrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    // 启用 raw body 解析用于签名验证
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrismaService.resetMocks();

    // 默认返回带有 webhookSecret 的实例
    mockPrismaService.middlewareInstance.findUnique.mockResolvedValue({
      ...TEST_INSTANCE,
      webhookSecret: WEBHOOK_SECRET,
    });

    // Mock instanceEvent.create
    mockPrismaService.instanceEvent = {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
  });

  // ==================== POST /webhook/middleware - 通用 Webhook ====================

  describe('POST /webhook/middleware - 通用 Webhook 接收', () => {
    const validWebhookEvent = {
      event: 'status_change',
      instanceId: TEST_INSTANCE.id,
      timestamp: new Date().toISOString(),
      data: {
        previousStatus: 'OFFLINE',
        currentStatus: 'ONLINE',
        reason: 'Connection restored',
      },
      severity: 'INFO',
    };

    it('应能接收有效签名的 Webhook 事件', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<{ received: boolean }>(response);
      expect(data).toHaveProperty('received', true);
    });

    it('缺少签名头应返回 400', async () => {
      const timestamp = getCurrentTimestamp();

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(400);

      expectErrorResponse(response);
    });

    it('缺少时间戳头应返回 400', async () => {
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(getCurrentTimestamp(), body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(400);

      expectErrorResponse(response);
    });

    it('缺少实例 ID 头应返回 400', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .send(validWebhookEvent)
        .expect(400);

      expectErrorResponse(response);
    });

    it('无效签名应返回 401', async () => {
      const timestamp = getCurrentTimestamp();

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', 'sha256=invalid_signature')
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(401);

      expectErrorResponse(response);
    });

    it('过期时间戳应返回 401', async () => {
      const timestamp = getExpiredTimestamp();
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(401);

      expectErrorResponse(response);
    });

    it('实例不存在应返回 401', async () => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue(null);

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', 'non-existent-instance')
        .send(validWebhookEvent)
        .expect(401);

      expectErrorResponse(response);
    });

    it('实例未配置 webhookSecret 应返回 401', async () => {
      mockPrismaService.middlewareInstance.findUnique.mockResolvedValue({
        ...TEST_INSTANCE,
        webhookSecret: null,
      });

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validWebhookEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validWebhookEvent)
        .expect(401);

      expectErrorResponse(response);
    });

    it('应能处理 status_change 事件', async () => {
      const event = {
        event: 'status_change',
        instanceId: TEST_INSTANCE.id,
        timestamp: new Date().toISOString(),
        data: {
          previousStatus: 'OFFLINE',
          currentStatus: 'ONLINE',
          reason: 'Manual restart',
        },
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(event);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(event)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能处理 mt5_disconnect 事件', async () => {
      const event = {
        event: 'mt5_disconnect',
        instanceId: TEST_INSTANCE.id,
        timestamp: new Date().toISOString(),
        data: {
          serverId: 'mt5-server-001',
          reason: 'Network timeout',
        },
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(event);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(event)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能处理 circuit_breaker_open 事件', async () => {
      const event = {
        event: 'circuit_breaker_open',
        instanceId: TEST_INSTANCE.id,
        timestamp: new Date().toISOString(),
        data: {
          state: 'OPEN',
          service: 'MT5Gateway',
        },
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(event);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(event)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能处理 error 事件', async () => {
      const event = {
        event: 'error',
        instanceId: TEST_INSTANCE.id,
        timestamp: new Date().toISOString(),
        data: {
          errorType: 'CONNECTION_ERROR',
          message: 'Failed to connect to MT5 server',
        },
        severity: 'ERROR',
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(event);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(event)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });
  });

  // ==================== POST /webhook/middleware/mt5/status ====================

  describe('POST /webhook/middleware/mt5/status - MT5 状态变更', () => {
    const validMT5Status = {
      serverId: 'mt5-server-001',
      event: 'disconnect',
      reason: 'Network timeout',
      retryCount: 3,
    };

    it('应能接收 MT5 断开连接事件', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validMT5Status);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/mt5/status')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validMT5Status)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能接收 MT5 重连事件', async () => {
      const reconnectEvent = {
        serverId: 'mt5-server-001',
        event: 'reconnect',
        reason: 'Connection restored',
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(reconnectEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/mt5/status')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(reconnectEvent)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('无效的事件类型应返回 400', async () => {
      const invalidEvent = {
        serverId: 'mt5-server-001',
        event: 'invalid_event',
        reason: 'Test',
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(invalidEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/mt5/status')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(invalidEvent)
        .expect(400);

      expectErrorResponse(response);
    });

    it('缺少必要字段应返回 400', async () => {
      const incompleteEvent = {
        event: 'disconnect',
        // 缺少 serverId
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(incompleteEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/mt5/status')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(incompleteEvent)
        .expect(400);

      expectErrorResponse(response);
    });
  });

  // ==================== POST /webhook/middleware/circuit-breaker ====================

  describe('POST /webhook/middleware/circuit-breaker - 熔断器状态变更', () => {
    const validCircuitBreakerChange = {
      service: 'MT5Gateway',
      state: 'OPEN',
      failures: 5,
      error: 'Connection timeout',
    };

    it('应能接收熔断器打开事件', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validCircuitBreakerChange);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/circuit-breaker')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validCircuitBreakerChange)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能接收熔断器关闭事件', async () => {
      const closedEvent = {
        service: 'MT5Gateway',
        state: 'CLOSED',
        failures: 0,
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(closedEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/circuit-breaker')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(closedEvent)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能接收熔断器半开状态事件', async () => {
      const halfOpenEvent = {
        service: 'MT5Gateway',
        state: 'HALF_OPEN',
        failures: 3,
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(halfOpenEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/circuit-breaker')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(halfOpenEvent)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('无效的状态应返回 400', async () => {
      const invalidEvent = {
        service: 'MT5Gateway',
        state: 'INVALID_STATE',
        failures: 5,
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(invalidEvent);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/circuit-breaker')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(invalidEvent)
        .expect(400);

      expectErrorResponse(response);
    });
  });

  // ==================== POST /webhook/middleware/metrics ====================

  describe('POST /webhook/middleware/metrics - 性能指标上报', () => {
    const validMetrics = {
      cpuUsage: 45.5,
      memoryUsageMB: 512,
      activeConnections: 150,
      requestRate: 100.5,
      avgResponseTimeMs: 25.3,
    };

    it('应能接收性能指标', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validMetrics);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/metrics')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validMetrics)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能接收最小必要指标', async () => {
      const minimalMetrics = {
        cpuUsage: 30,
        memoryUsageMB: 256,
        activeConnections: 50,
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(minimalMetrics);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/metrics')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(minimalMetrics)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('缺少必要指标应返回 400', async () => {
      const incompleteMetrics = {
        cpuUsage: 30,
        // 缺少 memoryUsageMB 和 activeConnections
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(incompleteMetrics);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/metrics')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(incompleteMetrics)
        .expect(400);

      expectErrorResponse(response);
    });

    it('指标值类型错误应返回 400', async () => {
      const invalidMetrics = {
        cpuUsage: 'not a number',
        memoryUsageMB: 256,
        activeConnections: 50,
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(invalidMetrics);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/metrics')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(invalidMetrics)
        .expect(400);

      expectErrorResponse(response);
    });
  });

  // ==================== POST /webhook/middleware/error ====================

  describe('POST /webhook/middleware/error - 错误报告', () => {
    const validErrorReport = {
      errorCode: 'MT5_CONNECTION_ERROR',
      message: 'Failed to connect to MT5 server',
      stack: 'Error: Connection refused\n    at TcpClient.connect (...)',
      context: {
        serverId: 'mt5-server-001',
        retryCount: 3,
      },
      occurredAt: new Date().toISOString(),
    };

    it('应能接收错误报告', async () => {
      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(validErrorReport);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/error')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(validErrorReport)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('应能接收最小必要错误信息', async () => {
      const minimalError = {
        errorCode: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
        occurredAt: new Date().toISOString(),
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(minimalError);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/error')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(minimalError)
        .expect(200);

      expectSuccessResponse(response);
      expect(getSuccessData<{ received: boolean }>(response).received).toBe(true);
    });

    it('缺少错误代码应返回 400', async () => {
      const incompleteError = {
        message: 'Something went wrong',
        occurredAt: new Date().toISOString(),
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(incompleteError);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/error')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(incompleteError)
        .expect(400);

      expectErrorResponse(response);
    });

    it('缺少错误消息应返回 400', async () => {
      const incompleteError = {
        errorCode: 'UNKNOWN_ERROR',
        occurredAt: new Date().toISOString(),
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(incompleteError);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/error')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(incompleteError)
        .expect(400);

      expectErrorResponse(response);
    });
  });

  // ==================== POST /webhook/middleware/heartbeat ====================

  describe('POST /webhook/middleware/heartbeat - 心跳端点', () => {
    it('应能接收心跳 (不需要签名验证)', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/heartbeat')
        .set('Content-Type', 'application/json')
        .set('x-instance-id', TEST_INSTANCE.id)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<{ received: boolean; timestamp: string }>(response);
      expect(data.received).toBe(true);
      expect(data).toHaveProperty('timestamp');
    });

    it('心跳响应应包含时间戳', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/heartbeat')
        .set('x-instance-id', TEST_INSTANCE.id)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<{ received: boolean; timestamp: string }>(response);
      expect(data.timestamp).toBeDefined();
      // 验证时间戳格式
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('缺少实例 ID 应返回 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/heartbeat')
        .expect(400);

      expectErrorResponse(response);
    });
  });

  // ==================== 签名验证边界情况 ====================

  describe('签名验证边界情况', () => {
    it('空签名应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', '')
        .set('x-webhook-timestamp', getCurrentTimestamp())
        .set('x-instance-id', TEST_INSTANCE.id)
        .send({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} });

      // 空字符串会被视为缺少必要头部
      expect(response.status).toBe(400);
    });

    it('格式错误的签名应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', 'not_sha256_format')
        .set('x-webhook-timestamp', getCurrentTimestamp())
        .set('x-instance-id', TEST_INSTANCE.id)
        .send({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} })
        .expect(401);

      expectErrorResponse(response);
    });

    it('非数字时间戳应返回 401', async () => {
      const invalidTimestamp = 'not-a-number';
      const body = JSON.stringify({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} });
      const signature = generateSignature(invalidTimestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', invalidTimestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} })
        .expect(401);

      expectErrorResponse(response);
    });

    it('未来时间戳 (5分钟后) 应返回 401', async () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString();
      const body = JSON.stringify({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} });
      const signature = generateSignature(futureTimestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', futureTimestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send({ event: 'test', instanceId: TEST_INSTANCE.id, timestamp: new Date().toISOString(), data: {} })
        .expect(401);

      expectErrorResponse(response);
    });
  });

  // ==================== 响应格式验证 ====================

  describe('响应格式验证', () => {
    it('成功响应应包含 received 字段', async () => {
      const event = {
        event: 'status_change',
        instanceId: TEST_INSTANCE.id,
        timestamp: new Date().toISOString(),
        data: { status: 'ONLINE' },
      };

      const timestamp = getCurrentTimestamp();
      const body = JSON.stringify(event);
      const signature = generateSignature(timestamp, body);

      const response = await request(app.getHttpServer())
        .post('/webhook/middleware')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('x-instance-id', TEST_INSTANCE.id)
        .send(event)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<{ received: boolean }>(response);
      expect(data).toHaveProperty('received');
      expect(typeof data.received).toBe('boolean');
    });

    it('心跳响应应包含 received 和 timestamp 字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhook/middleware/heartbeat')
        .set('x-instance-id', TEST_INSTANCE.id)
        .expect(200);

      expectSuccessResponse(response);
      const data = getSuccessData<{ received: boolean; timestamp: string }>(response);
      expect(data.received).toBe(true);
      expect(data).toHaveProperty('timestamp');
      expect(typeof data.timestamp).toBe('string');
    });
  });
});
