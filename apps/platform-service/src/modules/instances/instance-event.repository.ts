import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InstanceEvent, EventSeverity, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Event types for instance events
 * middleware-integration Task 5.4
 */
export enum InstanceEventType {
  STATUS_CHANGE = 'status_change',
  CIRCUIT_BREAKER = 'circuit_breaker',
  MT5_CONNECTED = 'mt5_connected',
  MT5_DISCONNECTED = 'mt5_disconnected',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  HEALTH_CHECK_RECOVERED = 'health_check_recovered',
  ALERT_THRESHOLD = 'alert_threshold',
  CUSTOM = 'custom',
}

/**
 * Event source identifier
 */
export enum EventSource {
  PLATFORM = 'platform',
  MIDDLEWARE = 'middleware',
  WEBHOOK = 'webhook',
  SCHEDULER = 'scheduler',
}

/**
 * DTO for creating an instance event
 */
export interface CreateInstanceEventDto {
  instanceId: string;
  eventType: InstanceEventType | string;
  eventData: Record<string, any>;
  severity?: EventSeverity;
  source?: EventSource | string;
}

/**
 * Query options for events
 */
export interface EventQueryOptions {
  instanceId?: string;
  eventTypes?: string[];
  severity?: EventSeverity[];
  source?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Repository for Instance Events
 * Handles CRUD operations for the instance_events table
 *
 * middleware-integration Task 5.4
 */
@Injectable()
export class InstanceEventRepository {
  private readonly logger = new Logger(InstanceEventRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new instance event
   */
  async create(dto: CreateInstanceEventDto): Promise<InstanceEvent> {
    this.logger.debug(
      `Creating event for instance ${dto.instanceId}: ${dto.eventType}`,
    );

    return this.prisma.instanceEvent.create({
      data: {
        id: uuidv4(),
        instanceId: dto.instanceId,
        eventType: dto.eventType,
        eventData: dto.eventData as Prisma.InputJsonValue,
        severity: dto.severity || 'INFO',
        source: dto.source || 'platform',
      },
    });
  }

  /**
   * Create multiple events in a batch
   */
  async createMany(events: CreateInstanceEventDto[]): Promise<number> {
    const result = await this.prisma.instanceEvent.createMany({
      data: events.map((dto) => ({
        id: uuidv4(),
        instanceId: dto.instanceId,
        eventType: dto.eventType,
        eventData: dto.eventData as Prisma.InputJsonValue,
        severity: dto.severity || 'INFO',
        source: dto.source || 'platform',
      })),
    });

    return result.count;
  }

  /**
   * Find events by instance ID
   */
  async findByInstanceId(
    instanceId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<InstanceEvent[]> {
    const { limit = 100, offset = 0 } = options;

    return this.prisma.instanceEvent.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find events with advanced filtering
   */
  async findWithFilter(options: EventQueryOptions): Promise<{
    data: InstanceEvent[];
    total: number;
    hasMore: boolean;
  }> {
    const {
      instanceId,
      eventTypes,
      severity,
      source,
      fromDate,
      toDate,
      limit = 50,
      offset = 0,
    } = options;

    const where: Prisma.InstanceEventWhereInput = {};

    if (instanceId) {
      where.instanceId = instanceId;
    }

    if (eventTypes && eventTypes.length > 0) {
      where.eventType = { in: eventTypes };
    }

    if (severity && severity.length > 0) {
      where.severity = { in: severity };
    }

    if (source) {
      where.source = source;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (toDate) {
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.instanceEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.instanceEvent.count({ where }),
    ]);

    return {
      data,
      total,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Get recent events for an instance
   */
  async getRecentEvents(
    instanceId: string,
    count: number = 10,
  ): Promise<InstanceEvent[]> {
    return this.prisma.instanceEvent.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
      take: count,
    });
  }

  /**
   * Get events by type
   */
  async findByEventType(
    eventType: string,
    options: { limit?: number; fromDate?: Date } = {},
  ): Promise<InstanceEvent[]> {
    const { limit = 100, fromDate } = options;

    const where: Prisma.InstanceEventWhereInput = {
      eventType,
    };

    if (fromDate) {
      where.createdAt = { gte: fromDate };
    }

    return this.prisma.instanceEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Count events by type for an instance
   */
  async countByType(
    instanceId: string,
    eventType?: string,
  ): Promise<{ eventType: string; count: number }[]> {
    const where: Prisma.InstanceEventWhereInput = { instanceId };
    if (eventType) {
      where.eventType = eventType;
    }

    const result = await this.prisma.instanceEvent.groupBy({
      by: ['eventType'],
      where,
      _count: { eventType: true },
    });

    return result.map((r) => ({
      eventType: r.eventType,
      count: r._count.eventType,
    }));
  }

  /**
   * Get event statistics for an instance
   */
  async getEventStats(
    instanceId: string,
    fromDate?: Date,
  ): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    lastEventAt: Date | null;
  }> {
    const where: Prisma.InstanceEventWhereInput = { instanceId };
    if (fromDate) {
      where.createdAt = { gte: fromDate };
    }

    const [total, bySeverity, byType, lastEvent] = await Promise.all([
      this.prisma.instanceEvent.count({ where }),
      this.prisma.instanceEvent.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),
      this.prisma.instanceEvent.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
      }),
      this.prisma.instanceEvent.findFirst({
        where: { instanceId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      total,
      bySeverity: Object.fromEntries(
        bySeverity.map((r) => [r.severity, r._count.severity]),
      ),
      byType: Object.fromEntries(
        byType.map((r) => [r.eventType, r._count.eventType]),
      ),
      lastEventAt: lastEvent?.createdAt || null,
    };
  }

  /**
   * Delete old events (cleanup)
   */
  async deleteOldEvents(olderThan: Date): Promise<number> {
    const result = await this.prisma.instanceEvent.deleteMany({
      where: {
        createdAt: { lt: olderThan },
      },
    });

    this.logger.log(`Deleted ${result.count} old events`);
    return result.count;
  }

  /**
   * Get all events across all instances (for admin dashboard)
   */
  async getAllRecentEvents(options: {
    limit?: number;
    severity?: EventSeverity[];
  } = {}): Promise<InstanceEvent[]> {
    const { limit = 50, severity } = options;

    const where: Prisma.InstanceEventWhereInput = {};
    if (severity && severity.length > 0) {
      where.severity = { in: severity };
    }

    return this.prisma.instanceEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        instance: {
          select: { id: true, name: true, tenantId: true },
        },
      },
    });
  }

  // ==================== Helper methods for common event creation ====================

  /**
   * Log a status change event
   */
  async logStatusChange(
    instanceId: string,
    oldStatus: string,
    newStatus: string,
    message?: string,
  ): Promise<InstanceEvent> {
    const severity = this.getSeverityForStatusChange(oldStatus, newStatus);

    return this.create({
      instanceId,
      eventType: InstanceEventType.STATUS_CHANGE,
      eventData: {
        oldStatus,
        newStatus,
        message,
        timestamp: new Date().toISOString(),
      },
      severity,
      source: EventSource.PLATFORM,
    });
  }

  /**
   * Log a circuit breaker state change
   */
  async logCircuitBreakerChange(
    instanceId: string,
    componentName: string,
    oldState: string,
    newState: string,
  ): Promise<InstanceEvent> {
    const severity = newState === 'OPEN' ? 'WARNING' : 'INFO';

    return this.create({
      instanceId,
      eventType: InstanceEventType.CIRCUIT_BREAKER,
      eventData: {
        componentName,
        oldState,
        newState,
        timestamp: new Date().toISOString(),
      },
      severity: severity as EventSeverity,
      source: EventSource.MIDDLEWARE,
    });
  }

  /**
   * Log MT5 connection event
   */
  async logMT5Connection(
    instanceId: string,
    connected: boolean,
    serverAddress?: string,
    message?: string,
  ): Promise<InstanceEvent> {
    return this.create({
      instanceId,
      eventType: connected
        ? InstanceEventType.MT5_CONNECTED
        : InstanceEventType.MT5_DISCONNECTED,
      eventData: {
        connected,
        serverAddress,
        message,
        timestamp: new Date().toISOString(),
      },
      severity: connected ? 'INFO' : 'WARNING',
      source: EventSource.MIDDLEWARE,
    });
  }

  /**
   * Log health check failure
   */
  async logHealthCheckFailure(
    instanceId: string,
    errorMessage: string,
    consecutiveFailures: number,
  ): Promise<InstanceEvent> {
    const severity = consecutiveFailures >= 3 ? 'ERROR' : 'WARNING';

    return this.create({
      instanceId,
      eventType: InstanceEventType.HEALTH_CHECK_FAILED,
      eventData: {
        errorMessage,
        consecutiveFailures,
        timestamp: new Date().toISOString(),
      },
      severity: severity as EventSeverity,
      source: EventSource.SCHEDULER,
    });
  }

  /**
   * Log health check recovery
   */
  async logHealthCheckRecovery(
    instanceId: string,
    previousFailures: number,
  ): Promise<InstanceEvent> {
    return this.create({
      instanceId,
      eventType: InstanceEventType.HEALTH_CHECK_RECOVERED,
      eventData: {
        previousFailures,
        recoveredAt: new Date().toISOString(),
      },
      severity: 'INFO',
      source: EventSource.SCHEDULER,
    });
  }

  /**
   * Determine severity based on status transition
   */
  private getSeverityForStatusChange(
    oldStatus: string,
    newStatus: string,
  ): EventSeverity {
    // Transitions to ERROR or OFFLINE are warnings/errors
    if (newStatus === 'ERROR') return 'ERROR';
    if (newStatus === 'OFFLINE') return 'WARNING';
    if (newStatus === 'DEGRADED') return 'WARNING';

    // Recovery from bad states is info
    if (
      newStatus === 'ONLINE' &&
      ['ERROR', 'OFFLINE', 'DEGRADED'].includes(oldStatus)
    ) {
      return 'INFO';
    }

    return 'INFO';
  }
}
