import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { WEBHOOK_EVENTS, EVENT_SEVERITY } from '../constants/middleware.constants';
import { InstanceStatus } from '../interfaces/middleware-health.interface';

/**
 * 事件数据接口
 */
export interface InstanceEventData {
  instanceId: string;
  eventType: string;
  data: Record<string, any>;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  source?: 'platform' | 'middleware' | 'webhook';
}

/**
 * 状态变更事件
 */
export interface StatusChangeEvent {
  instanceId: string;
  previousStatus: InstanceStatus;
  currentStatus: InstanceStatus;
  reason?: string;
  timestamp: Date;
}

/**
 * 事件发送服务
 * 负责发送事件到 WebSocket 和记录事件日志
 * middleware-integration Task 7
 */
@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 发送状态变更事件
   */
  async emitStatusChange(
    instanceId: string,
    previousStatus: InstanceStatus,
    currentStatus: InstanceStatus,
    reason?: string,
  ): Promise<void> {
    const event: StatusChangeEvent = {
      instanceId,
      previousStatus,
      currentStatus,
      reason,
      timestamp: new Date(),
    };

    this.logger.log(
      `Instance ${instanceId} status changed: ${previousStatus} -> ${currentStatus}`,
    );

    // 发送到 EventEmitter (可被 WebSocket Gateway 监听)
    this.eventEmitter.emit('instance.status.change', event);

    // 记录到数据库
    await this.logEvent({
      instanceId,
      eventType: WEBHOOK_EVENTS.STATUS_CHANGE,
      data: event,
      severity: this.getStatusChangeSeverity(previousStatus, currentStatus),
      source: 'platform',
    });

    // 发送到 WebSocket (如果有 WebSocket Gateway)
    this.emitToWebSocket('instance:status', {
      instanceId,
      previousStatus,
      currentStatus,
      reason,
      timestamp: event.timestamp.toISOString(),
    });
  }

  /**
   * 发送健康检查告警
   */
  async emitHealthCheckAlert(
    instanceId: string,
    consecutiveFailures: number,
    errorMessage?: string,
  ): Promise<void> {
    const severity = consecutiveFailures >= 5 ? 'CRITICAL' : 'WARNING';

    this.logger.warn(
      `Health check alert for instance ${instanceId}: ${consecutiveFailures} consecutive failures`,
    );

    // 发送到 EventEmitter
    this.eventEmitter.emit('instance.health.alert', {
      instanceId,
      consecutiveFailures,
      errorMessage,
      severity,
    });

    // 记录到数据库
    await this.logEvent({
      instanceId,
      eventType: 'health_check_alert',
      data: {
        consecutiveFailures,
        errorMessage,
        alertedAt: new Date().toISOString(),
      },
      severity: severity as any,
      source: 'platform',
    });

    // 发送到 WebSocket
    this.emitToWebSocket('instance:health-alert', {
      instanceId,
      consecutiveFailures,
      errorMessage,
      severity,
    });
  }

  /**
   * 发送熔断器状态变更事件
   */
  async emitCircuitBreakerChange(
    instanceId: string,
    state: 'OPEN' | 'CLOSED' | 'HALF_OPEN',
    service?: string,
  ): Promise<void> {
    const eventType = state === 'OPEN'
      ? WEBHOOK_EVENTS.CIRCUIT_BREAKER_OPEN
      : WEBHOOK_EVENTS.CIRCUIT_BREAKER_CLOSE;

    this.logger.log(`Circuit breaker for instance ${instanceId}: ${state}`);

    // 发送到 EventEmitter
    this.eventEmitter.emit('instance.circuit-breaker', {
      instanceId,
      state,
      service,
    });

    // 记录到数据库
    await this.logEvent({
      instanceId,
      eventType,
      data: { state, service, changedAt: new Date().toISOString() },
      severity: state === 'OPEN' ? 'WARNING' : 'INFO',
      source: 'platform',
    });

    // 发送到 WebSocket
    this.emitToWebSocket('instance:circuit-breaker', {
      instanceId,
      state,
      service,
    });
  }

  /**
   * 发送 MT5 连接事件
   */
  async emitMT5ConnectionEvent(
    instanceId: string,
    event: 'disconnect' | 'reconnect',
    serverId: string,
    reason?: string,
  ): Promise<void> {
    const eventType = event === 'disconnect'
      ? WEBHOOK_EVENTS.MT5_DISCONNECT
      : WEBHOOK_EVENTS.MT5_RECONNECT;

    this.logger.log(`MT5 ${event} for instance ${instanceId}, server ${serverId}`);

    // 发送到 EventEmitter
    this.eventEmitter.emit('instance.mt5', {
      instanceId,
      event,
      serverId,
      reason,
    });

    // 记录到数据库
    await this.logEvent({
      instanceId,
      eventType,
      data: { serverId, reason, occurredAt: new Date().toISOString() },
      severity: event === 'disconnect' ? 'WARNING' : 'INFO',
      source: 'webhook',
    });

    // 发送到 WebSocket
    this.emitToWebSocket('instance:mt5', {
      instanceId,
      event,
      serverId,
      reason,
    });
  }

  /**
   * 发送错误事件
   */
  async emitError(
    instanceId: string,
    errorType: string,
    message: string,
    details?: Record<string, any>,
  ): Promise<void> {
    this.logger.error(`Error for instance ${instanceId}: ${errorType} - ${message}`);

    // 发送到 EventEmitter
    this.eventEmitter.emit('instance.error', {
      instanceId,
      errorType,
      message,
      details,
    });

    // 记录到数据库
    await this.logEvent({
      instanceId,
      eventType: WEBHOOK_EVENTS.ERROR,
      data: { errorType, message, details, occurredAt: new Date().toISOString() },
      severity: 'ERROR',
      source: 'platform',
    });

    // 发送到 WebSocket
    this.emitToWebSocket('instance:error', {
      instanceId,
      errorType,
      message,
      details,
    });
  }

  /**
   * 发送到 WebSocket
   * 通过 EventEmitter 发送，由 WebSocket Gateway 监听并推送到客户端
   */
  emitToWebSocket(event: string, data: Record<string, any>): void {
    // 通过 EventEmitter 发送，WebSocket Gateway 可以监听这个事件
    this.eventEmitter.emit('websocket.broadcast', {
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 记录事件到数据库
   */
  async logEvent(eventData: InstanceEventData): Promise<void> {
    try {
      await this.prisma.instanceEvent.create({
        data: {
          instanceId: eventData.instanceId,
          eventType: eventData.eventType,
          eventData: eventData.data,
          severity: eventData.severity || 'INFO',
          source: eventData.source || 'platform',
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to log event: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取实例事件历史
   */
  async getEventHistory(
    instanceId: string,
    options?: {
      eventType?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    data: any[];
    total: number;
  }> {
    const where: any = { instanceId };

    if (options?.eventType) {
      where.eventType = options.eventType;
    }
    if (options?.severity) {
      where.severity = options.severity;
    }

    const [data, total] = await Promise.all([
      this.prisma.instanceEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.instanceEvent.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * 根据状态变更确定严重级别
   */
  private getStatusChangeSeverity(
    previousStatus: InstanceStatus,
    currentStatus: InstanceStatus,
  ): 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' {
    // 变为离线或错误状态
    if (currentStatus === 'OFFLINE' || currentStatus === 'ERROR') {
      return previousStatus === 'ONLINE' ? 'ERROR' : 'WARNING';
    }

    // 恢复在线
    if (currentStatus === 'ONLINE' && previousStatus !== 'ONLINE') {
      return 'INFO';
    }

    // 降级
    if (currentStatus === 'DEGRADED') {
      return 'WARNING';
    }

    return 'INFO';
  }
}
