import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
  InvoiceQueryDto,
  InvoiceResponseDto,
  InvoiceStatsDto,
} from './dto/invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: '创建发票' })
  @ApiResponse({ status: 201, description: '发票已创建', type: InvoiceResponseDto })
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '获取发票列表' })
  @ApiResponse({ status: 200, description: '发票列表' })
  findAll(@Query() query: InvoiceQueryDto) {
    return this.invoicesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取发票统计' })
  @ApiResponse({ status: 200, description: '发票统计', type: InvoiceStatsDto })
  getStats() {
    return this.invoicesService.getStats();
  }

  @Post('check-overdue')
  @ApiOperation({ summary: '检查并更新逾期发票' })
  @ApiResponse({ status: 200, description: '更新的逾期发票数量' })
  async checkOverdue() {
    const count = await this.invoicesService.checkOverdueInvoices();
    return { updatedCount: count };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取发票详情' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: '发票详情', type: InvoiceResponseDto })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get('number/:invoiceNo')
  @ApiOperation({ summary: '按发票号查找' })
  @ApiParam({ name: 'invoiceNo', description: 'Invoice Number' })
  @ApiResponse({ status: 200, description: '发票详情', type: InvoiceResponseDto })
  findByNumber(@Param('invoiceNo') invoiceNo: string) {
    return this.invoicesService.findByInvoiceNo(invoiceNo);
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: '获取租户的所有发票' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '发票列表', type: [InvoiceResponseDto] })
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.invoicesService.findByTenant(tenantId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新发票状态' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: '发票已更新', type: InvoiceResponseDto })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.invoicesService.updateStatus(id, dto);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: '标记发票为已支付' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: '发票已标记为已支付', type: InvoiceResponseDto })
  markAsPaid(@Param('id') id: string) {
    return this.invoicesService.markAsPaid(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消发票' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: '发票已取消', type: InvoiceResponseDto })
  cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.invoicesService.cancel(id, body.reason);
  }
}
