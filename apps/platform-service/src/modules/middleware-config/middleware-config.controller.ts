import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { MiddlewareConfigService } from './middleware-config.service';
import {
  MiddlewareConfigResponseDto,
  HeartbeatDto,
  HeartbeatResponseDto,
} from './dto';
import { ApiKeyGuard, MiddlewareRequest } from '../../common/guards/api-key.guard';

/**
 * 中间件内部配置 API 控制器
 * 供中间件实例拉取配置和上报心跳
 *
 * 所有端点都需要 API Key 认证 (X-Middleware-API-Key header)
 */
@ApiTags('中间件内部配置 API')
@ApiHeader({
  name: 'X-Middleware-API-Key',
  description: '中间件 API Key',
  required: true,
})
@Controller('internal/middleware')
@UseGuards(ApiKeyGuard)
export class MiddlewareConfigController {
  constructor(private readonly configService: MiddlewareConfigService) {}

  /**
   * 获取中间件配置
   * 返回分配给该中间件的所有租户配置
   */
  @Get('config')
  @ApiOperation({
    summary: '获取中间件配置',
    description: '返回分配给该中间件的所有租户及其 MT 服务器配置，包含解密后的敏感信息',
  })
  @ApiResponse({
    status: 200,
    description: '配置获取成功',
    type: MiddlewareConfigResponseDto,
  })
  @ApiResponse({ status: 401, description: 'API Key 认证失败' })
  async getConfig(
    @Request() req: MiddlewareRequest,
  ): Promise<MiddlewareConfigResponseDto> {
    return this.configService.getConfig(req.middleware.id);
  }

  /**
   * 上报心跳
   * 中间件定期上报运行状态
   */
  @Post('heartbeat')
  @ApiOperation({
    summary: '上报心跳',
    description: '中间件定期上报运行状态，包括 IP、会话数、资源使用率等',
  })
  @ApiResponse({
    status: 200,
    description: '心跳上报成功',
    type: HeartbeatResponseDto,
  })
  @ApiResponse({ status: 401, description: 'API Key 认证失败' })
  async heartbeat(
    @Request() req: MiddlewareRequest,
    @Body() heartbeatDto: HeartbeatDto,
  ): Promise<HeartbeatResponseDto> {
    return this.configService.handleHeartbeat(req.middleware.id, heartbeatDto);
  }

  /**
   * 健康检查端点 (供内部负载均衡使用)
   */
  @Get('health')
  @ApiOperation({
    summary: '中间件健康检查',
    description: '验证 API Key 并返回中间件基本信息',
  })
  @ApiResponse({
    status: 200,
    description: '健康检查通过',
  })
  @ApiResponse({ status: 401, description: 'API Key 认证失败' })
  async healthCheck(
    @Request() req: MiddlewareRequest,
  ): Promise<{ status: string; middlewareId: string; middlewareName: string }> {
    return {
      status: 'ok',
      middlewareId: req.middleware.id,
      middlewareName: req.middleware.name,
    };
  }
}
