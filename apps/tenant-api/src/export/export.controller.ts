/**
 * 数据导出控制器
 * 提供安全的数据导出 API
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  ExportService,
  ExportFormat,
  ExportType,
  ExportOptions,
} from './export.service';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { RateLimitGuard, SensitiveRateLimit } from '../security';

/**
 * 导出请求 DTO
 */
class ExportRequestDto {
  type: ExportType;
  format?: ExportFormat;
  encrypt?: boolean;
  encryptionPassword?: string;
  startDate?: string;
  endDate?: string;
  sanitize?: boolean;
  limit?: number;
  filters?: Record<string, any>;
}

@ApiTags('数据导出')
@Controller('export')
@ApiBearerAuth()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('types')
  @ApiOperation({ summary: '获取可用的导出类型' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取成功',
  })
  getAvailableTypes(
    @CurrentUser() user: JwtPayload,
  ): { types: ExportType[]; permissions: Record<string, any> } {
    const types = this.exportService.getAvailableExportTypes(user.role);

    const permissions: Record<string, any> = {};
    for (const type of types) {
      const perm = this.exportService.getExportPermission(type);
      if (perm) {
        permissions[type] = {
          maxRecords: perm.maxRecords,
          requiresEncryption: perm.requiresEncryption,
        };
      }
    }

    return { types, permissions };
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @SensitiveRateLimit()
  @ApiOperation({ summary: '导出数据' })
  @ApiBody({ type: ExportRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '导出成功',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '无导出权限',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '参数错误',
  })
  async exportData(
    @CurrentUser() user: JwtPayload,
    @Body() body: ExportRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 获取客户端 IP
    const ipAddress = this.getClientIp(req);

    // 构建导出选项
    const options: ExportOptions = {
      type: body.type,
      format: body.format || ExportFormat.JSON,
      encrypt: body.encrypt,
      encryptionPassword: body.encryptionPassword,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      sanitize: body.sanitize,
      limit: body.limit,
      filters: body.filters,
    };

    // 执行导出
    const result = await this.exportService.exportData(
      user.tenantId,
      user.sub,
      user.email,
      user.role,
      options,
      ipAddress,
    );

    // 设置响应头
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('X-Record-Count', result.recordCount.toString());
    res.setHeader('X-Encrypted', result.encrypted.toString());
    res.setHeader('X-Export-Time', result.exportedAt.toISOString());

    // 发送文件
    res.send(result.content);
  }

  @Post('preview')
  @UseGuards(RateLimitGuard)
  @SensitiveRateLimit()
  @ApiOperation({ summary: '预览导出数据（仅返回前10条）' })
  @ApiBody({ type: ExportRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '预览成功',
  })
  async previewExport(
    @CurrentUser() user: JwtPayload,
    @Body() body: ExportRequestDto,
    @Req() req: Request,
  ): Promise<{
    recordCount: number;
    preview: string;
    estimatedSize: number;
  }> {
    const ipAddress = this.getClientIp(req);

    // 构建导出选项（限制为10条）
    const options: ExportOptions = {
      type: body.type,
      format: body.format || ExportFormat.JSON,
      encrypt: false, // 预览不加密
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      sanitize: body.sanitize ?? true,
      limit: 10, // 预览限制10条
      filters: body.filters,
    };

    // 执行导出
    const result = await this.exportService.exportData(
      user.tenantId,
      user.sub,
      user.email,
      user.role,
      options,
      ipAddress,
    );

    return {
      recordCount: result.recordCount,
      preview: result.content.toString('utf8').slice(0, 2000), // 预览前2000字符
      estimatedSize: result.content.length,
    };
  }

  /**
   * 获取客户端 IP 地址
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }
}
