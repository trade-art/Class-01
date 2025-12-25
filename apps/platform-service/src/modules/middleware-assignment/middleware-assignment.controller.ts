import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MiddlewareAssignmentService } from './middleware-assignment.service';
import {
  AssignTenantDto,
  MiddlewareAssignmentResponseDto,
  TenantMiddlewareInfoDto,
  MiddlewareCapacityDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';

/**
 * 中间件分配管理控制器
 * 由 SaaS 管理员管理中间件与租户的分配关系
 */
@ApiTags('中间件分配管理')
@ApiBearerAuth()
@Controller('middleware-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class MiddlewareAssignmentController {
  constructor(private readonly assignmentService: MiddlewareAssignmentService) {}

  /**
   * 获取所有中间件的容量信息
   */
  @Get('capacity')
  @ApiOperation({ summary: '获取所有中间件容量信息' })
  @ApiResponse({ status: 200, description: '成功', type: [MiddlewareCapacityDto] })
  async getAllCapacity(): Promise<MiddlewareCapacityDto[]> {
    return this.assignmentService.getAllMiddlewareCapacity();
  }

  /**
   * 获取可分配的中间件列表
   */
  @Get('available')
  @ApiOperation({ summary: '获取可分配的中间件列表' })
  @ApiResponse({ status: 200, description: '成功', type: [MiddlewareCapacityDto] })
  async getAvailableMiddlewares(): Promise<MiddlewareCapacityDto[]> {
    return this.assignmentService.getAvailableMiddlewares();
  }

  /**
   * 获取中间件的所有分配租户
   */
  @Get('middleware/:middlewareId')
  @ApiOperation({ summary: '获取中间件的所有分配租户' })
  @ApiParam({ name: 'middlewareId', description: '中间件 ID' })
  @ApiResponse({ status: 200, description: '成功', type: [MiddlewareAssignmentResponseDto] })
  @ApiResponse({ status: 404, description: '中间件不存在' })
  async getAssignmentsByMiddleware(
    @Param('middlewareId') middlewareId: string,
  ): Promise<MiddlewareAssignmentResponseDto[]> {
    return this.assignmentService.getAssignmentsByMiddleware(middlewareId);
  }

  /**
   * 获取租户的中间件分配信息
   */
  @Get('tenant/:tenantId')
  @ApiOperation({ summary: '获取租户的中间件分配信息' })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiResponse({ status: 200, description: '成功', type: TenantMiddlewareInfoDto })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async getMiddlewareByTenant(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantMiddlewareInfoDto | null> {
    return this.assignmentService.getMiddlewareByTenant(tenantId);
  }

  /**
   * 分配租户到中间件
   */
  @Post('middleware/:middlewareId/assign')
  @ApiOperation({ summary: '分配租户到中间件' })
  @ApiParam({ name: 'middlewareId', description: '中间件 ID' })
  @ApiResponse({ status: 201, description: '分配成功', type: MiddlewareAssignmentResponseDto })
  @ApiResponse({ status: 404, description: '中间件或租户不存在' })
  @ApiResponse({ status: 409, description: '分配冲突（已分配、容量不足等）' })
  async assignTenant(
    @Param('middlewareId') middlewareId: string,
    @Body() dto: AssignTenantDto,
    @Request() req: { user: { sub: string } },
  ): Promise<MiddlewareAssignmentResponseDto> {
    return this.assignmentService.assign(middlewareId, dto.tenantId, req.user.sub);
  }

  /**
   * 取消租户的中间件分配
   */
  @Delete('middleware/:middlewareId/tenant/:tenantId')
  @ApiOperation({ summary: '取消租户的中间件分配' })
  @ApiParam({ name: 'middlewareId', description: '中间件 ID' })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiResponse({ status: 200, description: '取消分配成功' })
  @ApiResponse({ status: 404, description: '分配关系不存在' })
  async unassignTenant(
    @Param('middlewareId') middlewareId: string,
    @Param('tenantId') tenantId: string,
  ): Promise<{ message: string }> {
    await this.assignmentService.unassign(middlewareId, tenantId);
    return { message: '取消分配成功' };
  }

  /**
   * 批量分配租户到中间件
   */
  @Post('middleware/:middlewareId/batch-assign')
  @ApiOperation({ summary: '批量分配租户到中间件' })
  @ApiParam({ name: 'middlewareId', description: '中间件 ID' })
  @ApiResponse({ status: 201, description: '批量分配完成' })
  async batchAssignTenants(
    @Param('middlewareId') middlewareId: string,
    @Body() dto: { tenantIds: string[] },
    @Request() req: { user: { sub: string } },
  ): Promise<{
    success: string[];
    failed: { tenantId: string; reason: string }[];
  }> {
    return this.assignmentService.batchAssign(middlewareId, dto.tenantIds, req.user.sub);
  }
}
