import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { BootstrapService } from './bootstrap.service';
import {
  RegisterMiddlewareDto,
  RegisterMiddlewareResponseDto,
  BootstrapConfigResponseDto,
  BootstrapHeartbeatDto,
  BootstrapHeartbeatResponseDto,
} from './dto';

/**
 * 中间件引导 API 控制器
 *
 * 提供中间件无配置文件启动所需的所有端点:
 * 1. 注册 - 获取 API Key
 * 2. 配置拉取 - 获取完整启动配置
 * 3. 心跳 - 上报状态并检查配置更新
 *
 * 安全说明:
 * - /register 端点需要注册密钥验证
 * - /config 和 /heartbeat 端点需要 API Key 验证
 * - 所有端点应通过 Nginx 限流保护
 */
@ApiTags('中间件引导 API')
@Controller('api/v1/bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  /**
   * 中间件注册
   * 首次启动时调用，使用注册密钥换取 API Key
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '中间件注册',
    description: '中间件首次启动时注册，使用预分配的注册密钥换取 API Key',
  })
  @ApiResponse({
    status: 200,
    description: '注册成功',
    type: RegisterMiddlewareResponseDto,
  })
  @ApiResponse({ status: 401, description: '注册密钥验证失败' })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async register(
    @Body() dto: RegisterMiddlewareDto,
  ): Promise<RegisterMiddlewareResponseDto> {
    return this.bootstrapService.register(dto);
  }

  /**
   * 获取引导配置
   * 返回中间件启动所需的完整配置
   */
  @Get(':middlewareId/config')
  @ApiOperation({
    summary: '获取引导配置',
    description: '获取中间件启动所需的完整配置，包括基础设施、租户和服务器信息',
  })
  @ApiParam({
    name: 'middlewareId',
    description: '中间件 ID 或名称',
  })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API Key (从注册接口获取)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: '配置获取成功',
    type: BootstrapConfigResponseDto,
  })
  @ApiResponse({ status: 401, description: 'API Key 验证失败' })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async getConfig(
    @Param('middlewareId') middlewareId: string,
    @Headers('x-api-key') apiKey: string,
  ): Promise<BootstrapConfigResponseDto> {
    return this.bootstrapService.getConfig(middlewareId, apiKey);
  }

  /**
   * 心跳上报
   * 定期上报运行状态并检查配置更新
   */
  @Post(':middlewareId/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '心跳上报',
    description: '中间件定期上报运行状态，返回是否需要更新配置',
  })
  @ApiParam({
    name: 'middlewareId',
    description: '中间件 ID 或名称',
  })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API Key',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: '心跳上报成功',
    type: BootstrapHeartbeatResponseDto,
  })
  @ApiResponse({ status: 401, description: 'API Key 验证失败' })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async heartbeat(
    @Param('middlewareId') middlewareId: string,
    @Headers('x-api-key') apiKey: string,
    @Body() dto: BootstrapHeartbeatDto,
  ): Promise<BootstrapHeartbeatResponseDto> {
    return this.bootstrapService.handleHeartbeat(middlewareId, apiKey, dto);
  }

  /**
   * 健康检查
   */
  @Get('health')
  @ApiOperation({
    summary: '引导服务健康检查',
    description: '检查引导服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务正常',
  })
  async healthCheck(): Promise<{ status: string; service: string; timestamp: Date }> {
    return {
      status: 'ok',
      service: 'middleware-bootstrap',
      timestamp: new Date(),
    };
  }
}
