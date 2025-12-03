import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { CurrentUser, JwtPayload } from '../auth';
import {
  QuoteQueryDto,
  QuoteDto,
  SymbolInfoDto,
  FavoriteSymbolDto,
  BatchFavoriteSymbolDto,
  FavoriteListResponseDto,
} from './dto';

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @ApiOperation({ summary: '获取报价列表' })
  @ApiResponse({
    status: 200,
    description: '报价列表',
    type: [QuoteDto],
  })
  async getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: QuoteQueryDto,
  ): Promise<QuoteDto[]> {
    return this.quotesService.getList(user.instanceId, query);
  }

  @Get('symbols')
  @ApiOperation({ summary: '获取所有品种列表' })
  @ApiResponse({
    status: 200,
    description: '品种列表',
    type: [SymbolInfoDto],
  })
  async getSymbols(@CurrentUser() user: JwtPayload): Promise<SymbolInfoDto[]> {
    return this.quotesService.getSymbols(user.instanceId);
  }

  @Get('favorites')
  @ApiOperation({ summary: '获取自选列表' })
  @ApiResponse({
    status: 200,
    description: '自选列表',
    type: FavoriteListResponseDto,
  })
  async getFavorites(
    @CurrentUser() user: JwtPayload,
  ): Promise<FavoriteListResponseDto> {
    return this.quotesService.getFavorites(user.instanceId, user.sub);
  }

  @Post('favorites')
  @ApiOperation({ summary: '添加自选品种' })
  @ApiResponse({
    status: 201,
    description: '添加成功',
  })
  async addFavorite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FavoriteSymbolDto,
  ): Promise<{ success: boolean }> {
    await this.quotesService.addFavorite(user.sub, dto.symbol);
    return { success: true };
  }

  @Post('favorites/batch')
  @ApiOperation({ summary: '批量添加自选品种' })
  @ApiResponse({
    status: 201,
    description: '添加成功',
  })
  async addFavorites(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BatchFavoriteSymbolDto,
  ): Promise<{ success: boolean }> {
    await this.quotesService.addFavorites(user.sub, dto.symbols);
    return { success: true };
  }

  @Post('favorites/remove')
  @ApiOperation({ summary: '移除自选品种' })
  @ApiResponse({
    status: 200,
    description: '移除成功',
  })
  async removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FavoriteSymbolDto,
  ): Promise<{ success: boolean }> {
    await this.quotesService.removeFavorite(user.sub, dto.symbol);
    return { success: true };
  }

  @Get(':symbol')
  @ApiOperation({ summary: '获取单个品种报价' })
  @ApiParam({ name: 'symbol', description: '品种名称' })
  @ApiResponse({
    status: 200,
    description: '报价信息',
    type: QuoteDto,
  })
  async getQuote(
    @CurrentUser() user: JwtPayload,
    @Param('symbol') symbol: string,
  ): Promise<QuoteDto> {
    return this.quotesService.getQuote(user.instanceId, symbol);
  }

  @Get(':symbol/info')
  @ApiOperation({ summary: '获取品种详细信息' })
  @ApiParam({ name: 'symbol', description: '品种名称' })
  @ApiResponse({
    status: 200,
    description: '品种信息',
    type: SymbolInfoDto,
  })
  async getSymbolInfo(
    @CurrentUser() user: JwtPayload,
    @Param('symbol') symbol: string,
  ): Promise<SymbolInfoDto> {
    return this.quotesService.getSymbolInfo(user.instanceId, symbol);
  }
}
