import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CurrentUser, JwtPayload } from '../auth';
import {
  PositionListQueryDto,
  PositionListResponseDto,
  PositionStatsDto,
  SymbolPositionStatsDto,
} from './dto';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiOperation({ summary: '获取持仓列表' })
  @ApiResponse({
    status: 200,
    description: '持仓列表',
    type: PositionListResponseDto,
  })
  async getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: PositionListQueryDto,
  ): Promise<PositionListResponseDto> {
    return this.positionsService.getList(user.instanceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取持仓统计' })
  @ApiResponse({
    status: 200,
    description: '持仓统计',
    type: PositionStatsDto,
  })
  async getStats(@CurrentUser() user: JwtPayload): Promise<PositionStatsDto> {
    return this.positionsService.getStats(user.instanceId);
  }

  @Get('stats/by-symbol')
  @ApiOperation({ summary: '按品种统计持仓' })
  @ApiResponse({
    status: 200,
    description: '按品种统计',
    type: [SymbolPositionStatsDto],
  })
  async getStatsBySymbol(
    @CurrentUser() user: JwtPayload,
  ): Promise<SymbolPositionStatsDto[]> {
    return this.positionsService.getStatsBySymbol(user.instanceId);
  }
}
