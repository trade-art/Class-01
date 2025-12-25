import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  ConsoleAdminPayload,
  buildContextFromAdmin,
} from '../interfaces/request-context.interface';

/**
 * JWT 认证守卫
 * 验证请求中的 JWT Token (Console 管理员登录)
 *
 * 认证成功后会在 request 上附加:
 * - user: 原始的 JWT Payload (兼容现有代码)
 * - requestContext: 统一的请求上下文 (新代码推荐使用)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

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

    // 检查是否已经由其他 Guard (如 ApiKeyAuthGuard) 认证
    // 如果 request.user 已设置，说明已通过其他认证方式，跳过 JWT 验证
    if (request.user) {
      return true;
    }

    // 检查是否是 API Key Token (通过解码 JWT 查看是否包含 type 字段)
    // API Key Token 应由 ApiKeyAuthGuard 处理，不是 JwtAuthGuard 的职责
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        try {
          // 解码但不验证签名 (只是检查格式)
          const base64Payload = token.split('.')[1];
          if (base64Payload) {
            const payload = JSON.parse(
              Buffer.from(base64Payload, 'base64').toString('utf8'),
            );
            // 如果 Token 包含 type 字段，说明是 API Key Token
            // 应由 ApiKeyAuthGuard 处理
            if (payload.type === 'access' || payload.type === 'refresh') {
              return true; // 跳过 JWT 验证，交给 ApiKeyAuthGuard 处理
            }
          }
        } catch {
          // 解码失败则继续正常 JWT 验证流程
        }
      }
    }

    // 调用父类的 canActivate 进行 JWT 验证
    const result = await super.canActivate(context);

    if (result) {
      // 验证成功后，构建统一的 RequestContext
      const request = context.switchToHttp().getRequest();
      const user = request.user as ConsoleAdminPayload;

      if (user) {
        request.requestContext = buildContextFromAdmin(user);
      }
    }

    return result as boolean;
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: Error | null,
  ): TUser {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token 已过期，请重新登录');
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('无效的 Token');
      }
      throw new UnauthorizedException('未授权访问');
    }
    return user;
  }
}
