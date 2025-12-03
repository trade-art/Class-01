/**
 * WebhookController 单元测试
 *
 * 测试内容:
 * - 签名验证
 * - 各类事件处理 (MT5 状态、熔断器、性能指标、错误报告)
 * - 心跳端点
 * - 错误处理
 *
 * middleware-integration Task 8.6
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { WebhookValidatorService } from '../services/webhook-validator.service';
import { EventEmitterService } from '../services/event-emitter.service';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { WebhookEventDto, MT5StatusChangeDto, CircuitBreakerChangeDto, PerformanceMetricsDto, ErrorReportDto } from '../dto/webhook.dto';

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookValidator: jest.Mocked<WebhookValidatorService>;
  let eventEmitter: jest.Mocked<EventEmitterService>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;

  const mockRequest = {
    rawBody: Buffer.from('{"event":"test"}'),
    body: { event: 'test' },
  } as unknown as Request & { rawBody: Buffer };

  const validHeaders = {
    signature: 'sha256=valid-signature',
    timestamp: Date.now().toString(),
    instanceId: 'test-instance-id',
  };

  // 创建完整的 WebhookEventDto
  const createWebhookEvent = (overrides: Partial<WebhookEventDto> = {}): WebhookEventDto => ({
    event: 'test',
    instanceId: validHeaders.instanceId,
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: WebhookValidatorService,
          useValue: {
            validateWebhook: jest.fn(),
          },
        },
        {
          provide: EventEmitterService,
          useValue: {
            emitStatusChange: jest.fn(),
            emitMT5ConnectionEvent: jest.fn(),
            emitCircuitBreakerChange: jest.fn(),
            emitError: jest.fn(),
            emitToWebSocket: jest.fn(),
            logEvent: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            recordSuccess: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    webhookValidator = module.get(WebhookValidatorService);
    eventEmitter = module.get(EventEmitterService);
    circuitBreaker = module.get(CircuitBreakerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    it('缺少必要头信息时应抛出 BadRequestException', async () => {
      const event = createWebhookEvent();

      await expect(
        controller.handleWebhook(mockRequest as any, '', validHeaders.timestamp, validHeaders.instanceId, event),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(mockRequest as any, validHeaders.signature, '', validHeaders.instanceId, event),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(mockRequest as any, validHeaders.signature, validHeaders.timestamp, '', event),
      ).rejects.toThrow(BadRequestException);
    });

    it('签名验证失败时应抛出 UnauthorizedException', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({
        isValid: false,
        error: 'Invalid signature',
      });

      await expect(
        controller.handleWebhook(
          mockRequest as any,
          validHeaders.signature,
          validHeaders.timestamp,
          validHeaders.instanceId,
          createWebhookEvent(),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('签名验证通过时应返回成功', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({
        isValid: true,
        instanceId: validHeaders.instanceId,
      });

      const result = await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({ event: 'custom_event', data: {} }),
      );

      expect(result.received).toBe(true);
    });

    it('应正确处理 status_change 事件', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'status_change',
          data: {
            previousStatus: 'ONLINE',
            currentStatus: 'OFFLINE',
            reason: 'Connection lost',
          },
        }),
      );

      expect(eventEmitter.emitStatusChange).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'ONLINE',
        'OFFLINE',
        'Connection lost',
      );
    });

    it('应正确处理 mt5_disconnect 事件', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'mt5_disconnect',
          data: {
            serverId: 'server-1',
            reason: 'Network timeout',
          },
        }),
      );

      expect(eventEmitter.emitMT5ConnectionEvent).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'disconnect',
        'server-1',
        'Network timeout',
      );
    });

    it('应正确处理 mt5_reconnect 事件', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'mt5_reconnect',
          data: {
            serverId: 'server-1',
            reason: 'Reconnected successfully',
          },
        }),
      );

      expect(eventEmitter.emitMT5ConnectionEvent).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'reconnect',
        'server-1',
        'Reconnected successfully',
      );
    });

    it('应正确处理 circuit_breaker_open 事件', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'circuit_breaker_open',
          data: {
            state: 'OPEN',
            service: 'redis',
          },
        }),
      );

      expect(eventEmitter.emitCircuitBreakerChange).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'OPEN',
        'redis',
      );
    });

    it('应正确处理 error 事件', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'error',
          data: {
            errorType: 'CONNECTION_ERROR',
            message: 'Failed to connect',
          },
        }),
      );

      expect(eventEmitter.emitError).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'CONNECTION_ERROR',
        'Failed to connect',
        expect.any(Object),
      );
    });

    it('未知事件应记录到事件日志', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      await controller.handleWebhook(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        createWebhookEvent({
          event: 'unknown_event',
          data: { custom: 'data' },
        }),
      );

      expect(eventEmitter.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: validHeaders.instanceId,
          eventType: 'unknown_event',
          source: 'webhook',
        }),
      );
    });
  });

  describe('handleMT5StatusChange', () => {
    it('应处理 MT5 状态变更', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      const mt5Data: MT5StatusChangeDto = {
        event: 'reconnect',
        serverId: 'mt5-server-1',
        reason: 'Startup',
      };

      const result = await controller.handleMT5StatusChange(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        mt5Data,
      );

      expect(result.received).toBe(true);
      expect(eventEmitter.emitMT5ConnectionEvent).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'reconnect',
        'mt5-server-1',
        'Startup',
      );
    });

    it('签名无效时应抛出异常', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({
        isValid: false,
        error: 'Invalid signature',
      });

      const mt5Data: MT5StatusChangeDto = {
        event: 'reconnect',
        serverId: 'mt5-server-1',
      };

      await expect(
        controller.handleMT5StatusChange(
          mockRequest as any,
          validHeaders.signature,
          validHeaders.timestamp,
          validHeaders.instanceId,
          mt5Data,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('handleCircuitBreakerChange', () => {
    it('应处理熔断器状态变更', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      const cbData: CircuitBreakerChangeDto = {
        service: 'redis',
        state: 'OPEN',
        failures: 5,
        error: 'Too many failures',
      };

      const result = await controller.handleCircuitBreakerChange(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        cbData,
      );

      expect(result.received).toBe(true);
      expect(eventEmitter.emitCircuitBreakerChange).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'OPEN',
        'redis',
      );
    });
  });

  describe('handleMetrics', () => {
    it('应处理性能指标上报', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      const metrics: PerformanceMetricsDto = {
        cpuUsage: 45.5,
        memoryUsageMB: 1024,
        activeConnections: 100,
        requestRate: 150,
        avgResponseTimeMs: 25,
      };

      const result = await controller.handleMetrics(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        metrics,
      );

      expect(result.received).toBe(true);
      expect(eventEmitter.emitToWebSocket).toHaveBeenCalledWith(
        'instance:metrics',
        expect.objectContaining({
          instanceId: validHeaders.instanceId,
          metrics,
        }),
      );
    });
  });

  describe('handleError', () => {
    it('应处理错误报告', async () => {
      webhookValidator.validateWebhook.mockResolvedValue({ isValid: true });

      const errorReport: ErrorReportDto = {
        errorCode: 'ERR_001',
        message: 'Database connection failed',
        stack: 'Error: ...',
        context: { operation: 'query' },
        occurredAt: new Date().toISOString(),
      };

      const result = await controller.handleError(
        mockRequest as any,
        validHeaders.signature,
        validHeaders.timestamp,
        validHeaders.instanceId,
        errorReport,
      );

      expect(result.received).toBe(true);
      expect(eventEmitter.emitError).toHaveBeenCalledWith(
        validHeaders.instanceId,
        'ERR_001',
        'Database connection failed',
        expect.objectContaining({
          stack: 'Error: ...',
          context: { operation: 'query' },
        }),
      );
    });
  });

  describe('handleHeartbeat', () => {
    it('应接收心跳并返回时间戳', async () => {
      const result = await controller.handleHeartbeat(validHeaders.instanceId);

      expect(result.received).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith(validHeaders.instanceId);
    });

    it('缺少实例 ID 时应抛出异常', async () => {
      await expect(controller.handleHeartbeat('')).rejects.toThrow(BadRequestException);
    });

    it('心跳不需要签名验证', async () => {
      await controller.handleHeartbeat(validHeaders.instanceId);

      expect(webhookValidator.validateWebhook).not.toHaveBeenCalled();
    });
  });
});
