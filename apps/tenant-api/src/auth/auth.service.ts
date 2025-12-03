import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException, ErrorCodes } from '../common';
import { JwtPayload } from './decorators/current-user.decorator';
import {
  LoginDto,
  ChangePasswordDto,
  LoginResponseDto,
  RefreshResponseDto,
  CurrentUserDto,
} from './dto';

/**
 * 认证服务
 * 处理登录、Token 管理、密码验证等
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 管理员登录
   */
  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { email, password } = loginDto;

    // 查找管理员 - TenantAdmin 使用复合唯一键 (tenantId, email)
    // 需要先按 email 查找所有匹配的管理员
    const admins = await this.prisma.tenantAdmin.findMany({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    if (admins.length === 0) {
      throw BusinessException.unauthorized(
        ErrorCodes.AUTH_401_001,
        '用户名或密码错误',
      );
    }

    // 找到第一个有效的管理员 (如果同一邮箱在多个租户存在)
    let matchedAdmin = null;
    for (const admin of admins) {
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (isPasswordValid) {
        matchedAdmin = admin;
        break;
      }
    }

    if (!matchedAdmin) {
      throw BusinessException.unauthorized(
        ErrorCodes.AUTH_401_001,
        '用户名或密码错误',
      );
    }

    // 检查账号状态 (使用 isActive 字段)
    if (!matchedAdmin.isActive) {
      throw BusinessException.forbidden(
        ErrorCodes.AUTH_403_001,
        '账号已被禁用',
      );
    }

    // 检查租户状态
    if (matchedAdmin.tenant.status !== 'ACTIVE') {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        `租户状态异常: ${matchedAdmin.tenant.status}`,
      );
    }

    // 检查租户是否过期
    if (
      matchedAdmin.tenant.expiresAt &&
      new Date(matchedAdmin.tenant.expiresAt) < new Date()
    ) {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        '租户已过期',
      );
    }

    // 获取默认实例 ID
    const instances = await this.prisma.middlewareInstance.findMany({
      where: {
        tenantId: matchedAdmin.tenantId,
        status: 'ONLINE',
      },
      take: 1,
      select: { id: true },
    });
    const instanceId = instances[0]?.id || '';

    // 生成 Token - 转换角色为小写
    const tokens = await this.generateTokens({
      sub: matchedAdmin.id,
      email: matchedAdmin.email,
      role: matchedAdmin.role.toLowerCase() as 'owner' | 'admin' | 'operator',
      tenantId: matchedAdmin.tenantId,
      instanceId,
    });

    // 更新登录信息
    await this.prisma.tenantAdmin.update({
      where: { id: matchedAdmin.id },
      data: {
        lastLogin: new Date(),
      },
    });

    this.logger.log(`管理员登录成功: ${matchedAdmin.email}`);

    return tokens;
  }

  /**
   * 刷新 Token
   */
  async refreshToken(refreshToken: string): Promise<RefreshResponseDto> {
    try {
      // 验证 refresh token
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      // 检查管理员是否存在且有效
      const admin = await this.prisma.tenantAdmin.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          tenantId: true,
        },
      });

      if (!admin || !admin.isActive) {
        throw BusinessException.unauthorized(
          ErrorCodes.AUTH_401_002,
          '无效的刷新令牌',
        );
      }

      // 获取默认实例
      const instances = await this.prisma.middlewareInstance.findMany({
        where: {
          tenantId: admin.tenantId,
          status: 'ONLINE',
        },
        take: 1,
        select: { id: true },
      });
      const instanceId = instances[0]?.id || '';

      // 生成新的 Token
      return this.generateTokens({
        sub: admin.id,
        email: admin.email,
        role: admin.role.toLowerCase() as 'owner' | 'admin' | 'operator',
        tenantId: admin.tenantId,
        instanceId,
      });
    } catch {
      throw BusinessException.unauthorized(
        ErrorCodes.AUTH_401_002,
        '无效或过期的刷新令牌',
      );
    }
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!admin) {
      throw BusinessException.notFound(
        ErrorCodes.ADMIN_404_001,
        '管理员不存在',
      );
    }

    // 获取默认实例
    const instances = await this.prisma.middlewareInstance.findMany({
      where: {
        tenantId: admin.tenantId,
        status: 'ONLINE',
      },
      take: 1,
      select: { id: true },
    });

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role.toLowerCase(),
      tenantId: admin.tenantId,
      tenantName: admin.tenant.name,
      instanceId: instances[0]?.id || '',
      avatar: undefined, // TenantAdmin 模型没有 avatar 字段
      lastLoginAt: admin.lastLogin?.toISOString(),
    };
  }

  /**
   * 修改密码
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!admin) {
      throw BusinessException.notFound(ErrorCodes.ADMIN_404_001);
    }

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isPasswordValid) {
      throw BusinessException.badRequest(
        ErrorCodes.AUTH_401_001,
        '当前密码错误',
      );
    }

    // 加密新密码
    const bcryptRounds = this.configService.get<number>('security.bcryptRounds');
    const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds!);

    // 更新密码
    await this.prisma.tenantAdmin.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    this.logger.log(`管理员修改密码成功: ${userId}`);
  }

  /**
   * 生成访问令牌和刷新令牌
   */
  private async generateTokens(
    payload: JwtPayload,
  ): Promise<LoginResponseDto> {
    const expiresIn = this.configService.get<string>('jwt.expiresIn')!;
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    )!;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    // 解析过期时间为秒数
    const expiresInSeconds = this.parseExpiresIn(expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  /**
   * 解析过期时间字符串为秒数
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600; // 默认 1 小时

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 3600;
    }
  }
}
