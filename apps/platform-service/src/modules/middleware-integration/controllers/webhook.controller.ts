import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhookValidatorService } from '../services/webhook-validator.service';
import { EventEmitterService } from '../services/event-emitter.service';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import {
  WebhookEventDto,
  MT5StatusChangeDto,
  CircuitBreakerChangeDto,
  PerformanceMetricsDto,
  ErrorReportDto,
} from '../dto/webhook.dto';

/**
 * Webhook 接收控制器
 * 接收中间件发送的事件通知
 * middleware-integration Task 8
 */
@ApiTags('Middleware Webhook')
@Controller('webhook/middleware')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookValidator: WebhookValidatorService,
    private readonly eventEmitter: EventEmitterService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * 通用 Webhook 接收端点
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收中间件 Webhook 事件' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'Webhook 签名' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: '时间戳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  @ApiResponse({ status: 200, description: '事件接收成功' })
  @ApiResponse({ status: 401, description: '签名验证失败' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-instance-id') instanceId: string,
    @Body() event: WebhookEventDto,
  ): Promise<{ received: boolean; eventId?: string }> {
    // 验证必要的头信息
    if (!signature || !timestamp || !instanceId) {
      throw new BadRequestException('Missing required webhook headers');
    }

    // 获取原始请求体用于签名验证
    const rawBody = req.rawBody?.toString() || JSON.stringify(event);

    // 验证签名
    const validation = await this.webhookValidator.validateWebhook(
      instanceId,
      signature,
      timestamp,
      rawBody,
    );

    if (!validation.isValid) {
      this.logger.warn(
        `Webhook validation failed for instance ${instanceId}: ${validation.error}`,
      );
      throw new UnauthorizedException(validation.error);
    }

    // 处理事件
    await this.processEvent(instanceId, event);

    return { received: true };
  }

  /**
   * MT5 状态变更端点
   */
  @Post('mt5/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收 MT5 状态变更事件' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'Webhook 签名' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: '时间戳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  async handleMT5StatusChange(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-instance-id') instanceId: string,
    @Body() data: MT5StatusChangeDto,
  ): Promise<{ received: boolean }> {
    await this.validateRequest(req, instanceId, signature, timestamp);

    this.logger.log(`MT5 ${data.event} event for instance ${instanceId}, server ${data.serverId}`);

    await this.eventEmitter.emitMT5ConnectionEvent(
      instanceId,
      data.event,
      data.serverId,
      data.reason,
    );

    return { received: true };
  }

  /**
   * 熔断器状态变更端点
   */
  @Post('circuit-breaker')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收熔断器状态变更事件' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'Webhook 签名' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: '时间戳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  async handleCircuitBreakerChange(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-instance-id') instanceId: string,
    @Body() data: CircuitBreakerChangeDto,
  ): Promise<{ received: boolean }> {
    await this.validateRequest(req, instanceId, signature, timestamp);

    this.logger.log(
      `Circuit breaker ${data.state} for instance ${instanceId}, service ${data.service}`,
    );

    await this.eventEmitter.emitCircuitBreakerChange(instanceId, data.state, data.service);

    return { received: true };
  }

  /**
   * 性能指标上报端点
   */
  @Post('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收性能指标上报' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'Webhook 签名' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: '时间戳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  async handleMetrics(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-instance-id') instanceId: string,
    @Body() metrics: PerformanceMetricsDto,
  ): Promise<{ received: boolean }> {
    await this.validateRequest(req, instanceId, signature, timestamp);

    this.logger.debug(`Metrics received for instance ${instanceId}:`, metrics);

    // 发送指标事件
    this.eventEmitter.emitToWebSocket('instance:metrics', {
      instanceId,
      metrics,
      timestamp: new Date().toISOString(),
    });

    return { received: true };
  }

  /**
   * 错误报告端点
   */
  @Post('error')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收错误报告' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'Webhook 签名' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: '时间戳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  async handleError(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-instance-id') instanceId: string,
    @Body() error: ErrorReportDto,
  ): Promise<{ received: boolean }> {
    await this.validateRequest(req, instanceId, signature, timestamp);

    this.logger.error(
      `Error reported by instance ${instanceId}: ${error.errorCode} - ${error.message}`,
    );

    await this.eventEmitter.emitError(
      instanceId,
      error.errorCode,
      error.message,
      { stack: error.stack, context: error.context, occurredAt: error.occurredAt },
    );

    return { received: true };
  }

  /**
   * 心跳端点 (轻量级，不需要签名验证)
   */
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收心跳' })
  @ApiHeader({ name: 'x-instance-id', description: '实例 ID' })
  async handleHeartbeat(
    @Headers('x-instance-id') instanceId: string,
  ): Promise<{ received: boolean; timestamp: string }> {
    if (!instanceId) {
      throw new BadRequestException('Missing instance ID');
    }

    this.logger.debug(`Heartbeat from instance ${instanceId}`);

    // 记录成功到熔断器
    this.circuitBreaker.recordSuccess(instanceId);

    return {
      received: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 验证请求签名
   */
  private async validateRequest(
    req: RawBodyRequest<Request>,
    instanceId: string,
    signature: string,
    timestamp: string,
  ): Promise<void> {
    if (!signature || !timestamp || !instanceId) {
      throw new BadRequestException('Missing required webhook headers');
    }

    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

    const validation = await this.webhookValidator.validateWebhook(
      instanceId,
      signature,
      timestamp,
      rawBody,
    );

    if (!validation.isValid) {
      throw new UnauthorizedException(validation.error);
    }
  }

  /**
   * 处理通用事件
   */
  private async processEvent(instanceId: string, event: WebhookEventDto): Promise<void> {
    this.logger.log(`Processing webhook event: ${event.event} for instance ${instanceId}`);

    switch (event.event) {
      case 'status_change':
        if (event.data.previousStatus && event.data.currentStatus) {
          await this.eventEmitter.emitStatusChange(
            instanceId,
            event.data.previousStatus,
            event.data.currentStatus,
            event.data.reason,
          );
        }
        break;

      case 'mt5_disconnect':
        await this.eventEmitter.emitMT5ConnectionEvent(
          instanceId,
          'disconnect',
          event.data.serverId,
          event.data.reason,
        );
        break;

      case 'mt5_reconnect':
        await this.eventEmitter.emitMT5ConnectionEvent(
          instanceId,
          'reconnect',
          event.data.serverId,
          event.data.reason,
        );
        break;

      case 'circuit_breaker_open':
      case 'circuit_breaker_close':
        await this.eventEmitter.emitCircuitBreakerChange(
          instanceId,
          event.data.state,
          event.data.service,
        );
        break;

      case 'error':
        await this.eventEmitter.emitError(
          instanceId,
          event.data.errorType || 'UNKNOWN',
          event.data.message || 'Unknown error',
          event.data,
        );
        break;

      default:
        // 记录到事件日志
        await this.eventEmitter.logEvent({
          instanceId,
          eventType: event.event,
          data: event.data,
          severity: (event.severity as any) || 'INFO',
          source: 'webhook',
        });
    }
  }
}
