/**
 * 指标控制器
 * 提供 Prometheus 指标端点
 */

import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * 获取 Prometheus 格式的指标
   */
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await this.metricsService.getMetrics();
      res.set('Content-Type', this.metricsService.getContentType());
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  }
}
