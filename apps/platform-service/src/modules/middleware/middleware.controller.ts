import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MiddlewareService } from './middleware.service';
import { HealthCheckService } from './services/health-check.service';
import {
  CreateMiddlewareDto,
  UpdateMiddlewareDto,
  QueryMiddlewareDto,
  MiddlewareResponseDto,
  MiddlewareWithApiKeyDto,
  RegenerateRegistrationSecretResponseDto,
  MiddlewareConfigDto,
  UpdateMiddlewareConfigDto,
} from './dto';
import { MiddlewareRuntimeConfigService } from './services/middleware-config.service';
import { MiddlewareStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

/**
 * 中间件管理控制器
 * 提供中间件的 CRUD API，仅限 SaaS 管理员访问
 */
@ApiTags('中间件管理')
@ApiBearerAuth()
@Controller('middlewares')
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
export class MiddlewareController {
  constructor(
    private readonly middlewareService: MiddlewareService,
    private readonly healthCheckService: HealthCheckService,
    private readonly configService: MiddlewareRuntimeConfigService,
  ) {}

  /**
   * 创建中间件
   */
  @Post()
  @ApiOperation({ summary: '创建中间件', description: '创建新的中间件实例并生成 API Key' })
  @ApiResponse({
    status: 201,
    description: '创建成功，返回包含 API Key 的中间件信息',
    type: MiddlewareWithApiKeyDto,
  })
  @ApiResponse({ status: 409, description: 'URL 已存在' })
  async create(@Body() dto: CreateMiddlewareDto): Promise<MiddlewareWithApiKeyDto> {
    return this.middlewareService.create(dto);
  }

  /**
   * 获取中间件列表
   */
  @Get()
  @ApiOperation({ summary: '获取中间件列表', description: '获取所有中间件，支持筛选和搜索' })
  @ApiResponse({
    status: 200,
    description: '中间件列表',
    type: [MiddlewareResponseDto],
  })
  async findAll(@Query() query: QueryMiddlewareDto): Promise<MiddlewareResponseDto[]> {
    return this.middlewareService.findAll(query);
  }

  /**
   * 获取中间件详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取中间件详情', description: '根据 ID 获取中间件详细信息' })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '中间件详情',
    type: MiddlewareResponseDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async findOne(@Param('id') id: string): Promise<MiddlewareResponseDto> {
    return this.middlewareService.findOne(id);
  }

  /**
   * 更新中间件
   */
  @Patch(':id')
  @ApiOperation({ summary: '更新中间件', description: '更新中间件信息' })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: MiddlewareResponseDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  @ApiResponse({ status: 409, description: 'URL 冲突' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMiddlewareDto,
  ): Promise<MiddlewareResponseDto> {
    return this.middlewareService.update(id, dto);
  }

  /**
   * 删除中间件
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除中间件', description: '删除中间件（需先解除所有租户分配）' })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  @ApiResponse({ status: 409, description: '仍有租户分配' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.middlewareService.remove(id);
  }

  /**
   * 重新生成注册密钥
   */
  @Post(':id/regenerate-secret')
  @ApiOperation({
    summary: '重新生成注册密钥',
    description: '重新生成中间件的注册密钥，中间件需要使用新密钥重新启动',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '新注册密钥',
    type: RegenerateRegistrationSecretResponseDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async regenerateRegistrationSecret(@Param('id') id: string): Promise<RegenerateRegistrationSecretResponseDto> {
    return this.middlewareService.regenerateRegistrationSecret(id);
  }

  /**
   * 测试中间件连接
   */
  @Post(':id/test')
  @ApiOperation({
    summary: '测试连接',
    description: '测试与中间件的网络连接，返回连接状态和延迟',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '连接测试结果',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        latency: { type: 'number', description: '延迟时间（毫秒）' },
      },
    },
  })
  async testConnection(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    return this.healthCheckService.testConnection(id);
  }

  /**
   * 触发健康检查
   */
  @Post(':id/health-check')
  @ApiOperation({
    summary: '触发健康检查',
    description: '立即对指定中间件执行健康检查',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '健康检查结果',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(MiddlewareStatus) },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async triggerHealthCheck(
    @Param('id') id: string,
  ): Promise<{ status: MiddlewareStatus; message: string }> {
    const status = await this.healthCheckService.triggerHealthCheck(id);
    return {
      status,
      message: `健康检查完成，当前状态: ${status}`,
    };
  }

  /**
   * 获取单个中间件健康状态
   */
  @Get(':id/health')
  @ApiOperation({
    summary: '获取中间件健康状态',
    description: '获取指定中间件的健康状态和监控指标',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '中间件健康状态',
    type: MiddlewareResponseDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async getHealth(@Param('id') id: string): Promise<MiddlewareResponseDto> {
    // 先触发健康检查更新数据
    await this.healthCheckService.triggerHealthCheck(id);
    // 返回更新后的中间件信息
    return this.middlewareService.findOne(id);
  }

  /**
   * 获取所有中间件健康状态摘要
   */
  @Get('health/summary')
  @ApiOperation({
    summary: '获取健康状态摘要',
    description: '获取所有中间件的健康状态统计',
  })
  @ApiResponse({
    status: 200,
    description: '健康状态摘要',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        online: { type: 'number' },
        offline: { type: 'number' },
        degraded: { type: 'number' },
        error: { type: 'number' },
        unknown: { type: 'number' },
      },
    },
  })
  async getHealthSummary(): Promise<{
    total: number;
    online: number;
    offline: number;
    degraded: number;
    error: number;
    unknown: number;
  }> {
    const middlewares = await this.middlewareService.findAll({});
    const summary = {
      total: middlewares.length,
      online: 0,
      offline: 0,
      degraded: 0,
      error: 0,
      unknown: 0,
    };

    for (const mw of middlewares) {
      switch (mw.status) {
        case MiddlewareStatus.ONLINE:
          summary.online++;
          break;
        case MiddlewareStatus.OFFLINE:
          summary.offline++;
          break;
        case MiddlewareStatus.DEGRADED:
          summary.degraded++;
          break;
        case MiddlewareStatus.ERROR:
          summary.error++;
          break;
        default:
          summary.unknown++;
      }
    }

    return summary;
  }

  // ==================== 运行时配置 API ====================

  /**
   * 获取中间件运行时配置
   */
  @Get(':id/config')
  @ApiOperation({
    summary: '获取运行时配置',
    description: '获取中间件的运行时配置参数（速率限制、熔断器、缓存等）',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '运行时配置',
    type: MiddlewareConfigDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async getConfig(@Param('id') id: string): Promise<MiddlewareConfigDto> {
    return this.configService.getConfig(id);
  }

  /**
   * 更新中间件运行时配置
   */
  @Patch(':id/config')
  @ApiOperation({
    summary: '更新运行时配置',
    description: '更新中间件的运行时配置参数',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '更新后的配置',
    type: MiddlewareConfigDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateMiddlewareConfigDto,
  ): Promise<MiddlewareConfigDto> {
    return this.configService.updateConfig(id, dto);
  }

  /**
   * 重置中间件运行时配置
   */
  @Post(':id/config/reset')
  @ApiOperation({
    summary: '重置运行时配置',
    description: '将中间件的运行时配置重置为默认值',
  })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '重置后的配置',
    type: MiddlewareConfigDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async resetConfig(@Param('id') id: string): Promise<MiddlewareConfigDto> {
    return this.configService.resetConfig(id);
  }
}
