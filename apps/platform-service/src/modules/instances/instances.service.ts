import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInstanceDto,
  UpdateInstanceDto,
  InstanceQueryDto,
  MT5ServerConfigDto,
} from './dto/instance.dto';
import { MiddlewareInstance, Prisma, CircuitBreakerState, InstanceStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { firstValueFrom, catchError, timeout } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async create(createInstanceDto: CreateInstanceDto): Promise<MiddlewareInstance> {
    // Verify tenant exists and check instance limit
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: createInstanceDto.tenantId },
      include: {
        _count: { select: { instances: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${createInstanceDto.tenantId}' not found`);
    }

    if (tenant._count.instances >= tenant.maxInstances) {
      throw new BadRequestException(
        `Tenant has reached maximum instance limit (${tenant.maxInstances})`,
      );
    }

    // Generate API key for the instance
    const apiKey = `mt5_${uuidv4().replace(/-/g, '')}`;

    return this.prisma.middlewareInstance.create({
      data: {
        tenantId: createInstanceDto.tenantId,
        name: createInstanceDto.name,
        description: createInstanceDto.description,
        host: createInstanceDto.host,
        port: createInstanceDto.port || 8080,
        apiKey,
        mt5Servers: createInstanceDto.mt5Servers as any,
        maxSessions: createInstanceDto.maxSessions || 100,
        maxManagers: createInstanceDto.maxManagers || 10,
        status: 'OFFLINE',
      },
    });
  }

  async findAll(query: InstanceQueryDto): Promise<{
    data: MiddlewareInstance[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { search, tenantId, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MiddlewareInstanceWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { host: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.middlewareInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prisma.middlewareInstance.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<MiddlewareInstance> {
    const instance = await this.prisma.middlewareInstance.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Instance with ID '${id}' not found`);
    }

    return instance;
  }

  async findByTenant(tenantId: string): Promise<MiddlewareInstance[]> {
    return this.prisma.middlewareInstance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, updateInstanceDto: UpdateInstanceDto): Promise<MiddlewareInstance> {
    await this.findOne(id);

    // Remove tenantId from update (can't change tenant)
    const { tenantId, ...updateData } = updateInstanceDto;

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: {
        ...updateData,
        mt5Servers: updateData.mt5Servers as any,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.middlewareInstance.delete({
      where: { id },
    });
  }

  async regenerateApiKey(id: string): Promise<{ apiKey: string }> {
    await this.findOne(id);

    const newApiKey = `mt5_${uuidv4().replace(/-/g, '')}`;

    await this.prisma.middlewareInstance.update({
      where: { id },
      data: { apiKey: newApiKey },
    });

    return { apiKey: newApiKey };
  }

  async updateHealthStatus(
    id: string,
    status: 'ONLINE' | 'OFFLINE' | 'ERROR',
    healthData?: any,
  ): Promise<MiddlewareInstance> {
    await this.findOne(id);

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: {
        status,
        lastHealthCheck: new Date(),
        healthData: healthData || undefined,
      },
    });
  }

  /**
   * 执行实例健康检查 (REQ-4: 使用 HttpModule)
   * 调用 MT5 Middleware 的 /health 端点
   */
  async checkHealth(id: string): Promise<{
    status: 'online' | 'offline' | 'error';
    message?: string;
    data?: any;
    latencyMs?: number;
  }> {
    const instance = await this.findOne(id);
    const startTime = Date.now();

    try {
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(`http://${instance.host}:${instance.port}/health`, {
          headers: {
            'X-API-Key': instance.apiKey,
          },
        }).pipe(
          timeout(5000),
          catchError((error: AxiosError) => {
            throw error;
          }),
        ),
      );

      const latencyMs = Date.now() - startTime;
      const healthData = {
        ...(response.data || {}),
        latencyMs,
        checkedAt: new Date().toISOString(),
      };

      await this.updateHealthStatus(id, 'ONLINE', healthData);

      return {
        status: 'online',
        data: healthData,
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      const isNetworkError = error.code === 'ECONNREFUSED' ||
                             error.code === 'ETIMEDOUT' ||
                             error.code === 'ENOTFOUND';

      const status = isNetworkError ? 'OFFLINE' : 'ERROR';
      const errorInfo = {
        error: error.message,
        code: error.code,
        latencyMs,
        checkedAt: new Date().toISOString(),
      };

      await this.updateHealthStatus(id, status as 'OFFLINE' | 'ERROR', errorInfo);

      return {
        status: isNetworkError ? 'offline' : 'error',
        message: error.message,
        latencyMs,
      };
    }
  }

  /**
   * 批量健康检查 (REQ-4: 批量操作支持)
   */
  async checkHealthBatch(instanceIds: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    await Promise.all(
      instanceIds.map(async (id) => {
        try {
          const result = await this.checkHealth(id);
          results.set(id, result);
        } catch (error: any) {
          results.set(id, { status: 'error', message: error.message });
        }
      }),
    );

    return results;
  }

  /**
   * 检查所有实例健康状态
   */
  async checkAllHealth(): Promise<{
    total: number;
    checked: number;
    online: number;
    offline: number;
    error: number;
  }> {
    const instances = await this.prisma.middlewareInstance.findMany({
      select: { id: true },
    });

    const results = await this.checkHealthBatch(instances.map(i => i.id));

    let online = 0, offline = 0, error = 0;
    results.forEach((result) => {
      if (result.status === 'online') online++;
      else if (result.status === 'offline') offline++;
      else error++;
    });

    return {
      total: instances.length,
      checked: results.size,
      online,
      offline,
      error,
    };
  }

  async getStats(): Promise<{
    total: number;
    online: number;
    offline: number;
    error: number;
    byTenant: { tenantId: string; tenantName: string; count: number }[];
  }> {
    const [total, online, offline, error, byTenant] = await Promise.all([
      this.prisma.middlewareInstance.count(),
      this.prisma.middlewareInstance.count({ where: { status: 'ONLINE' } }),
      this.prisma.middlewareInstance.count({ where: { status: 'OFFLINE' } }),
      this.prisma.middlewareInstance.count({ where: { status: 'ERROR' } }),
      this.prisma.middlewareInstance.groupBy({
        by: ['tenantId'],
        _count: { tenantId: true },
      }),
    ]);

    // Get tenant names
    const tenantIds = byTenant.map((t) => t.tenantId);
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    });

    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    return {
      total,
      online,
      offline,
      error,
      byTenant: byTenant.map((t) => ({
        tenantId: t.tenantId,
        tenantName: tenantMap.get(t.tenantId) || 'Unknown',
        count: t._count.tenantId,
      })),
    };
  }

  // ==================== REQ-5: 配额验证 (Task 10) ====================

  /**
   * 获取租户配额使用情况
   */
  async getQuotaUsage(tenantId: string): Promise<{
    tenantId: string;
    instances: { used: number; max: number; available: number };
    admins: { used: number; max: number; available: number };
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            instances: true,
            admins: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    return {
      tenantId,
      instances: {
        used: tenant._count.instances,
        max: tenant.maxInstances,
        available: Math.max(0, tenant.maxInstances - tenant._count.instances),
      },
      admins: {
        used: tenant._count.admins,
        max: tenant.maxAdmins,
        available: Math.max(0, tenant.maxAdmins - tenant._count.admins),
      },
    };
  }

  /**
   * 验证租户是否可以创建新实例
   */
  async validateInstanceQuota(tenantId: string): Promise<boolean> {
    const quota = await this.getQuotaUsage(tenantId);
    return quota.instances.available > 0;
  }

  /**
   * 验证租户状态是否允许操作
   */
  async validateTenantStatus(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    if (tenant.status !== 'ACTIVE') {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `租户 "${tenant.name}" 状态为 ${tenant.status}，无法执行此操作`,
        { tenantId, currentStatus: tenant.status, requiredStatus: 'ACTIVE' },
      );
    }
  }

  // ==================== REQ-6: MT5 服务器配置 (Task 11) ====================

  /**
   * 获取实例的 MT5 服务器配置
   */
  async getMT5Servers(instanceId: string): Promise<MT5ServerConfigDto[]> {
    const instance = await this.findOne(instanceId);
    return (instance.mt5Servers as unknown as MT5ServerConfigDto[]) || [];
  }

  /**
   * 更新实例的 MT5 服务器配置
   */
  async updateMT5Servers(
    instanceId: string,
    servers: MT5ServerConfigDto[],
  ): Promise<MiddlewareInstance> {
    await this.findOne(instanceId);

    // 确保最多只有一个默认服务器
    const defaultServers = servers.filter((s) => s.isDefault);
    if (defaultServers.length > 1) {
      throw new BadRequestException('只能有一个默认 MT5 服务器');
    }

    // 如果没有设置默认服务器，将第一个设为默认
    if (servers.length > 0 && defaultServers.length === 0) {
      servers[0].isDefault = true;
    }

    return this.prisma.middlewareInstance.update({
      where: { id: instanceId },
      data: { mt5Servers: servers as any },
    });
  }

  /**
   * 添加 MT5 服务器到实例
   */
  async addMT5Server(
    instanceId: string,
    server: MT5ServerConfigDto,
  ): Promise<MiddlewareInstance> {
    const instance = await this.findOne(instanceId);
    const currentServers = (instance.mt5Servers as unknown as MT5ServerConfigDto[]) || [];

    // 检查是否已存在同名服务器
    if (currentServers.some((s) => s.name === server.name)) {
      throw new BadRequestException(`MT5 服务器 "${server.name}" 已存在`);
    }

    // 如果新服务器是默认的，取消其他服务器的默认状态
    if (server.isDefault) {
      currentServers.forEach((s) => (s.isDefault = false));
    }

    // 如果是第一个服务器，设为默认
    if (currentServers.length === 0) {
      server.isDefault = true;
    }

    currentServers.push(server);

    return this.prisma.middlewareInstance.update({
      where: { id: instanceId },
      data: { mt5Servers: currentServers as any },
    });
  }

  /**
   * 移除 MT5 服务器
   */
  async removeMT5Server(
    instanceId: string,
    serverName: string,
  ): Promise<MiddlewareInstance> {
    const instance = await this.findOne(instanceId);
    const currentServers = (instance.mt5Servers as unknown as MT5ServerConfigDto[]) || [];

    const serverIndex = currentServers.findIndex((s) => s.name === serverName);
    if (serverIndex === -1) {
      throw new NotFoundException(`MT5 服务器 "${serverName}" 不存在`);
    }

    const removedServer = currentServers.splice(serverIndex, 1)[0];

    // 如果移除的是默认服务器，将第一个设为默认
    if (removedServer.isDefault && currentServers.length > 0) {
      currentServers[0].isDefault = true;
    }

    return this.prisma.middlewareInstance.update({
      where: { id: instanceId },
      data: { mt5Servers: currentServers as any },
    });
  }

  /**
   * 设置默认 MT5 服务器
   */
  async setDefaultMT5Server(
    instanceId: string,
    serverName: string,
  ): Promise<MiddlewareInstance> {
    const instance = await this.findOne(instanceId);
    const currentServers = (instance.mt5Servers as unknown as MT5ServerConfigDto[]) || [];

    const serverExists = currentServers.some((s) => s.name === serverName);
    if (!serverExists) {
      throw new NotFoundException(`MT5 服务器 "${serverName}" 不存在`);
    }

    // 更新默认状态
    currentServers.forEach((s) => {
      s.isDefault = s.name === serverName;
    });

    return this.prisma.middlewareInstance.update({
      where: { id: instanceId },
      data: { mt5Servers: currentServers as any },
    });
  }

  /**
   * 测试 MT5 服务器连接
   */
  async testMT5ServerConnection(
    instanceId: string,
    serverName: string,
  ): Promise<{
    success: boolean;
    latencyMs?: number;
    message?: string;
  }> {
    const instance = await this.findOne(instanceId);
    const servers = (instance.mt5Servers as unknown as MT5ServerConfigDto[]) || [];

    const server = servers.find((s) => s.name === serverName);
    if (!server) {
      throw new NotFoundException(`MT5 服务器 "${serverName}" 不存在`);
    }

    const startTime = Date.now();

    try {
      // 通过中间件测试 MT5 服务器连接
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(
          `http://${instance.host}:${instance.port}/api/mt5/test-connection`,
          { host: server.host, port: server.port },
          {
            headers: { 'X-API-Key': instance.apiKey },
          },
        ).pipe(
          timeout(10000),
          catchError((error: AxiosError) => {
            throw error;
          }),
        ),
      );

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        message: response.data?.message || 'Connection successful',
      };
    } catch (error: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: error.message,
      };
    }
  }

  // ==================== middleware-integration Task 5.3: 新字段处理方法 ====================

  /**
   * 更新实例的健康检查状态（增强版）
   * 支持延迟、错误消息、连续失败计数
   */
  async updateHealthStatusEnhanced(
    id: string,
    data: {
      status: InstanceStatus;
      latencyMs?: number;
      errorMessage?: string;
      healthData?: any;
      resetFailures?: boolean;
    },
  ): Promise<MiddlewareInstance> {
    const instance = await this.findOne(id);
    const now = new Date();

    // Calculate consecutive failures
    let consecutiveFailures = instance.consecutiveFailures || 0;
    if (data.status === 'ERROR' || data.status === 'OFFLINE') {
      consecutiveFailures++;
    } else if (data.resetFailures || data.status === 'ONLINE') {
      consecutiveFailures = 0;
    }

    const updateData: Prisma.MiddlewareInstanceUpdateInput = {
      status: data.status,
      lastHealthCheck: now,
      lastCheckedAt: now,
      consecutiveFailures,
    };

    if (data.latencyMs !== undefined) {
      updateData.latencyMs = data.latencyMs;
    }

    if (data.errorMessage !== undefined) {
      updateData.errorMessage = data.errorMessage;
    } else if (data.status === 'ONLINE') {
      updateData.errorMessage = null;
    }

    if (data.healthData !== undefined) {
      updateData.healthData = data.healthData;
    }

    this.logger.debug(
      `Updating health status for instance ${id}: status=${data.status}, failures=${consecutiveFailures}`,
    );

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 更新熔断器状态
   */
  async updateCircuitBreakerState(
    id: string,
    state: CircuitBreakerState,
  ): Promise<MiddlewareInstance> {
    await this.findOne(id);

    this.logger.log(`Circuit breaker state changed for instance ${id}: ${state}`);

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: { circuitBreakerState: state },
    });
  }

  /**
   * 配置 Webhook 密钥
   */
  async configureWebhook(
    id: string,
    webhookSecret: string,
  ): Promise<MiddlewareInstance> {
    await this.findOne(id);

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: { webhookSecret },
    });
  }

  /**
   * 更新实例标识符
   */
  async updateInstanceIdentifier(
    id: string,
    instanceIdentifier: string,
  ): Promise<MiddlewareInstance> {
    await this.findOne(id);

    return this.prisma.middlewareInstance.update({
      where: { id },
      data: { instanceIdentifier },
    });
  }

  /**
   * 获取需要健康检查的实例列表
   * 只返回在线或降级状态的实例
   */
  async getInstancesForHealthCheck(): Promise<MiddlewareInstance[]> {
    return this.prisma.middlewareInstance.findMany({
      where: {
        status: {
          in: ['ONLINE', 'DEGRADED', 'OFFLINE'],
        },
      },
      include: {
        tenant: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  }

  /**
   * 获取实例健康检查历史统计
   */
  async getHealthStats(id: string): Promise<{
    instanceId: string;
    status: string;
    consecutiveFailures: number;
    lastLatencyMs: number | null;
    circuitBreakerState: string;
    lastCheckedAt: Date | null;
    lastError: string | null;
  }> {
    const instance = await this.findOne(id);

    return {
      instanceId: instance.id,
      status: instance.status,
      consecutiveFailures: instance.consecutiveFailures,
      lastLatencyMs: instance.latencyMs,
      circuitBreakerState: instance.circuitBreakerState,
      lastCheckedAt: instance.lastCheckedAt,
      lastError: instance.errorMessage,
    };
  }

  /**
   * 批量获取实例状态摘要（用于仪表板）
   */
  async getStatusSummary(): Promise<{
    total: number;
    online: number;
    offline: number;
    degraded: number;
    error: number;
    circuitBreakers: {
      closed: number;
      open: number;
      halfOpen: number;
    };
  }> {
    const [
      total,
      online,
      offline,
      degraded,
      error,
      cbClosed,
      cbOpen,
      cbHalfOpen,
    ] = await Promise.all([
      this.prisma.middlewareInstance.count(),
      this.prisma.middlewareInstance.count({ where: { status: 'ONLINE' } }),
      this.prisma.middlewareInstance.count({ where: { status: 'OFFLINE' } }),
      this.prisma.middlewareInstance.count({ where: { status: 'DEGRADED' } }),
      this.prisma.middlewareInstance.count({ where: { status: 'ERROR' } }),
      this.prisma.middlewareInstance.count({ where: { circuitBreakerState: 'CLOSED' } }),
      this.prisma.middlewareInstance.count({ where: { circuitBreakerState: 'OPEN' } }),
      this.prisma.middlewareInstance.count({ where: { circuitBreakerState: 'HALF_OPEN' } }),
    ]);

    return {
      total,
      online,
      offline,
      degraded,
      error,
      circuitBreakers: {
        closed: cbClosed,
        open: cbOpen,
        halfOpen: cbHalfOpen,
      },
    };
  }

  /**
   * 根据实例标识符查找实例
   */
  async findByInstanceIdentifier(instanceIdentifier: string): Promise<MiddlewareInstance | null> {
    return this.prisma.middlewareInstance.findFirst({
      where: { instanceIdentifier },
      include: {
        tenant: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  /**
   * 验证 Webhook 密钥
   */
  async verifyWebhookSecret(id: string, secret: string): Promise<boolean> {
    const instance = await this.findOne(id);
    return instance.webhookSecret === secret;
  }
}
