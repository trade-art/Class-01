import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * JWT 策略
 * 验证和解析 JWT Token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  /**
   * 验证 JWT Payload
   * 返回值会被附加到 request.user
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // 验证管理员是否存在且有效
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        isActive: true,
        tenantId: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('账号已被禁用');
    }

    // 验证租户 ID 一致性
    if (admin.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Token 无效');
    }

    return payload;
  }
}
