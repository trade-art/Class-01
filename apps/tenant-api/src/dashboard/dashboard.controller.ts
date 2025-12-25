import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, JwtPayload } from '../auth';
import {
  DashboardDataDto,
  DashboardBaseDataDto,
  TradingStatsDto,
  AccountSummaryDto,
  PositionsSummaryDto,
  QuickStatsDto,
  SystemStatusDto,
} from './dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: '获取 Dashboard 完整数据' })
  @ApiQuery({ name: 'serverId', required: false, description: 'MT 服务器 ID，不传则使用默认服务器' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard 数据',
    type: DashboardDataDto,
  })
  async getDashboardData(
    @CurrentUser() user: JwtPayload,
    @Query('serverId') serverId?: string,
  ): Promise<DashboardDataDto> {
    // 使用传入的 serverId，或回退到 JWT 中的默认服务器
    const targetServerId = serverId || user.serverId;
    this.logger.debug(`[DEBUG] getDashboardData: query.serverId=${serverId}, jwt.serverId=${user.serverId}, targetServerId=${targetServerId}`);
    return this.dashboardService.getDashboardData(
      user.instanceId,
      targetServerId,
      user.tenantId,
    );
  }

  @Get('base')
  @ApiOperation({ summary: '获取 Dashboard 基础数据（快速加载，不含交易历史）' })
  @ApiQuery({ name: 'serverId', required: false, description: 'MT 服务器 ID，不传则使用默认服务器' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard 基础数据',
    type: DashboardBaseDataDto,
  })
  async getDashboardBaseData(
    @CurrentUser() user: JwtPayload,
    @Query('serverId') serverId?: string,
  ): Promise<DashboardBaseDataDto> {
    const targetServerId = serverId || user.serverId;
    this.logger.debug(`[DEBUG] getDashboardBaseData: serverId=${targetServerId}`);
    return this.dashboardService.getDashboardBaseData(
      user.instanceId,
      targetServerId,
      user.tenantId,
    );
  }

  @Get('trading-stats')
  @ApiOperation({ summary: '获取交易统计数据（异步加载交易历史相关数据）' })
  @ApiQuery({ name: 'serverId', required: false, description: 'MT 服务器 ID，不传则使用默认服务器' })
  @ApiResponse({
    status: 200,
    description: '交易统计数据',
    type: TradingStatsDto,
  })
  async getTradingStats(
    @CurrentUser() user: JwtPayload,
    @Query('serverId') serverId?: string,
  ): Promise<TradingStatsDto> {
    const targetServerId = serverId || user.serverId;
    this.logger.debug(`[DEBUG] getTradingStats: serverId=${targetServerId}`);
    return this.dashboardService.getTradingStats(
      user.instanceId,
      targetServerId,
      user.tenantId,
    );
  }

  @Get('status')
  @ApiOperation({ summary: '获取系统状态（轻量级）' })
  @ApiResponse({
    status: 200,
    description: '系统状态',
    type: SystemStatusDto,
  })
  async getSystemStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<SystemStatusDto> {
    return this.dashboardService.getSystemStatus(user.instanceId, user.tenantId);
  }

  @Get('account')
  @ApiOperation({ summary: '获取账户摘要' })
  @ApiResponse({
    status: 200,
    description: '账户摘要',
    type: AccountSummaryDto,
  })
  async getAccountSummary(
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountSummaryDto> {
    return this.dashboardService.getAccountSummary(user.instanceId, user.serverId, user.tenantId);
  }

  @Get('positions')
  @ApiOperation({ summary: '获取持仓统计' })
  @ApiResponse({
    status: 200,
    description: '持仓统计',
    type: PositionsSummaryDto,
  })
  async getPositionsSummary(
    @CurrentUser() user: JwtPayload,
  ): Promise<PositionsSummaryDto> {
    return this.dashboardService.getPositionsSummary(user.instanceId, user.serverId, user.tenantId);
  }

  @Get('quick-stats')
  @ApiOperation({ summary: '获取快速统计 (今日/本周/本月盈亏)' })
  @ApiResponse({
    status: 200,
    description: '快速统计',
    type: QuickStatsDto,
  })
  async getQuickStats(
    @CurrentUser() user: JwtPayload,
  ): Promise<QuickStatsDto> {
    return this.dashboardService.getQuickStats(user.instanceId, user.serverId, user.tenantId);
  }
}
