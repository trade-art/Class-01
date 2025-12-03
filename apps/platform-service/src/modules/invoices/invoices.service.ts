import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
  InvoiceQueryDto,
  InvoiceResponseDto,
  InvoiceStatus,
  InvoiceStatsDto,
  InvoiceLineItemDto,
} from './dto/invoice.dto';
import { Prisma, Invoice } from '@prisma/client';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生成发票号
   */
  private generateInvoiceNo(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INV-${year}${month}-${random}`;
  }

  /**
   * 创建发票
   */
  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    // 验证租户存在
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${dto.tenantId}' not found`);
    }

    // 计算总金额
    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);

    return this.prisma.invoice.create({
      data: {
        tenantId: dto.tenantId,
        invoiceNo: this.generateInvoiceNo(),
        amount: totalAmount,
        currency: dto.currency || 'USD',
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        dueDate: dto.dueDate,
        items: dto.items as any,
        notes: dto.notes,
        status: 'PENDING',
      },
    });
  }

  /**
   * 获取发票列表
   */
  async findAll(query: InvoiceQueryDto): Promise<{
    data: InvoiceResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { tenantId, status, invoiceNo, fromDate, toDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (status) {
      where.status = status;
    }

    if (invoiceNo) {
      where.invoiceNo = { contains: invoiceNo, mode: 'insensitive' };
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (toDate) {
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              code: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((invoice) => this.mapToResponseDto(invoice)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取单个发票
   */
  async findOne(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID '${id}' not found`);
    }

    return this.mapToResponseDto(invoice);
  }

  /**
   * 按发票号查找
   */
  async findByInvoiceNo(invoiceNo: string): Promise<InvoiceResponseDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNo },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with number '${invoiceNo}' not found`);
    }

    return this.mapToResponseDto(invoice);
  }

  /**
   * 更新发票状态
   */
  async updateStatus(id: string, dto: UpdateInvoiceStatusDto): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID '${id}' not found`);
    }

    // 验证状态转换
    this.validateStatusTransition(invoice.status as InvoiceStatus, dto.status);

    const updateData: Prisma.InvoiceUpdateInput = {
      status: dto.status,
      notes: dto.notes ?? invoice.notes,
    };

    if (dto.status === InvoiceStatus.PAID) {
      updateData.paidAt = dto.paidAt ?? new Date();
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 标记发票为已支付
   */
  async markAsPaid(id: string, paidAt?: Date): Promise<Invoice> {
    return this.updateStatus(id, {
      status: InvoiceStatus.PAID,
      paidAt: paidAt ?? new Date(),
    });
  }

  /**
   * 取消发票
   */
  async cancel(id: string, reason?: string): Promise<Invoice> {
    return this.updateStatus(id, {
      status: InvoiceStatus.CANCELLED,
      notes: reason,
    });
  }

  /**
   * 获取租户的所有发票
   */
  async findByTenant(tenantId: string): Promise<InvoiceResponseDto[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
          },
        },
      },
    });

    return invoices.map((invoice) => this.mapToResponseDto(invoice));
  }

  /**
   * 获取发票统计
   */
  async getStats(): Promise<InvoiceStatsDto> {
    const [counts, amounts] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        _sum: { amount: true },
      }),
    ]);

    const countMap: Record<string, number> = {};
    const amountMap: Record<string, number> = {};

    counts.forEach((c) => {
      countMap[c.status] = c._count.status;
    });

    amounts.forEach((a) => {
      amountMap[a.status] = Number(a._sum.amount) || 0;
    });

    return {
      total: Object.values(countMap).reduce((a, b) => a + b, 0),
      pending: countMap['PENDING'] || 0,
      paid: countMap['PAID'] || 0,
      overdue: countMap['OVERDUE'] || 0,
      cancelled: countMap['CANCELLED'] || 0,
      totalAmount:
        (amountMap['PENDING'] || 0) +
        (amountMap['PAID'] || 0) +
        (amountMap['OVERDUE'] || 0),
      paidAmount: amountMap['PAID'] || 0,
      pendingAmount: amountMap['PENDING'] || 0,
      overdueAmount: amountMap['OVERDUE'] || 0,
    };
  }

  /**
   * 检查并更新逾期发票
   */
  async checkOverdueInvoices(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.invoice.updateMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: now },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    return result.count;
  }

  /**
   * 为租户生成订阅发票
   */
  async generateSubscriptionInvoice(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    planPrice: number,
    planName: string,
  ): Promise<Invoice> {
    const dueDate = new Date(periodStart);
    dueDate.setDate(dueDate.getDate() + 15); // 15天付款期

    const items: InvoiceLineItemDto[] = [
      {
        description: `${planName} 订阅费 (${periodStart.toISOString().split('T')[0]} - ${periodEnd.toISOString().split('T')[0]})`,
        quantity: 1,
        unitPrice: planPrice,
        amount: planPrice,
      },
    ];

    return this.create({
      tenantId,
      items,
      periodStart,
      periodEnd,
      dueDate,
    });
  }

  /**
   * 验证状态转换
   */
  private validateStatusTransition(
    current: InvoiceStatus,
    target: InvoiceStatus,
  ): void {
    const allowedTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      [InvoiceStatus.PENDING]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
      [InvoiceStatus.OVERDUE]: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
      [InvoiceStatus.PAID]: [InvoiceStatus.REFUNDED],
      [InvoiceStatus.CANCELLED]: [],
      [InvoiceStatus.REFUNDED]: [],
    };

    if (!allowedTransitions[current].includes(target)) {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `无法从 ${current} 转换到 ${target}`,
        { currentStatus: current, targetStatus: target },
      );
    }
  }

  /**
   * 映射到响应 DTO
   */
  private mapToResponseDto(invoice: any): InvoiceResponseDto {
    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      invoiceNo: invoice.invoiceNo,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      status: invoice.status as InvoiceStatus,
      paidAt: invoice.paidAt ?? undefined,
      dueDate: invoice.dueDate,
      items: invoice.items as InvoiceLineItemDto[] | undefined,
      notes: invoice.notes ?? undefined,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      tenant: invoice.tenant,
    };
  }
}
