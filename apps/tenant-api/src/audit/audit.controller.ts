/**
 * 审计日志控制器
 * 提供审计日志查询 API
 */

import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AuditService, PaginatedAuditLogsResponse, QueryAuditLogsDto } from './audit.service';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { RateLimitGuard, RateLimit } from '../security';
import { AuditLogEntry, AuditLogStats } from '../security/audit-logger.service';

@ApiTags('审计日志')
@Controller('audit')
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '查询审计日志' })
  @ApiQuery({ name: 'userId', required: false, description: '用户 ID' })
  @ApiQuery({ name: 'action', required: false, description: '操作类型' })
  @ApiQuery({ name: 'resource', required: false, description: '资源类型' })
  @ApiQuery({ name: 'resourceId', required: false, description: '资源 ID' })
  @ApiQuery({ name: 'status', required: false, description: '状态' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始时间 (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束时间 (ISO 8601)' })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'action', 'resource'], description: '排序字段' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: '排序方向' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '查询成功',
  })
  async queryLogs(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'action' | 'resource',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ): Promise<PaginatedAuditLogsResponse> {
    const query: QueryAuditLogsDto = {
      userId,
      action,
      resource,
      resourceId,
      status,
      startDate,
      endDate,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
    };

    return this.auditService.queryLogs(user.tenantId, query);
  }

  @Get('logs/:id')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '获取审计日志详情' })
  @ApiParam({ name: 'id', description: '日志 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '日志不存在',
  })
  async getLogById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<AuditLogEntry | null> {
    return this.auditService.getById(user.tenantId, id);
  }

  @Get('stats')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '获取审计统计' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始时间 (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束时间 (ISO 8601)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  async getStats(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditLogStats> {
    return this.auditService.getStats(user.tenantId, startDate, endDate);
  }

  @Get('my-activity')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '获取当前用户最近活动' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '数量限制' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  async getMyActivity(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ): Promise<AuditLogEntry[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.auditService.getRecentByUser(user.sub, parsedLimit);
  }

  @Get('action-distribution')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '获取操作类型分布' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始时间 (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束时间 (ISO 8601)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  async getActionDistribution(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Record<string, number>> {
    return this.auditService.getActionDistribution(user.tenantId, startDate, endDate);
  }

  @Get('resource-distribution')
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '获取资源类型分布' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始时间 (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束时间 (ISO 8601)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  async getResourceDistribution(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Record<string, number>> {
    return this.auditService.getResourceDistribution(user.tenantId, startDate, endDate);
  }
}
