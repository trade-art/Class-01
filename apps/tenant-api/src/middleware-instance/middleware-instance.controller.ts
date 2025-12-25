import {
  Controller,
  Get,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators';
import { MiddlewareInstanceService } from './middleware-instance.service';
import { MiddlewareInstanceDto, MiddlewareInstanceListResponseDto } from './dto';

/**
 * 中间件实例控制器
 * 提供分配给当前租户的中间件实例查询接口
 */
@ApiTags('中间件实例')
@Controller('middleware-instances')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class MiddlewareInstanceController {
  constructor(
    private readonly middlewareInstanceService: MiddlewareInstanceService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取中间件实例列表' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: MiddlewareInstanceListResponseDto,
  })
  async getMiddlewares(
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<MiddlewareInstanceListResponseDto> {
    return this.middlewareInstanceService.getMiddlewares(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个中间件实例详情' })
  @ApiParam({ name: 'id', description: '中间件 ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: MiddlewareInstanceDto,
  })
  @ApiResponse({ status: 404, description: '中间件不存在或未分配给当前租户' })
  async getMiddleware(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<MiddlewareInstanceDto> {
    const middleware = await this.middlewareInstanceService.getMiddleware(
      tenantId,
      id,
    );

    if (!middleware) {
      throw new NotFoundException('中间件不存在或未分配给当前租户');
    }

    return middleware;
  }
}
