/**
 * 外部交易 API 控制器
 *
 * 为第三方应用提供交易数据查询接口
 * 使用 API Key Token 认证 (通过 ApiKeyAuthGuard)
 *
 * 端点前缀: /tenant/external/trading
 *
 * 认证方式:
 * 1. 先通过 /tenant/external/auth 获取 Access Token
 * 2. 使用 Bearer Token 调用此控制器的接口
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
// 使用完整版 ApiKeyAuthGuard，从数据库获取完整上下文信息
import { ApiKeyAuthGuard, ScopesGuard } from '../auth/guards';
import { RequireScopes, ApiKeyScope } from '../auth/decorators';
import { TradingService, TenantContext } from '../middleware-proxy/services/trading.service';
import { ApiKeyFullContext } from '../auth/interfaces/request-context.interface';
import {
  OrderState,
  OrderType,
  BalanceOperationType,
  Timeframe,
} from '../middleware-proxy/adapters/types';

/**
 * 从 API Key 上下文构建租户上下文
 */
function buildTenantContext(apiKeyContext: ApiKeyFullContext): TenantContext {
  return {
    tenantId: apiKeyContext.tenantId,
    serverId: apiKeyContext.serverId,
  };
}

@ApiTags('External Trading API')
@ApiBearerAuth()
@Controller('external/trading')
@UseGuards(ApiKeyAuthGuard, ScopesGuard)
export class ExternalTradingController {
  constructor(private readonly tradingService: TradingService) {}

  // ============================================================
  // 用户查询 API
  // ============================================================

  @Get('users')
  @RequireScopes(ApiKeyScope.USERS_READ)
  @ApiOperation({
    summary: '获取用户列表',
    description: '获取 MT 服务器上的用户列表，支持分页和搜索',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码 (默认: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量 (默认: 20)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词' })
  @ApiQuery({ name: 'group', required: false, type: String, description: '用户组筛选' })
  @ApiResponse({ status: 200, description: '用户列表' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getUsers(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
    @Query('group') group?: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getUsers(ctx, {
      page: page || 1,
      pageSize: pageSize || 20,
      search,
      group,
    });
  }

  @Get('users/:login')
  @RequireScopes(ApiKeyScope.USERS_READ)
  @ApiOperation({
    summary: '获取用户详情',
    description: '根据登录号获取用户详细信息',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({ status: 200, description: '用户详情' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async getUser(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getUser(ctx, login);
  }

  @Get('users/:login/summary')
  @RequireScopes(ApiKeyScope.USERS_READ)
  @ApiOperation({
    summary: '获取用户账户摘要',
    description: '获取用户的账户汇总信息，包括余额、持仓等',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({ status: 200, description: '账户摘要' })
  async getUserSummary(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getAccountSummary(ctx, login);
  }

  // ============================================================
  // 持仓查询 API
  // ============================================================

  @Get('positions')
  @RequireScopes(ApiKeyScope.POSITIONS_READ)
  @ApiOperation({
    summary: '获取持仓列表',
    description: '获取所有持仓或按条件筛选',
  })
  @ApiQuery({ name: 'login', required: false, type: Number, description: '用户登录号' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: '品种代码' })
  @ApiResponse({ status: 200, description: '持仓列表' })
  async getPositions(
    @Req() req: Request,
    @Query('login') login?: number,
    @Query('symbol') symbol?: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getPositions(ctx, { login, symbol });
  }

  @Get('positions/summary')
  @RequireScopes(ApiKeyScope.POSITIONS_READ)
  @ApiOperation({
    summary: '获取持仓汇总',
    description: '获取持仓汇总统计信息',
  })
  @ApiQuery({ name: 'login', required: false, type: Number, description: '用户登录号 (可选)' })
  @ApiResponse({ status: 200, description: '持仓汇总' })
  async getPositionsSummary(
    @Req() req: Request,
    @Query('login') login?: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getPositionsSummary(ctx, login);
  }

  @Get('users/:login/positions')
  @RequireScopes(ApiKeyScope.POSITIONS_READ)
  @ApiOperation({
    summary: '获取用户持仓',
    description: '获取指定用户的所有持仓',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({ status: 200, description: '用户持仓列表' })
  async getUserPositions(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getUserPositions(ctx, login);
  }

  // ============================================================
  // 订单查询 API
  // ============================================================

  @Get('orders')
  @RequireScopes(ApiKeyScope.POSITIONS_READ)
  @ApiOperation({
    summary: '获取订单列表',
    description: '获取挂单或按条件筛选',
  })
  @ApiQuery({ name: 'login', required: false, type: Number, description: '用户登录号' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: '品种代码' })
  @ApiQuery({ name: 'state', required: false, type: String, description: '订单状态' })
  @ApiResponse({ status: 200, description: '订单列表' })
  async getOrders(
    @Req() req: Request,
    @Query('login') login?: number,
    @Query('symbol') symbol?: string,
    @Query('state') state?: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getOrders(ctx, {
      login,
      symbol,
      state: state as OrderState | undefined,
    });
  }

  @Get('users/:login/orders')
  @RequireScopes(ApiKeyScope.POSITIONS_READ)
  @ApiOperation({
    summary: '获取用户订单',
    description: '获取指定用户的所有挂单',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({ status: 200, description: '用户订单列表' })
  async getUserOrders(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getUserOrders(ctx, login);
  }

  // ============================================================
  // 成交记录 API
  // ============================================================

  @Get('deals')
  @RequireScopes(ApiKeyScope.HISTORY_READ)
  @ApiOperation({
    summary: '获取成交列表',
    description: '获取成交记录，支持时间范围筛选',
  })
  @ApiQuery({ name: 'login', required: false, type: Number, description: '用户登录号' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: '品种代码' })
  @ApiQuery({ name: 'from', required: false, type: String, description: '开始时间 (ISO 格式)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: '结束时间 (ISO 格式)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量' })
  @ApiResponse({ status: 200, description: '成交列表' })
  async getDeals(
    @Req() req: Request,
    @Query('login') login?: number,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getDeals(ctx, {
      login,
      symbol,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page,
      pageSize,
    });
  }

  @Get('users/:login/deals')
  @RequireScopes(ApiKeyScope.HISTORY_READ)
  @ApiOperation({
    summary: '获取用户成交记录',
    description: '获取指定用户的成交记录',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiQuery({ name: 'from', required: false, type: String, description: '开始时间 (ISO 格式)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: '结束时间 (ISO 格式)' })
  @ApiResponse({ status: 200, description: '用户成交列表' })
  async getUserDeals(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getUserDeals(
      ctx,
      login,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  // ============================================================
  // 品种和报价 API
  // ============================================================

  @Get('symbols')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '获取品种列表',
    description: '获取可交易品种列表',
  })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词' })
  @ApiQuery({ name: 'group', required: false, type: String, description: '品种组' })
  @ApiResponse({ status: 200, description: '品种列表' })
  async getSymbols(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('group') group?: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getSymbols(ctx, { search, group });
  }

  @Get('symbols/:symbol')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '获取品种详情',
    description: '获取指定品种的详细信息',
  })
  @ApiParam({ name: 'symbol', description: '品种代码' })
  @ApiResponse({ status: 200, description: '品种详情' })
  @ApiResponse({ status: 404, description: '品种不存在' })
  async getSymbol(
    @Req() req: Request,
    @Param('symbol') symbol: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getSymbol(ctx, symbol);
  }

  @Get('quotes/:symbol')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '获取品种报价',
    description: '获取指定品种的实时报价',
  })
  @ApiParam({ name: 'symbol', description: '品种代码' })
  @ApiResponse({ status: 200, description: '品种报价' })
  async getQuote(
    @Req() req: Request,
    @Param('symbol') symbol: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getQuote(ctx, symbol);
  }

  @Get('quotes')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '批量获取报价',
    description: '批量获取多个品种的实时报价',
  })
  @ApiQuery({ name: 'symbols', required: true, type: String, description: '品种列表 (逗号分隔)' })
  @ApiResponse({ status: 200, description: '报价列表' })
  async getQuotes(
    @Req() req: Request,
    @Query('symbols') symbolsStr: string,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    const symbols = symbolsStr.split(',').map((s) => s.trim());
    return this.tradingService.getQuotes(ctx, symbols);
  }

  // ============================================================
  // 服务器状态 API
  // ============================================================

  @Get('server/status')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '获取服务器状态',
    description: '获取 MT 服务器连接状态',
  })
  @ApiResponse({ status: 200, description: '服务器状态' })
  async getServerStatus(@Req() req: Request) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getServerStatus(ctx);
  }

  @Get('server/test')
  @RequireScopes(ApiKeyScope.MARKET_READ)
  @ApiOperation({
    summary: '测试服务器连接',
    description: '测试与 MT 服务器的连接',
  })
  @ApiResponse({ status: 200, description: '连接测试结果' })
  async testConnection(@Req() req: Request) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    const connected = await this.tradingService.testConnection(ctx);
    return { connected };
  }

  // ============================================================
  // 交易操作 API
  // ============================================================

  @Post('orders/open')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '开仓',
    description: '执行市价单开仓操作',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login', 'symbol', 'type', 'volume'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        symbol: { type: 'string', description: '品种代码' },
        type: { type: 'number', enum: [0, 1], description: '订单类型 (0=买入, 1=卖出)' },
        volume: { type: 'number', description: '交易手数' },
        price: { type: 'number', description: '价格 (市价单可不传)' },
        sl: { type: 'number', description: '止损价' },
        tp: { type: 'number', description: '止盈价' },
        deviation: { type: 'number', description: '滑点容忍度' },
        comment: { type: 'string', description: '订单备注' },
        magic: { type: 'number', description: 'Magic Number' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '开仓结果' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async openOrder(
    @Req() req: Request,
    @Body() body: {
      login: number;
      symbol: string;
      type: OrderType;
      volume: number;
      price?: number;
      sl?: number;
      tp?: number;
      deviation?: number;
      comment?: string;
      magic?: number;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.openOrder(ctx, body);
  }

  @Post('positions/:ticket/close')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '平仓',
    description: '关闭指定持仓',
  })
  @ApiParam({ name: 'ticket', description: '持仓票号' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        volume: { type: 'number', description: '平仓手数 (部分平仓)' },
        price: { type: 'number', description: '价格' },
        deviation: { type: 'number', description: '滑点容忍度' },
        comment: { type: 'string', description: '平仓备注' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '平仓结果' })
  async closePosition(
    @Req() req: Request,
    @Param('ticket', ParseIntPipe) ticket: number,
    @Body() body: {
      login: number;
      volume?: number;
      price?: number;
      deviation?: number;
      comment?: string;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.closePosition(ctx, { ticket, ...body });
  }

  @Put('positions/:ticket')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '修改持仓',
    description: '修改持仓的止损止盈',
  })
  @ApiParam({ name: 'ticket', description: '持仓票号' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        sl: { type: 'number', description: '止损价' },
        tp: { type: 'number', description: '止盈价' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '修改结果' })
  async modifyPosition(
    @Req() req: Request,
    @Param('ticket', ParseIntPipe) ticket: number,
    @Body() body: {
      login: number;
      sl?: number;
      tp?: number;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.modifyPosition(ctx, { ticket, ...body });
  }

  @Post('orders/pending')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '挂单',
    description: '创建限价单或止损单',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login', 'symbol', 'type', 'volume', 'price'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        symbol: { type: 'string', description: '品种代码' },
        type: { type: 'number', enum: [2, 3, 4, 5, 6, 7], description: '订单类型' },
        volume: { type: 'number', description: '交易手数' },
        price: { type: 'number', description: '挂单价格' },
        sl: { type: 'number', description: '止损价' },
        tp: { type: 'number', description: '止盈价' },
        expiration: { type: 'string', description: '过期时间 (ISO 格式)' },
        comment: { type: 'string', description: '订单备注' },
        magic: { type: 'number', description: 'Magic Number' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '挂单结果' })
  async placePendingOrder(
    @Req() req: Request,
    @Body() body: {
      login: number;
      symbol: string;
      type: OrderType;
      volume: number;
      price: number;
      sl?: number;
      tp?: number;
      expiration?: string;
      comment?: string;
      magic?: number;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.placePendingOrder(ctx, {
      ...body,
      expiration: body.expiration ? new Date(body.expiration) : undefined,
    });
  }

  @Put('orders/:ticket')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '修改挂单',
    description: '修改挂单的价格和止损止盈',
  })
  @ApiParam({ name: 'ticket', description: '订单票号' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        price: { type: 'number', description: '挂单价格' },
        sl: { type: 'number', description: '止损价' },
        tp: { type: 'number', description: '止盈价' },
        expiration: { type: 'string', description: '过期时间 (ISO 格式)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '修改结果' })
  async modifyOrder(
    @Req() req: Request,
    @Param('ticket', ParseIntPipe) ticket: number,
    @Body() body: {
      login: number;
      price?: number;
      sl?: number;
      tp?: number;
      expiration?: string;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.modifyOrder(ctx, {
      ticket,
      ...body,
      expiration: body.expiration ? new Date(body.expiration) : undefined,
    });
  }

  @Delete('orders/:ticket')
  @RequireScopes(ApiKeyScope.TRADING_EXECUTE)
  @ApiOperation({
    summary: '取消挂单',
    description: '取消指定的挂单',
  })
  @ApiParam({ name: 'ticket', description: '订单票号' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '取消结果' })
  async cancelOrder(
    @Req() req: Request,
    @Param('ticket', ParseIntPipe) ticket: number,
    @Body() body: { login: number },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.cancelOrder(ctx, { ticket, login: body.login });
  }

  @Post('balance')
  @RequireScopes(ApiKeyScope.BALANCE_WRITE)
  @ApiOperation({
    summary: '余额操作',
    description: '执行入金、出金、信用等余额操作',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['login', 'type', 'amount'],
      properties: {
        login: { type: 'number', description: '用户登录号' },
        type: { type: 'string', enum: ['deposit', 'withdrawal', 'credit', 'correction'], description: '操作类型' },
        amount: { type: 'number', description: '金额' },
        comment: { type: 'string', description: '备注' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '操作结果' })
  async balanceOperation(
    @Req() req: Request,
    @Body() body: {
      login: number;
      type: BalanceOperationType;
      amount: number;
      comment?: string;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.balanceOperation(ctx, body);
  }

  // ============================================================
  // 用户管理 API
  // ============================================================

  @Post('users')
  @RequireScopes(ApiKeyScope.USERS_WRITE)
  @ApiOperation({
    summary: '创建用户',
    description: '在 MT 服务器上创建新用户',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'group', 'password'],
      properties: {
        name: { type: 'string', description: '用户姓名' },
        group: { type: 'string', description: '用户组' },
        password: { type: 'string', description: '主密码' },
        investorPassword: { type: 'string', description: '投资者密码' },
        email: { type: 'string', description: '邮箱' },
        phone: { type: 'string', description: '电话' },
        leverage: { type: 'number', description: '杠杆' },
        comment: { type: 'string', description: '备注' },
        agent: { type: 'number', description: '代理' },
        balance: { type: 'number', description: '初始余额' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '用户创建成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async createUser(
    @Req() req: Request,
    @Body() body: {
      name: string;
      group: string;
      password: string;
      investorPassword?: string;
      email?: string;
      phone?: string;
      leverage?: number;
      comment?: string;
      agent?: number;
      balance?: number;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.createUser(ctx, body);
  }

  @Put('users/:login')
  @RequireScopes(ApiKeyScope.USERS_WRITE)
  @ApiOperation({
    summary: '更新用户',
    description: '更新用户信息',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '用户姓名' },
        group: { type: 'string', description: '用户组' },
        email: { type: 'string', description: '邮箱' },
        phone: { type: 'string', description: '电话' },
        leverage: { type: 'number', description: '杠杆' },
        comment: { type: 'string', description: '备注' },
        agent: { type: 'number', description: '代理' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateUser(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
    @Body() body: {
      name?: string;
      group?: string;
      email?: string;
      phone?: string;
      leverage?: number;
      comment?: string;
      agent?: number;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.updateUser(ctx, { login, ...body });
  }

  @Put('users/:login/password')
  @RequireScopes(ApiKeyScope.USERS_WRITE)
  @ApiOperation({
    summary: '修改密码',
    description: '修改用户密码',
  })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['password', 'type'],
      properties: {
        password: { type: 'string', description: '新密码' },
        type: { type: 'string', enum: ['main', 'investor'], description: '密码类型' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '修改成功' })
  async changePassword(
    @Req() req: Request,
    @Param('login', ParseIntPipe) login: number,
    @Body() body: {
      password: string;
      type: 'main' | 'investor';
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.changePassword(ctx, { login, ...body });
  }

  // ============================================================
  // 市场数据 API
  // ============================================================

  @Get('market/candles')
  @RequireScopes(ApiKeyScope.MARKET_HISTORY)
  @ApiOperation({
    summary: '获取 K 线数据',
    description: '获取指定品种的 K 线历史数据',
  })
  @ApiQuery({ name: 'symbol', required: true, type: String, description: '品种代码' })
  @ApiQuery({ name: 'timeframe', required: true, type: String, description: '时间周期 (M1, M5, M15, M30, H1, H4, D1, W1, MN1)' })
  @ApiQuery({ name: 'from', required: false, type: String, description: '开始时间 (ISO 格式)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: '结束时间 (ISO 格式)' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: '获取数量' })
  @ApiResponse({ status: 200, description: 'K 线数据' })
  async getCandles(
    @Req() req: Request,
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: Timeframe,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('count') count?: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getCandles(ctx, {
      symbol,
      timeframe,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      count,
    });
  }

  @Get('market/ticks')
  @RequireScopes(ApiKeyScope.MARKET_HISTORY)
  @ApiOperation({
    summary: '获取 Tick 数据',
    description: '获取指定品种的 Tick 历史数据',
  })
  @ApiQuery({ name: 'symbol', required: true, type: String, description: '品种代码' })
  @ApiQuery({ name: 'from', required: false, type: String, description: '开始时间 (ISO 格式)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: '结束时间 (ISO 格式)' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: '获取数量' })
  @ApiResponse({ status: 200, description: 'Tick 数据' })
  async getTicks(
    @Req() req: Request,
    @Query('symbol') symbol: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('count') count?: number,
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.getTicks(ctx, {
      symbol,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      count,
    });
  }

  // ============================================================
  // 批量操作 API
  // ============================================================

  @Post('batch/open')
  @RequireScopes(ApiKeyScope.BATCH_EXECUTE)
  @ApiOperation({
    summary: '批量开仓',
    description: '批量执行多个开仓操作',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orders'],
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            required: ['login', 'symbol', 'type', 'volume'],
            properties: {
              login: { type: 'number' },
              symbol: { type: 'string' },
              type: { type: 'number' },
              volume: { type: 'number' },
              price: { type: 'number' },
              sl: { type: 'number' },
              tp: { type: 'number' },
              comment: { type: 'string' },
              magic: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '批量开仓结果' })
  async batchOpenOrders(
    @Req() req: Request,
    @Body() body: {
      orders: Array<{
        login: number;
        symbol: string;
        type: OrderType;
        volume: number;
        price?: number;
        sl?: number;
        tp?: number;
        deviation?: number;
        comment?: string;
        magic?: number;
      }>;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.batchOpenOrders(ctx, body);
  }

  @Post('batch/close')
  @RequireScopes(ApiKeyScope.BATCH_EXECUTE)
  @ApiOperation({
    summary: '批量平仓',
    description: '批量关闭多个持仓',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['positions'],
      properties: {
        positions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['login', 'ticket'],
            properties: {
              login: { type: 'number' },
              ticket: { type: 'number' },
              volume: { type: 'number' },
              price: { type: 'number' },
              deviation: { type: 'number' },
              comment: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '批量平仓结果' })
  async batchClosePositions(
    @Req() req: Request,
    @Body() body: {
      positions: Array<{
        login: number;
        ticket: number;
        volume?: number;
        price?: number;
        deviation?: number;
        comment?: string;
      }>;
    },
  ) {
    const ctx = buildTenantContext(req.user as ApiKeyFullContext);
    return this.tradingService.batchClosePositions(ctx, body);
  }
}
