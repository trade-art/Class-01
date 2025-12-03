import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, JwtPayload } from '../auth';
import {
  DashboardDataDto,
  AccountSummaryDto,
  PositionsSummaryDto,
  QuickStatsDto,
} from './dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: '获取 Dashboard 完整数据' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard 数据',
    type: DashboardDataDto,
  })
  async getDashboardData(
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardDataDto> {
    return this.dashboardService.getDashboardData(user.instanceId);
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
    return this.dashboardService.getAccountSummary(user.instanceId);
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
    return this.dashboardService.getPositionsSummary(user.instanceId);
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
    return this.dashboardService.getQuickStats(user.instanceId);
  }
}
