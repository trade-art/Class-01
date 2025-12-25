import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException, ErrorCodes } from '../common';
import { JwtPayload } from './decorators/current-user.decorator';
import { MtServerService } from '../middleware-proxy/services/mt-server.service';
import { MiddlewareAuthService } from '../middleware-proxy/services/middleware-auth.service';
import { AccountLockoutService } from '../security/account-lockout.service';
import { PasswordService } from '../security/password.service';
import { AuditLoggerService } from '../security/audit-logger.service';
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
    private readonly mtServerService: MtServerService,
    private readonly middlewareAuthService: MiddlewareAuthService,
    private readonly accountLockoutService: AccountLockoutService,
    private readonly passwordService: PasswordService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /**
   * 管理员登录
   * @param loginDto 登录信息
   * @param domain 可选的请求域名，用于白标识别
   * @param ipAddress 客户端 IP 地址
   */
  async login(
    loginDto: LoginDto,
    domain?: string,
    ipAddress?: string,
  ): Promise<LoginResponseDto> {
    const { email, password } = loginDto;

    // 检查账户是否被锁定
    const lockoutStatus = await this.accountLockoutService.getLockoutStatus(email);
    if (lockoutStatus.isLocked) {
      this.logger.warn(`Login attempt for locked account: ${email}`);
      throw BusinessException.forbidden(
        ErrorCodes.AUTH_403_001,
        `账户已锁定，请在 ${Math.ceil(lockoutStatus.remainingSeconds / 60)} 分钟后重试`,
      );
    }

    // 查找管理员（邮箱全局唯一，无需指定租户）
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            expiresAt: true,
            logo: true,
            displayName: true,
            primaryColor: true,
            customDomain: true,
            favicon: true,
          },
        },
      },
    });

    if (!admin) {
      // 记录失败尝试
      await this.accountLockoutService.recordFailedAttempt(email, ipAddress, 'User not found');
      // 记录审计日志
      await this.auditLogger.logLoginFailure(email, 'User not found', ipAddress);
      throw BusinessException.unauthorized(
        ErrorCodes.AUTH_401_001,
        '用户名或密码错误',
      );
    }

    // 验证密码
    const isPasswordValid = await this.passwordService.verifyPassword(password, admin.password);
    if (!isPasswordValid) {
      // 记录失败尝试
      const newLockoutStatus = await this.accountLockoutService.recordFailedAttempt(
        email,
        ipAddress,
        'Invalid password',
      );
      // 记录审计日志
      await this.auditLogger.logLoginFailure(email, 'Invalid password', ipAddress);
      if (newLockoutStatus.isLocked) {
        // 记录账户锁定审计
        await this.auditLogger.logAccountLockout(email, ipAddress || '', 'Too many failed attempts');
        throw BusinessException.forbidden(
          ErrorCodes.AUTH_403_001,
          `密码错误次数过多，账户已锁定 ${Math.ceil(newLockoutStatus.remainingSeconds / 60)} 分钟`,
        );
      }
      throw BusinessException.unauthorized(
        ErrorCodes.AUTH_401_001,
        `用户名或密码错误（剩余 ${this.accountLockoutService.getConfig().maxAttempts - newLockoutStatus.failedAttempts} 次尝试机会）`,
      );
    }

    // 检查账号状态 (使用 isActive 字段)
    if (!admin.isActive) {
      throw BusinessException.forbidden(
        ErrorCodes.AUTH_403_001,
        '账号已被禁用',
      );
    }

    // 检查租户状态
    if (admin.tenant.status !== 'ACTIVE') {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        `租户状态异常: ${admin.tenant.status}`,
      );
    }

    // 检查租户是否过期
    if (
      admin.tenant.expiresAt &&
      new Date(admin.tenant.expiresAt) < new Date()
    ) {
      throw BusinessException.forbidden(
        ErrorCodes.TENANT_403_001,
        '租户已过期',
      );
    }

    // 获取默认实例 ID (兼容旧版)
    // 允许 ONLINE 或 DEGRADED 状态的实例 (DEGRADED 表示部分功能可用)
    const instances = await this.prisma.middlewareInstance.findMany({
      where: {
        tenantId: admin.tenantId,
        status: { in: ['ONLINE', 'DEGRADED'] },
      },
      take: 1,
      select: { id: true },
    });
    const instanceId = instances[0]?.id || '';

    // 获取默认 MT 服务器 (新版多租户)
    const defaultServer = await this.mtServerService.getDefaultServer(admin.tenantId);

    // 生成 Token - 转换角色为小写
    const tokens = await this.generateTokensOnly({
      sub: admin.id,
      email: admin.email,
      role: admin.role.toLowerCase() as 'owner' | 'admin' | 'operator',
      tenantId: admin.tenantId,
      instanceId,
      serverId: defaultServer?.serverId,
      platformType: defaultServer?.platformType as 'MT5' | 'MT4' | undefined,
    });

    // 更新登录信息（保存登录时间和 IP）
    const loginTime = new Date();
    await this.prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: {
        lastLogin: loginTime,
        lastLoginIp: ipAddress || null,
      },
    });

    // 登录成功，重置失败计数
    await this.accountLockoutService.resetFailedAttempts(email);

    // 记录登录成功审计日志
    await this.auditLogger.logLoginSuccess(
      admin.id,
      admin.email,
      admin.tenantId,
      ipAddress,
    );

    this.logger.log(`管理员登录成功: ${admin.email}`);

    // 异步预热中间件连接 (不阻塞登录响应)
    this.preheatMiddlewareConnection(
      instanceId,
      admin.tenantId,
      defaultServer?.serverId,
    ).catch((err) => {
      this.logger.warn(`中间件连接预热失败: ${err.message}`);
    });

    // 返回完整的登录响应
    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role.toLowerCase(),
        // 会话信息
        lastLoginAt: loginTime.toISOString(),
        lastLoginIp: ipAddress || undefined,
        createdAt: admin.createdAt.toISOString(),
      },
      tenant: {
        id: admin.tenant.id,
        code: admin.tenant.code,
        name: admin.tenant.name,
        logo: admin.tenant.logo || undefined,
        displayName: admin.tenant.displayName || undefined,
        primaryColor: admin.tenant.primaryColor || undefined,
        customDomain: admin.tenant.customDomain || undefined,
        favicon: admin.tenant.favicon || undefined,
      },
    };
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

      // 获取默认实例 (兼容旧版)
      // 允许 ONLINE 或 DEGRADED 状态的实例 (DEGRADED 表示部分功能可用)
      const instances = await this.prisma.middlewareInstance.findMany({
        where: {
          tenantId: admin.tenantId,
          status: { in: ['ONLINE', 'DEGRADED'] },
        },
        take: 1,
        select: { id: true },
      });
      const instanceId = instances[0]?.id || '';

      // 获取默认 MT 服务器 (新版多租户)
      const defaultServer = await this.mtServerService.getDefaultServer(admin.tenantId);

      // 生成新的 Token
      const tokens = await this.generateTokensOnly({
        sub: admin.id,
        email: admin.email,
        role: admin.role.toLowerCase() as 'owner' | 'admin' | 'operator',
        tenantId: admin.tenantId,
        instanceId,
        serverId: defaultServer?.serverId,
        platformType: defaultServer?.platformType as 'MT5' | 'MT4' | undefined,
      });
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
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
    // 允许 ONLINE 或 DEGRADED 状态的实例 (DEGRADED 表示部分功能可用)
    const instances = await this.prisma.middlewareInstance.findMany({
      where: {
        tenantId: admin.tenantId,
        status: { in: ['ONLINE', 'DEGRADED'] },
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
      lastLoginIp: admin.lastLoginIp || undefined,
      createdAt: admin.createdAt.toISOString(),
    };
  }

  /**
   * 修改密码
   * @param userId 用户 ID
   * @param changePasswordDto 密码修改信息
   * @param ipAddress 客户端 IP 地址（可选）
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
    ipAddress?: string,
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true, tenantId: true },
    });

    if (!admin) {
      throw BusinessException.notFound(ErrorCodes.ADMIN_404_001);
    }

    // 验证当前密码
    const isPasswordValid = await this.passwordService.verifyPassword(currentPassword, admin.password);
    if (!isPasswordValid) {
      // 记录密码修改失败审计日志
      await this.auditLogger.logPasswordChange(
        admin.id,
        admin.email,
        admin.tenantId,
        ipAddress,
        false,
        '当前密码错误',
      );
      throw BusinessException.badRequest(
        ErrorCodes.AUTH_401_001,
        '当前密码错误',
      );
    }

    // 验证新密码强度
    const validationResult = this.passwordService.validatePassword(newPassword, admin.email);
    if (!validationResult.isValid) {
      // 记录密码修改失败审计日志
      await this.auditLogger.logPasswordChange(
        admin.id,
        admin.email,
        admin.tenantId,
        ipAddress,
        false,
        `密码强度不足: ${validationResult.errors.join('; ')}`,
      );
      throw BusinessException.badRequest(
        ErrorCodes.AUTH_401_001,
        validationResult.errors.join('; '),
      );
    }

    // 检查新密码与旧密码不同
    const isSamePassword = await this.passwordService.verifyPassword(newPassword, admin.password);
    if (isSamePassword) {
      // 记录密码修改失败审计日志
      await this.auditLogger.logPasswordChange(
        admin.id,
        admin.email,
        admin.tenantId,
        ipAddress,
        false,
        '新密码与当前密码相同',
      );
      throw BusinessException.badRequest(
        ErrorCodes.AUTH_401_001,
        '新密码不能与当前密码相同',
      );
    }

    // 加密新密码
    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    // 更新密码
    await this.prisma.tenantAdmin.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 记录密码修改成功审计日志
    await this.auditLogger.logPasswordChange(
      admin.id,
      admin.email,
      admin.tenantId,
      ipAddress,
      true,
    );

    this.logger.log(`管理员修改密码成功: ${userId}`);
  }

  /**
   * 生成访问令牌和刷新令牌 (仅 tokens)
   */
  private async generateTokensOnly(
    payload: JwtPayload,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; tokenType: string }> {
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

  /**
   * 预热中间件连接
   * 在用户登录成功后异步建立与中间件的连接，
   * 这样用户访问 Dashboard 时连接已经就绪，无需等待。
   *
   * @param instanceId 中间件实例 ID
   * @param tenantId 租户 ID
   * @param serverId MT 服务器 ID
   */
  private async preheatMiddlewareConnection(
    instanceId: string,
    tenantId: string,
    serverId?: string,
  ): Promise<void> {
    if (!instanceId) {
      this.logger.debug('跳过中间件预热: 无可用实例');
      return;
    }

    this.logger.log(
      `开始预热中间件连接: tenantId=${tenantId}, serverId=${serverId || 'default'}`,
    );

    try {
      // 使用 Service Token 认证，验证凭证是否有效
      await this.middlewareAuthService.getAuthHeaders(tenantId, serverId);
      this.logger.log('中间件 Service Token 验证成功');
    } catch (error) {
      // 预热失败不影响登录，仅记录警告
      this.logger.warn(
        `中间件连接预热失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
