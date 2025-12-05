import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { CurrentUser, JwtPayload, Roles } from '../auth';
import { TradingService, TenantContext } from '../middleware-proxy/services/trading.service';
import {
  UsersQueryDto,
  PositionsQueryDto,
  OrdersQueryDto,
  DealsQueryDto,
  SymbolsQueryDto,
  QuotesQueryDto,
  UpdateUserGroupDto,
  TradingUserDto,
  TradingPositionDto,
  TradingOrderDto,
  TradingDealDto,
  TradingSymbolDto,
  TradingQuoteDto,
  ServerStatusDto,
  AccountSummaryDto,
  PositionsSummaryDto,
  PaginatedResponseDto,
} from './dto';

/**
 * 统一交易 API 控制器
 * 提供平台无关的交易接口
 * 支持 MT5/MT4 多平台路由
 */
@ApiTags('Trading')
@ApiBearerAuth()
@Controller('trading')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  /**
   * 从 JWT 和请求头构建租户上下文
   * 优先级：请求头 X-Server-Id > JWT 中的 serverId > 默认服务器
   */
  private buildTenantContext(user: JwtPayload, headerServerId?: string): TenantContext {
    return {
      tenantId: user.tenantId,
      serverId: headerServerId || user.serverId || undefined,
    };
  }

  // ============================================================
  // 用户管理 API
  // ============================================================

  @Get('users')
  @ApiOperation({ summary: '获取用户列表' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '用户列表',
  })
  async getUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: UsersQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<PaginatedResponseDto<TradingUserDto>> {
    const ctx = this.buildTenantContext(user, serverId);
    const result = await this.tradingService.getUsers(ctx, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      group: query.group,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items as TradingUserDto[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }

  @Get('users/:login')
  @ApiOperation({ summary: '获取用户详情' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '用户详情',
    type: TradingUserDto,
  })
  async getUser(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingUserDto | null> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getUser(ctx, login) as Promise<TradingUserDto | null>;
  }

  @Put('users/:login/group')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新用户组' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '更新结果',
  })
  async updateUserGroup(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Body() dto: UpdateUserGroupDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<{ success: boolean }> {
    const ctx = this.buildTenantContext(user, serverId);
    const result = await this.tradingService.updateUserGroup(ctx, login, dto.group);
    return { success: result };
  }

  @Get('users/:login/summary')
  @ApiOperation({ summary: '获取用户账户摘要' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '账户摘要',
    type: AccountSummaryDto,
  })
  async getUserSummary(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Headers('x-server-id') serverId?: string,
  ): Promise<AccountSummaryDto> {
    const ctx = this.buildTenantContext(user, serverId);
    const result = await this.tradingService.getAccountSummary(ctx, login);
    return {
      user: result.user as TradingUserDto | undefined,
      positionsCount: result.positionsCount,
      totalProfit: result.totalProfit,
      totalVolume: result.totalVolume,
    };
  }

  // ============================================================
  // 持仓 API
  // ============================================================

  @Get('positions')
  @ApiOperation({ summary: '获取持仓列表' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '持仓列表',
    type: [TradingPositionDto],
  })
  async getPositions(
    @CurrentUser() user: JwtPayload,
    @Query() query: PositionsQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingPositionDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getPositions(ctx, {
      login: query.login,
      symbol: query.symbol,
    }) as Promise<TradingPositionDto[]>;
  }

  @Get('positions/summary')
  @ApiOperation({ summary: '获取持仓汇总' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '持仓汇总',
    type: PositionsSummaryDto,
  })
  async getPositionsSummary(
    @CurrentUser() user: JwtPayload,
    @Query('login') login?: number,
    @Headers('x-server-id') serverId?: string,
  ): Promise<PositionsSummaryDto> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getPositionsSummary(ctx, login);
  }

  @Get('users/:login/positions')
  @ApiOperation({ summary: '获取用户持仓' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '用户持仓列表',
    type: [TradingPositionDto],
  })
  async getUserPositions(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingPositionDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getUserPositions(ctx, login) as Promise<TradingPositionDto[]>;
  }

  // ============================================================
  // 订单 API
  // ============================================================

  @Get('orders')
  @ApiOperation({ summary: '获取订单列表' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '订单列表',
    type: [TradingOrderDto],
  })
  async getOrders(
    @CurrentUser() user: JwtPayload,
    @Query() query: OrdersQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingOrderDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getOrders(ctx, {
      login: query.login,
      symbol: query.symbol,
      state: query.state,
    }) as Promise<TradingOrderDto[]>;
  }

  @Get('users/:login/orders')
  @ApiOperation({ summary: '获取用户订单' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '用户订单列表',
    type: [TradingOrderDto],
  })
  async getUserOrders(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingOrderDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getUserOrders(ctx, login) as Promise<TradingOrderDto[]>;
  }

  // ============================================================
  // 成交 API
  // ============================================================

  @Get('deals')
  @ApiOperation({ summary: '获取成交列表' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '成交列表',
  })
  async getDeals(
    @CurrentUser() user: JwtPayload,
    @Query() query: DealsQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<PaginatedResponseDto<TradingDealDto>> {
    const ctx = this.buildTenantContext(user, serverId);
    const result = await this.tradingService.getDeals(ctx, {
      login: query.login,
      symbol: query.symbol,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items as TradingDealDto[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }

  @Get('users/:login/deals')
  @ApiOperation({ summary: '获取用户成交记录' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '用户成交列表',
    type: [TradingDealDto],
  })
  async getUserDeals(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingDealDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getUserDeals(
      ctx,
      login,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    ) as Promise<TradingDealDto[]>;
  }

  // ============================================================
  // 品种和报价 API
  // ============================================================

  @Get('symbols')
  @ApiOperation({ summary: '获取品种列表' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '品种列表',
    type: [TradingSymbolDto],
  })
  async getSymbols(
    @CurrentUser() user: JwtPayload,
    @Query() query: SymbolsQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingSymbolDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getSymbols(ctx, {
      search: query.search,
      group: query.group,
    }) as Promise<TradingSymbolDto[]>;
  }

  @Get('symbols/:symbol')
  @ApiOperation({ summary: '获取品种详情' })
  @ApiParam({ name: 'symbol', description: '品种代码' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '品种详情',
    type: TradingSymbolDto,
  })
  async getSymbol(
    @CurrentUser() user: JwtPayload,
    @Param('symbol') symbol: string,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingSymbolDto | null> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getSymbol(ctx, symbol) as Promise<TradingSymbolDto | null>;
  }

  @Get('quotes/:symbol')
  @ApiOperation({ summary: '获取品种报价' })
  @ApiParam({ name: 'symbol', description: '品种代码' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '品种报价',
    type: TradingQuoteDto,
  })
  async getQuote(
    @CurrentUser() user: JwtPayload,
    @Param('symbol') symbol: string,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingQuoteDto | null> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getQuote(ctx, symbol) as Promise<TradingQuoteDto | null>;
  }

  @Get('quotes')
  @ApiOperation({ summary: '批量获取报价' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '报价列表',
    type: [TradingQuoteDto],
  })
  async getQuotes(
    @CurrentUser() user: JwtPayload,
    @Query() query: QuotesQueryDto,
    @Headers('x-server-id') serverId?: string,
  ): Promise<TradingQuoteDto[]> {
    const ctx = this.buildTenantContext(user, serverId);
    const symbols = query.symbols.split(',').map((s) => s.trim());
    return this.tradingService.getQuotes(ctx, symbols) as Promise<TradingQuoteDto[]>;
  }

  // ============================================================
  // 服务器状态 API
  // ============================================================

  @Get('server/status')
  @ApiOperation({ summary: '获取服务器状态' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '服务器状态',
    type: ServerStatusDto,
  })
  async getServerStatus(
    @CurrentUser() user: JwtPayload,
    @Headers('x-server-id') serverId?: string,
  ): Promise<ServerStatusDto> {
    const ctx = this.buildTenantContext(user, serverId);
    return this.tradingService.getServerStatus(ctx);
  }

  @Get('server/test')
  @ApiOperation({ summary: '测试服务器连接' })
  @ApiHeader({ name: 'X-Server-Id', required: false, description: '指定服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '连接测试结果',
  })
  async testConnection(
    @CurrentUser() user: JwtPayload,
    @Headers('x-server-id') serverId?: string,
  ): Promise<{ connected: boolean }> {
    const ctx = this.buildTenantContext(user, serverId);
    const connected = await this.tradingService.testConnection(ctx);
    return { connected };
  }
}
