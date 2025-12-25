import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 中间件不可用异常
 * 当中间件服务熔断器打开或服务不可用时抛出
 * 返回 503 Service Unavailable 状态码
 */
export class MiddlewareUnavailableException extends HttpException {
  /**
   * 建议重试时间（秒）
   */
  readonly retryAfter: number;

  /**
   * 服务器 ID
   */
  readonly serverId: string;

  /**
   * 租户 ID
   */
  readonly tenantId: string;

  constructor(options: {
    tenantId: string;
    serverId: string;
    message?: string;
    retryAfter?: number;
  }) {
    const { tenantId, serverId, message, retryAfter = 30 } = options;

    const responseBody = {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Service Unavailable',
      message: message || `MT 服务器 ${serverId} 暂时不可用，请稍后重试`,
      retryAfter,
      serverId,
      tenantId,
    };

    super(responseBody, HttpStatus.SERVICE_UNAVAILABLE);

    this.retryAfter = retryAfter;
    this.serverId = serverId;
    this.tenantId = tenantId;
  }
}
