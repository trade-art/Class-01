import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Res,
  ParseIntPipe,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { HistoryService } from './history.service';
import {
  HistoryQueryDto,
  HistoryOrderDto,
  HistoryListResponseDto,
  HistoryStatsDto,
  ExportHistoryDto,
} from './dto';

@ApiTags('历史交易')
@ApiBearerAuth()
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取历史订单列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取历史订单列表',
    type: HistoryListResponseDto,
  })
  async getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryListResponseDto> {
    return this.historyService.getList(user.instanceId, query);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取交易统计' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取交易统计',
    type: HistoryStatsDto,
  })
  async getStats(
    @CurrentUser() user: JwtPayload,
    @Query('login') login?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<HistoryStatsDto> {
    return this.historyService.getStats(user.instanceId, login, from, to);
  }

  @Get('export')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '导出历史数据' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功导出历史数据',
  })
  async exportHistory(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportHistoryDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.historyService.exportHistory(
      user.instanceId,
      query,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.data);
  }

  @Get('user/:login')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取用户历史订单' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取用户历史订单',
    type: HistoryListResponseDto,
  })
  async getUserHistory(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryListResponseDto> {
    return this.historyService.getList(user.instanceId, {
      ...query,
      login,
    });
  }

  @Get('user/:login/stats')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取用户交易统计' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取用户交易统计',
    type: HistoryStatsDto,
  })
  async getUserStats(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<HistoryStatsDto> {
    return this.historyService.getUserStats(user.instanceId, login, from, to);
  }

  @Get(':ticket')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取历史订单详情' })
  @ApiParam({ name: 'ticket', description: '订单号' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取历史订单详情',
    type: HistoryOrderDto,
  })
  async getOrderDetail(
    @CurrentUser() user: JwtPayload,
    @Param('ticket', ParseIntPipe) ticket: number,
  ): Promise<HistoryOrderDto> {
    return this.historyService.getOrderDetail(user.instanceId, ticket);
  }
}
