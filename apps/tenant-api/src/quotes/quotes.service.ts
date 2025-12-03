import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService, QuoteDto as MiddlewareQuoteDto } from '../middleware-proxy';
import { PrismaService } from '../prisma/prisma.service';
import {
  QuoteQueryDto,
  QuoteDto,
  SymbolInfoDto,
  FavoriteQuoteDto,
  FavoriteListResponseDto,
} from './dto';

/**
 * 报价服务
 * 提供行情数据和自选品种管理
 */
@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly middlewareProxy: MiddlewareProxyService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取报价列表
   */
  async getList(instanceId: string, query: QuoteQueryDto): Promise<QuoteDto[]> {
    const quotes = await this.middlewareProxy.getQuotes(instanceId);

    let filtered = quotes.map((q) => this.mapToQuoteDto(q));

    // 按搜索关键词过滤
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filtered = filtered.filter((q) =>
        q.symbol.toLowerCase().includes(searchLower),
      );
    }

    // 按类型过滤 (需要根据实际品种命名规则实现)
    if (query.type) {
      filtered = this.filterByType(filtered, query.type);
    }

    return filtered;
  }

  /**
   * 获取单个品种报价
   */
  async getQuote(instanceId: string, symbol: string): Promise<QuoteDto> {
    const quote = await this.middlewareProxy.getQuoteBySymbol(instanceId, symbol);
    return this.mapToQuoteDto(quote);
  }

  /**
   * 获取品种信息
   */
  async getSymbolInfo(instanceId: string, symbol: string): Promise<SymbolInfoDto> {
    const info = await this.middlewareProxy.getSymbolInfo(instanceId, symbol);

    return {
      symbol: info.symbol,
      description: info.description,
      digits: info.digits,
      point: info.point,
      contractSize: info.contractSize,
      volumeMin: info.minVolume,
      volumeMax: info.maxVolume,
      volumeStep: info.volumeStep,
      tradingHours: info.tradingHours,
    };
  }

  /**
   * 获取所有品种列表
   */
  async getSymbols(instanceId: string): Promise<SymbolInfoDto[]> {
    const symbols = await this.middlewareProxy.getSymbols(instanceId);

    return symbols.map((s) => ({
      symbol: s.symbol,
      description: s.description,
      digits: s.digits,
      point: s.point,
      contractSize: s.contractSize,
      volumeMin: s.minVolume,
      volumeMax: s.maxVolume,
      volumeStep: s.volumeStep,
      tradingHours: s.tradingHours,
    }));
  }

  /**
   * 获取自选列表
   */
  async getFavorites(
    instanceId: string,
    adminId: string,
  ): Promise<FavoriteListResponseDto> {
    // 从数据库获取自选品种
    const favorites = await this.prisma.adminFavoriteSymbol.findMany({
      where: { adminId },
      orderBy: { sortOrder: 'asc' },
    });

    if (favorites.length === 0) {
      return { favorites: [], total: 0 };
    }

    // 获取这些品种的实时报价
    const symbols = favorites.map((f) => f.symbol);
    const quotes = await this.middlewareProxy.getQuotesBySymbols(instanceId, symbols);

    // 合并报价数据和排序
    const quotesMap = new Map(quotes.map((q) => [q.symbol, q]));

    const favoriteQuotes: FavoriteQuoteDto[] = favorites
      .map((f) => {
        const quote = quotesMap.get(f.symbol);
        if (!quote) {
          return null;
        }
        return {
          ...this.mapToQuoteDto(quote),
          sortOrder: f.sortOrder,
        };
      })
      .filter((q): q is FavoriteQuoteDto => q !== null);

    return {
      favorites: favoriteQuotes,
      total: favoriteQuotes.length,
    };
  }

  /**
   * 添加自选品种
   */
  async addFavorite(adminId: string, symbol: string): Promise<void> {
    // 检查是否已存在
    const existing = await this.prisma.adminFavoriteSymbol.findFirst({
      where: { adminId, symbol },
    });

    if (existing) {
      this.logger.debug(`品种 ${symbol} 已在自选中`);
      return;
    }

    // 获取当前最大排序号
    const maxOrder = await this.prisma.adminFavoriteSymbol.findFirst({
      where: { adminId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const newOrder = (maxOrder?.sortOrder ?? 0) + 1;

    await this.prisma.adminFavoriteSymbol.create({
      data: {
        adminId,
        symbol,
        sortOrder: newOrder,
      },
    });

    this.logger.log(`管理员 ${adminId} 添加自选品种 ${symbol}`);
  }

  /**
   * 移除自选品种
   */
  async removeFavorite(adminId: string, symbol: string): Promise<void> {
    await this.prisma.adminFavoriteSymbol.deleteMany({
      where: { adminId, symbol },
    });

    this.logger.log(`管理员 ${adminId} 移除自选品种 ${symbol}`);
  }

  /**
   * 批量添加自选品种
   */
  async addFavorites(adminId: string, symbols: string[]): Promise<void> {
    // 获取已存在的自选
    const existing = await this.prisma.adminFavoriteSymbol.findMany({
      where: { adminId, symbol: { in: symbols } },
      select: { symbol: true },
    });

    const existingSet = new Set(existing.map((e) => e.symbol));
    const newSymbols = symbols.filter((s) => !existingSet.has(s));

    if (newSymbols.length === 0) {
      return;
    }

    // 获取当前最大排序号
    const maxOrder = await this.prisma.adminFavoriteSymbol.findFirst({
      where: { adminId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    let nextOrder = (maxOrder?.sortOrder ?? 0) + 1;

    // 批量创建
    await this.prisma.adminFavoriteSymbol.createMany({
      data: newSymbols.map((symbol) => ({
        adminId,
        symbol,
        sortOrder: nextOrder++,
      })),
    });

    this.logger.log(`管理员 ${adminId} 批量添加自选品种: ${newSymbols.join(', ')}`);
  }

  /**
   * 更新自选排序
   */
  async updateFavoriteOrder(
    adminId: string,
    orders: { symbol: string; sortOrder: number }[],
  ): Promise<void> {
    // 使用事务批量更新
    await this.prisma.$transaction(
      orders.map((item) =>
        this.prisma.adminFavoriteSymbol.updateMany({
          where: { adminId, symbol: item.symbol },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    this.logger.log(`管理员 ${adminId} 更新自选排序`);
  }

  /**
   * 映射为 QuoteDto
   */
  private mapToQuoteDto(quote: MiddlewareQuoteDto): QuoteDto {
    return {
      symbol: quote.symbol,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.spread,
      high: quote.high,
      low: quote.low,
      volume: 0, // 中间件 QuoteDto 不包含 volume，需要从其他来源获取
      time: quote.time,
      changePercent: this.calculateChangePercent(quote),
    };
  }

  /**
   * 计算变动百分比
   */
  private calculateChangePercent(quote: MiddlewareQuoteDto): number {
    // 简单计算：(当前价 - 最低价) / 最低价 * 100
    // 实际应该使用开盘价
    if (quote.low > 0) {
      return Math.round(((quote.bid - quote.low) / quote.low) * 10000) / 100;
    }
    return 0;
  }

  /**
   * 按类型过滤品种
   */
  private filterByType(quotes: QuoteDto[], type: string): QuoteDto[] {
    // 根据品种命名规则判断类型
    // 这里使用简单的前缀/后缀匹配，实际可能需要更复杂的逻辑
    const typePatterns: Record<string, RegExp> = {
      forex: /^(EUR|USD|GBP|JPY|AUD|NZD|CHF|CAD)/i,
      indices: /(US30|US500|US100|UK100|GER40|JPN225)/i,
      commodities: /(GOLD|SILVER|OIL|BRENT|WTI|XAUUSD|XAGUSD)/i,
      stocks: /\.(NYSE|NASDAQ)/i,
    };

    const pattern = typePatterns[type.toLowerCase()];
    if (!pattern) {
      return quotes;
    }

    return quotes.filter((q) => pattern.test(q.symbol));
  }
}
