import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 健康检查控制器
 * 提供 K8s/Docker 健康探针端点
 */
@ApiTags('健康检查')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 健康检查 (根路径)
   * 用于 Docker/K8s 健康探针
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '健康检查', description: '检查 API 服务是否正常运行' })
  @ApiResponse({ status: 200, description: '服务正常' })
  @ApiResponse({ status: 503, description: '服务不可用' })
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    // 简单检查数据库连接
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 就绪检查
   */
  @Get('health/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '就绪检查', description: '检查服务是否准备好接收请求' })
  @ApiResponse({ status: 200, description: '服务就绪' })
  async readinessCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 存活检查
   */
  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '存活检查', description: '检查应用是否存活' })
  @ApiResponse({ status: 200, description: '服务存活' })
  async livenessCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
