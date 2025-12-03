import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Res,
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
import { ReportsService } from './reports.service';
import {
  ReportQueryDto,
  ExportReportDto,
  TradingReportDto,
  UsersReportDto,
  FinanceReportDto,
} from './dto';

@ApiTags('报表')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('trading')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取交易报表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取交易报表',
    type: TradingReportDto,
  })
  async getTradingReport(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReportQueryDto,
  ): Promise<TradingReportDto> {
    return this.reportsService.getTradingReport(user.instanceId, query);
  }

  @Get('users')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取用户报表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取用户报表',
    type: UsersReportDto,
  })
  async getUsersReport(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReportQueryDto,
  ): Promise<UsersReportDto> {
    return this.reportsService.getUsersReport(user.instanceId, query);
  }

  @Get('finance')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取财务报表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取财务报表',
    type: FinanceReportDto,
  })
  async getFinanceReport(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReportQueryDto,
  ): Promise<FinanceReportDto> {
    return this.reportsService.getFinanceReport(user.instanceId, query);
  }

  @Post(':type/export')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '导出报表' })
  @ApiParam({
    name: 'type',
    description: '报表类型',
    enum: ['trading', 'users', 'finance'],
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功导出报表',
  })
  async exportReport(
    @CurrentUser() user: JwtPayload,
    @Param('type') type: string,
    @Query() query: ExportReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.reportsService.exportReport(
      user.instanceId,
      type,
      query,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.data);
  }
}
