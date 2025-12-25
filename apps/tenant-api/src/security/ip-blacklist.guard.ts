/**
 * IP 黑名单守卫
 * 检查请求 IP 是否在黑名单中，阻断黑名单 IP 的访问
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IpBlacklistService } from './ip-blacklist.service';

/**
 * 跳过 IP 黑名单检查的装饰器键
 */
export const SKIP_IP_BLACKLIST_KEY = 'skipIpBlacklist';

/**
 * IP 黑名单守卫
 * 全局或局部使用，检查请求 IP 是否在黑名单中
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
  private readonly logger = new Logger(IpBlacklistGuard.name);

  constructor(
    private readonly ipBlacklistService: IpBlacklistService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否跳过 IP 黑名单检查
    const skipCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_IP_BLACKLIST_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ipAddress = this.getClientIp(request);
    const tenantId = this.getTenantId(request);

    // 检查 IP 是否在黑名单中
    const isBlacklisted = await this.ipBlacklistService.isBlacklisted(
      ipAddress,
      tenantId,
    );

    if (isBlacklisted) {
      this.logger.warn(
        `Blocked request from blacklisted IP: ${ipAddress}${tenantId ? ` (tenant: ${tenantId})` : ''}`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Your IP address has been blocked',
        code: 'IP_BLACKLISTED',
      });
    }

    return true;
  }

  /**
   * 获取客户端真实 IP 地址
   * 支持反向代理场景
   */
  private getClientIp(request: Request): string {
    // 优先从 X-Forwarded-For 获取（反向代理场景）
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // 其次从 X-Real-IP 获取（Nginx 配置）
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // 最后从 socket 获取
    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }

  /**
   * 从请求中获取租户 ID
   * 支持多种获取方式
   */
  private getTenantId(request: Request): string | undefined {
    // 从 JWT payload 获取（已认证用户）
    const user = (request as any).user;
    if (user?.tenantId) {
      return user.tenantId;
    }

    // 从请求头获取
    const tenantHeader = request.headers['x-tenant-id'];
    if (tenantHeader) {
      return Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    }

    return undefined;
  }
}
