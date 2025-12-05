import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { HealthService, SystemHealthStatus, TenantHealthStatus, ServerHealthStatus, CircuitBreakerStatus } from './health.service';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';

/**
 * 健康监控控制器
 * 提供系统、租户、服务器级别的健康检查 API
 */
@ApiTags('健康监控')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // ============================================================
  // 公开健康检查端点 (用于 K8s probes)
  // ============================================================

  /**
   * 存活检查 (Liveness Probe)
   * 用于 K8s 检测应用是否存活
   */
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '健康检查', description: '检查 API 服务是否正常运行' })
  @ApiResponse({ status: 200, description: '服务正常' })
  @ApiResponse({ status: 503, description: '服务不可用' })
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    const isHealthy = await this.healthService.isHealthy();
    if (!isHealthy) {
      throw new ForbiddenException('服务不可用');
    }
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }

  /**
   * 就绪检查 (Readiness Probe)
   * 用于 K8s 检测应用是否准备好接收流量
   */
  @Get('ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '就绪检查', description: '检查服务是否准备好接收请求' })
  @ApiResponse({ status: 200, description: '服务就绪' })
  @ApiResponse({ status: 503, description: '服务未就绪' })
  async readinessCheck(): Promise<{ status: string; timestamp: Date }> {
    const isReady = await this.healthService.isReady();
    if (!isReady) {
      throw new ForbiddenException('服务未就绪');
    }
    return {
      status: 'ready',
      timestamp: new Date(),
    };
  }

  // ============================================================
  // 系统级健康状态
  // ============================================================

  /**
   * 获取系统整体健康状态
   */
  @Get('system')
  @ApiBearerAuth()
  @ApiOperation({ summary: '系统健康状态', description: '获取系统整体健康状态和统计信息' })
  @ApiQuery({ name: 'details', required: false, type: Boolean, description: '是否包含租户详情' })
  @ApiResponse({ status: 200, description: '返回系统健康状态' })
  async getSystemHealth(
    @Query('details') details?: string,
  ): Promise<SystemHealthStatus> {
    const includeDetails = details === 'true';
    return this.healthService.getSystemHealth(includeDetails);
  }

  // ============================================================
  // 服务器级健康状态
  // ============================================================

  /**
   * 获取所有服务器的健康状态
   */
  @Get('servers')
  @ApiBearerAuth()
  @ApiOperation({ summary: '所有服务器状态', description: '获取所有活跃服务器的健康状态' })
  @ApiResponse({ status: 200, description: '返回服务器健康状态列表' })
  async getAllServersHealth(): Promise<{ servers: ServerHealthStatus[] }> {
    const servers = await this.healthService.getAllServersHealth();
    return { servers };
  }

  /**
   * 获取当前租户的健康状态
   */
  @Get('tenant')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前租户健康状态', description: '获取当前登录租户的健康状态' })
  @ApiResponse({ status: 200, description: '返回租户健康状态' })
  async getCurrentTenantHealth(
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantHealthStatus> {
    return this.healthService.getTenantHealth(user.tenantId);
  }

  /**
   * 获取指定租户的健康状态 (管理员权限)
   */
  @Get('tenant/:tenantId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '指定租户健康状态', description: '获取指定租户的健康状态 (需管理员权限)' })
  @ApiResponse({ status: 200, description: '返回租户健康状态' })
  @ApiResponse({ status: 403, description: '无权访问' })
  async getTenantHealth(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantHealthStatus> {
    // 只有 owner 或访问自己租户的管理员可以查看
    if (user.role !== 'owner' && user.tenantId !== tenantId) {
      throw new ForbiddenException('无权访问其他租户的健康状态');
    }
    return this.healthService.getTenantHealth(tenantId);
  }

  /**
   * 检查单个服务器的健康状态
   */
  @Get('server/:tenantId/:serverId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '服务器健康状态', description: '检查指定服务器的健康状态' })
  @ApiResponse({ status: 200, description: '返回服务器健康状态' })
  @ApiResponse({ status: 403, description: '无权访问' })
  async checkServerHealth(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ServerHealthStatus> {
    // 只有 owner 或访问自己租户的管理员可以查看
    if (user.role !== 'owner' && user.tenantId !== tenantId) {
      throw new ForbiddenException('无权访问其他租户的服务器状态');
    }
    return this.healthService.checkServerHealth(tenantId, serverId);
  }

  // ============================================================
  // 熔断器管理
  // ============================================================

  /**
   * 获取所有熔断器状态
   */
  @Get('circuit-breakers')
  @ApiBearerAuth()
  @ApiOperation({ summary: '所有熔断器状态', description: '获取所有服务器的熔断器状态' })
  @ApiResponse({ status: 200, description: '返回熔断器状态列表' })
  async getAllCircuitBreakerStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ circuitBreakers: CircuitBreakerStatus[] }> {
    // 只有 owner 可以查看所有熔断器状态
    if (user.role !== 'owner') {
      throw new ForbiddenException('只有 owner 可以查看所有熔断器状态');
    }
    const circuitBreakers = await this.healthService.getAllCircuitBreakerStatus();
    return { circuitBreakers };
  }

  /**
   * 获取单个服务器的熔断器状态
   */
  @Get('circuit-breaker/:tenantId/:serverId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '熔断器状态', description: '获取指定服务器的熔断器状态' })
  @ApiResponse({ status: 200, description: '返回熔断器状态' })
  @ApiResponse({ status: 403, description: '无权访问' })
  async getCircuitBreakerStatus(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CircuitBreakerStatus> {
    // 只有 owner 或访问自己租户的管理员可以查看
    if (user.role !== 'owner' && user.tenantId !== tenantId) {
      throw new ForbiddenException('无权访问其他租户的熔断器状态');
    }
    return this.healthService.getCircuitBreakerStatus(tenantId, serverId);
  }

  /**
   * 重置熔断器
   */
  @Post('circuit-breaker/:tenantId/:serverId/reset')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置熔断器', description: '重置指定服务器的熔断器状态 (需管理员权限)' })
  @ApiResponse({ status: 200, description: '熔断器已重置' })
  @ApiResponse({ status: 403, description: '无权操作' })
  async resetCircuitBreaker(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    // 只有 owner 或 admin 可以重置熔断器
    if (user.role === 'operator') {
      throw new ForbiddenException('操作员无权重置熔断器');
    }

    // 非 owner 只能重置自己租户的熔断器
    if (user.role !== 'owner' && user.tenantId !== tenantId) {
      throw new ForbiddenException('无权重置其他租户的熔断器');
    }

    const success = await this.healthService.resetCircuitBreaker(tenantId, serverId);
    return {
      success,
      message: success ? '熔断器已重置' : '重置失败',
    };
  }

  /**
   * 清除健康缓存
   */
  @Post('cache/clear')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除健康缓存', description: '清除所有健康状态缓存 (需 owner 权限)' })
  @ApiResponse({ status: 200, description: '缓存已清除' })
  @ApiResponse({ status: 403, description: '无权操作' })
  async clearHealthCache(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    if (user.role !== 'owner') {
      throw new ForbiddenException('只有 owner 可以清除健康缓存');
    }

    this.healthService.clearHealthCache();
    return {
      success: true,
      message: '健康缓存已清除',
    };
  }
}
