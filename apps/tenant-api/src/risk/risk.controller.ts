import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Query,
  Body,
  Param,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RiskService } from './risk.service';
import {
  RiskAlertQueryDto,
  RiskAlertListResponseDto,
  RiskConfigDto,
  UpdateRiskConfigDto,
  MarkAlertReadDto,
  RiskStatsDto,
} from './dto';

@ApiTags('风控监控')
@ApiBearerAuth()
@Controller('risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('alerts')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取预警列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取预警列表',
    type: RiskAlertListResponseDto,
  })
  async getAlerts(
    @CurrentUser() user: JwtPayload,
    @Query() query: RiskAlertQueryDto,
  ): Promise<RiskAlertListResponseDto> {
    return this.riskService.getAlerts(user.tenantId, query);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取风控统计' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取风控统计',
    type: RiskStatsDto,
  })
  async getStats(@CurrentUser() user: JwtPayload): Promise<RiskStatsDto> {
    return this.riskService.getStats(user.tenantId);
  }

  @Post('alerts/mark-read')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '标记预警为已读' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功标记预警为已读',
  })
  async markAsRead(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkAlertReadDto,
  ): Promise<void> {
    return this.riskService.markAsRead(user.tenantId, dto.alertIds);
  }

  @Post('alerts/mark-all-read')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '标记所有预警为已读' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功标记所有预警为已读',
  })
  async markAllAsRead(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.riskService.markAllAsRead(user.tenantId);
  }

  @Delete('alerts/:id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '删除预警' })
  @ApiParam({ name: 'id', description: '预警 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除预警',
  })
  async deleteAlert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.riskService.deleteAlert(user.tenantId, id);
  }

  @Get('config')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取风控配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取风控配置',
    type: RiskConfigDto,
  })
  async getConfig(@CurrentUser() user: JwtPayload): Promise<RiskConfigDto> {
    return this.riskService.getConfig(user.tenantId);
  }

  @Put('config')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新风控配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新风控配置',
    type: RiskConfigDto,
  })
  async updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateRiskConfigDto,
  ): Promise<RiskConfigDto> {
    return this.riskService.updateConfig(user.tenantId, dto);
  }
}
