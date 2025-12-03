import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TradingDataService } from './trading-data.service';
import {
  TradingHistoryQueryDto,
  TradingOrderDto,
  AccountBalanceDto,
  TradingStatsDto,
  TenantTradingOverviewDto,
  OpenPositionDto,
  AggregatedTradingDataDto,
} from './dto/trading-data.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('trading-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('trading-data')
export class TradingDataController {
  constructor(private readonly tradingDataService: TradingDataService) {}

  // ==================== 平台概览 (REQ-8) ====================

  @Get('overview')
  @ApiOperation({ summary: '获取所有租户的交易概览' })
  @ApiResponse({ status: 200, description: '租户交易概览列表', type: [TenantTradingOverviewDto] })
  getAllTenantsOverview() {
    return this.tradingDataService.getAllTenantsOverview();
  }

  @Get('overview/tenant/:tenantId')
  @ApiOperation({ summary: '获取指定租户的交易概览' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '租户交易概览', type: TenantTradingOverviewDto })
  getTenantOverview(@Param('tenantId') tenantId: string) {
    return this.tradingDataService.getTenantOverview(tenantId);
  }

  // ==================== 交易历史 ====================

  @Get('history')
  @ApiOperation({ summary: '查询交易历史' })
  @ApiResponse({ status: 200, description: '交易历史列表' })
  getTradingHistory(@Query() query: TradingHistoryQueryDto) {
    return this.tradingDataService.getTradingHistory(query);
  }

  // ==================== 实时数据 ====================

  @Get('positions')
  @ApiOperation({ summary: '获取实时持仓' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'instanceId', required: false })
  @ApiQuery({ name: 'login', required: false, type: Number })
  @ApiResponse({ status: 200, description: '持仓列表', type: [OpenPositionDto] })
  getOpenPositions(
    @Query('tenantId') tenantId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('login') login?: number,
  ) {
    return this.tradingDataService.getOpenPositions(tenantId, instanceId, login);
  }

  @Get('balances')
  @ApiOperation({ summary: '获取账户余额' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'instanceId', required: false })
  @ApiResponse({ status: 200, description: '账户余额列表', type: [AccountBalanceDto] })
  getAccountBalances(
    @Query('tenantId') tenantId?: string,
    @Query('instanceId') instanceId?: string,
  ) {
    return this.tradingDataService.getAccountBalances(tenantId, instanceId);
  }

  // ==================== 统计分析 ====================

  @Get('stats')
  @ApiOperation({ summary: '获取交易统计' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'instanceId', required: false })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiResponse({ status: 200, description: '交易统计', type: TradingStatsDto })
  getTradingStats(
    @Query('tenantId') tenantId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.tradingDataService.getTradingStats(
      tenantId,
      instanceId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  @Get('aggregated/:tenantId')
  @ApiOperation({ summary: '获取聚合交易数据' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({ name: 'period', enum: ['daily', 'weekly', 'monthly'], required: true })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: '聚合数据', type: [AggregatedTradingDataDto] })
  getAggregatedData(
    @Param('tenantId') tenantId: string,
    @Query('period') period: 'daily' | 'weekly' | 'monthly',
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.tradingDataService.getAggregatedData(
      tenantId,
      period,
      new Date(fromDate),
      new Date(toDate),
    );
  }

  // ==================== 特定租户/实例查询 ====================

  @Get('tenant/:tenantId/history')
  @ApiOperation({ summary: '获取租户的交易历史' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '交易历史' })
  getTenantHistory(
    @Param('tenantId') tenantId: string,
    @Query() query: Omit<TradingHistoryQueryDto, 'tenantId'>,
  ) {
    return this.tradingDataService.getTradingHistory({ ...query, tenantId });
  }

  @Get('instance/:instanceId/history')
  @ApiOperation({ summary: '获取实例的交易历史' })
  @ApiParam({ name: 'instanceId', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: '交易历史' })
  getInstanceHistory(
    @Param('instanceId') instanceId: string,
    @Query() query: Omit<TradingHistoryQueryDto, 'instanceId'>,
  ) {
    return this.tradingDataService.getTradingHistory({ ...query, instanceId });
  }

  @Get('instance/:instanceId/positions')
  @ApiOperation({ summary: '获取实例的实时持仓' })
  @ApiParam({ name: 'instanceId', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: '持仓列表', type: [OpenPositionDto] })
  getInstancePositions(@Param('instanceId') instanceId: string) {
    return this.tradingDataService.getOpenPositions(undefined, instanceId);
  }

  @Get('instance/:instanceId/balances')
  @ApiOperation({ summary: '获取实例的账户余额' })
  @ApiParam({ name: 'instanceId', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: '账户余额列表', type: [AccountBalanceDto] })
  getInstanceBalances(@Param('instanceId') instanceId: string) {
    return this.tradingDataService.getAccountBalances(undefined, instanceId);
  }
}
