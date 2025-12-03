import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

/**
 * 报表周期枚举
 */
export enum ReportPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * 导出格式枚举
 */
export enum ExportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
}

/**
 * 报表查询 DTO
 */
export class ReportQueryDto {
  @ApiPropertyOptional({ description: '报表周期', enum: ReportPeriod, default: ReportPeriod.DAY })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod = ReportPeriod.DAY;

  @ApiPropertyOptional({ description: '开始日期 (ISO 8601)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期 (ISO 8601)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 导出报表 DTO
 */
export class ExportReportDto extends ReportQueryDto {
  @ApiPropertyOptional({ description: '导出格式', enum: ExportFormat, default: ExportFormat.EXCEL })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.EXCEL;
}

/**
 * 趋势数据点
 */
export class TrendDataPointDto {
  @ApiProperty({ description: '日期' })
  date: string;

  @ApiProperty({ description: '数值' })
  value: number;
}

/**
 * 品种分析 DTO
 */
export class SymbolAnalysisDto {
  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '交易量' })
  volume: number;

  @ApiProperty({ description: '订单数' })
  orderCount: number;

  @ApiProperty({ description: '占比 (%)' })
  percentage: number;
}

/**
 * 时段分析 DTO
 */
export class HourlyAnalysisDto {
  @ApiProperty({ description: '小时 (0-23)' })
  hour: number;

  @ApiProperty({ description: '订单数' })
  orderCount: number;

  @ApiProperty({ description: '交易量' })
  volume: number;
}

/**
 * 交易报表 DTO
 */
export class TradingReportDto {
  @ApiProperty({ description: '报表周期' })
  period: string;

  @ApiProperty({ description: '开始日期' })
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  endDate: string;

  @ApiProperty({ description: '总交易量' })
  totalVolume: number;

  @ApiProperty({ description: '总交易额' })
  totalAmount: number;

  @ApiProperty({ description: '总订单数' })
  totalOrders: number;

  @ApiProperty({ description: '交易量趋势', type: [TrendDataPointDto] })
  volumeTrend: TrendDataPointDto[];

  @ApiProperty({ description: '交易额趋势', type: [TrendDataPointDto] })
  amountTrend: TrendDataPointDto[];

  @ApiProperty({ description: '品种分析', type: [SymbolAnalysisDto] })
  symbolAnalysis: SymbolAnalysisDto[];

  @ApiProperty({ description: '时段分析', type: [HourlyAnalysisDto] })
  hourlyAnalysis: HourlyAnalysisDto[];
}

/**
 * 用户价值排名 DTO
 */
export class UserValueRankDto {
  @ApiProperty({ description: '用户登录号' })
  login: number;

  @ApiProperty({ description: '用户名' })
  name: string;

  @ApiProperty({ description: '交易量' })
  volume: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '手续费' })
  commission: number;
}

/**
 * 分组统计 DTO
 */
export class GroupStatsDto {
  @ApiProperty({ description: '组别' })
  group: string;

  @ApiProperty({ description: '用户数' })
  userCount: number;

  @ApiProperty({ description: '交易量' })
  volume: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;
}

/**
 * 用户报表 DTO
 */
export class UsersReportDto {
  @ApiProperty({ description: '报表周期' })
  period: string;

  @ApiProperty({ description: '开始日期' })
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  endDate: string;

  @ApiProperty({ description: '总用户数' })
  totalUsers: number;

  @ApiProperty({ description: '新增用户数' })
  newUsers: number;

  @ApiProperty({ description: '活跃用户数' })
  activeUsers: number;

  @ApiProperty({ description: '新增用户趋势', type: [TrendDataPointDto] })
  newUsersTrend: TrendDataPointDto[];

  @ApiProperty({ description: '活跃用户趋势', type: [TrendDataPointDto] })
  activeUsersTrend: TrendDataPointDto[];

  @ApiProperty({ description: '用户价值排名', type: [UserValueRankDto] })
  userValueRanking: UserValueRankDto[];

  @ApiProperty({ description: '分组统计', type: [GroupStatsDto] })
  groupStats: GroupStatsDto[];
}

/**
 * 月度对比 DTO
 */
export class MonthlyCompareDto {
  @ApiProperty({ description: '月份' })
  month: string;

  @ApiProperty({ description: '入金' })
  deposit: number;

  @ApiProperty({ description: '出金' })
  withdraw: number;

  @ApiProperty({ description: '手续费' })
  commission: number;

  @ApiProperty({ description: '净入金' })
  netDeposit: number;
}

/**
 * 财务报表 DTO
 */
export class FinanceReportDto {
  @ApiProperty({ description: '报表周期' })
  period: string;

  @ApiProperty({ description: '开始日期' })
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  endDate: string;

  @ApiProperty({ description: '总入金' })
  totalDeposit: number;

  @ApiProperty({ description: '总出金' })
  totalWithdraw: number;

  @ApiProperty({ description: '净入金' })
  netDeposit: number;

  @ApiProperty({ description: '总手续费' })
  totalCommission: number;

  @ApiProperty({ description: '总库存费' })
  totalSwap: number;

  @ApiProperty({ description: '入金趋势', type: [TrendDataPointDto] })
  depositTrend: TrendDataPointDto[];

  @ApiProperty({ description: '出金趋势', type: [TrendDataPointDto] })
  withdrawTrend: TrendDataPointDto[];

  @ApiProperty({ description: '手续费趋势', type: [TrendDataPointDto] })
  commissionTrend: TrendDataPointDto[];

  @ApiProperty({ description: '月度对比', type: [MonthlyCompareDto] })
  monthlyComparison: MonthlyCompareDto[];
}
