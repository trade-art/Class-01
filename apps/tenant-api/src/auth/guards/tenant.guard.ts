import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_INSTANCE_CHECK_KEY } from '../decorators/skip-instance-check.decorator';
import { Reflector } from '@nestjs/core';
import { BusinessException, ErrorCodes } from '../../common';

/**
 * 租户状态守卫
 * 验证租户和实例是否处于有效状态
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.tenantId) {
      return true; // 让 JwtAuthGuard 处理未认证情况
    }

    // 检查租户状态
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!tenant) {
      throw BusinessException.notFound(
        ErrorCodes.TENANT_404_001,
        '租户不存在',
      );
    }

    // 检查租户是否过期
    if (tenant.expiresAt && new Date(tenant.expiresAt) < new Date()) {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        '租户已过期，请联系管理员续期',
      );
    }

    // 检查租户状态 (使用 ACTIVE 大写)
    if (tenant.status !== 'ACTIVE') {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        `租户状态异常: ${tenant.status}`,
      );
    }

    // 检查是否跳过实例检查（租户级别数据接口）
    const skipInstanceCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_INSTANCE_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果标记了跳过实例检查，或者没有 instanceId，则不检查实例状态
    if (skipInstanceCheck || !user.instanceId) {
      return true;
    }

    // 检查实例状态
    const instance = await this.prisma.middlewareInstance.findUnique({
      where: { id: user.instanceId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!instance) {
      throw BusinessException.notFound(
        ErrorCodes.INSTANCE_404_001,
        '实例不存在',
      );
    }

    // 允许 ONLINE 和 DEGRADED 状态 (DEGRADED 表示部分功能可用)
    // 只拒绝 OFFLINE、MAINTENANCE 等完全不可用的状态
    if (instance.status !== 'ONLINE' && instance.status !== 'DEGRADED') {
      throw BusinessException.serviceUnavailable(
        ErrorCodes.INSTANCE_503_001,
        `MT5 实例离线: ${instance.status}`,
      );
    }

    return true;
  }
}
