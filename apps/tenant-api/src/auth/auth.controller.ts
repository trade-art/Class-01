import { Controller, Post, Get, Body, HttpCode, HttpStatus, Req, Res, Query, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ServiceTokenService } from './services/service-token.service';
import {
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  LoginResponseDto,
  RefreshResponseDto,
  CurrentUserDto,
} from './dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';
import {
  CookieService,
  LoginRateLimit,
  SensitiveRateLimit,
  RateLimitGuard,
  RateLimit,
  AuditLoggerService,
} from '../security';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly cookieService: CookieService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @LoginRateLimit()
  @ApiOperation({ summary: '管理员登录' })
  @ApiQuery({
    name: 'useCookie',
    required: false,
    type: Boolean,
    description: '是否使用 HTTP-only Cookie 存储 refresh token',
  })
  @ApiResponse({
    status: 200,
    description: '登录成功',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  @ApiResponse({ status: 403, description: '账户锁定' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('useCookie') useCookie?: string,
  ): Promise<LoginResponseDto> {
    // 从请求头提取域名用于白标识别
    // 优先使用 X-Forwarded-Host (反向代理场景)，其次是 Host
    const forwardedHost = req.headers['x-forwarded-host'] as string;
    const host = req.headers['host'] as string;
    const domain = forwardedHost || host;

    // 移除端口号，只保留域名部分
    const cleanDomain = domain?.split(':')[0];

    // 获取客户端 IP 地址
    const ipAddress = this.getClientIp(req);

    const result = await this.authService.login(loginDto, cleanDomain, ipAddress);

    // 如果请求使用 Cookie 模式，将 refresh token 设置为 HTTP-only cookie
    if (useCookie === 'true') {
      this.cookieService.setRefreshTokenCookie(res, result.refreshToken);
      // 从响应中移除 refreshToken，仅通过 Cookie 返回
      return {
        ...result,
        refreshToken: undefined as unknown as string,
      };
    }

    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '刷新访问令牌' })
  @ApiQuery({
    name: 'useCookie',
    required: false,
    type: Boolean,
    description: '是否从 HTTP-only Cookie 读取 refresh token',
  })
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: '无效的刷新令牌' })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('useCookie') useCookie?: string,
  ): Promise<RefreshResponseDto> {
    // 优先从 Cookie 获取 refresh token，其次从请求体获取
    let refreshToken = refreshTokenDto?.refreshToken;

    if (useCookie === 'true' || !refreshToken) {
      const cookieToken = this.cookieService.getRefreshTokenFromCookie(req);
      if (cookieToken) {
        refreshToken = cookieToken;
      }
    }

    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    const result = await this.authService.refreshToken(refreshToken);

    // 如果使用 Cookie 模式，更新 Cookie 中的 refresh token
    if (useCookie === 'true') {
      this.cookieService.setRefreshTokenCookie(res, result.refreshToken);
      return {
        accessToken: result.accessToken,
        refreshToken: undefined as unknown as string,
        expiresIn: result.expiresIn,
      };
    }

    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: CurrentUserDto,
  })
  async getCurrentUser(
    @CurrentUser() user: JwtPayload,
  ): Promise<CurrentUserDto> {
    return this.authService.getCurrentUser(user.sub);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(RateLimitGuard)
  @SensitiveRateLimit()
  @ApiOperation({ summary: '修改密码' })
  @ApiResponse({ status: 204, description: '修改成功' })
  @ApiResponse({ status: 400, description: '当前密码错误' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    const ipAddress = this.getClientIp(req);
    return this.authService.changePassword(user.sub, changePasswordDto, ipAddress);
  }

  @Post('service-token')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({ summary: '生成中间件服务令牌' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: 'MT 服务器 ID' },
      },
      required: ['serverId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '生成成功',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: '服务令牌' },
        expiresAt: { type: 'string', format: 'date-time', description: '过期时间' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '无效的服务器 ID' })
  @ApiResponse({ status: 401, description: '未授权' })
  async generateServiceToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: { serverId: string },
  ): Promise<{ token: string; expiresAt: string }> {
    // 使用 ServiceTokenService 生成服务令牌
    const result = this.serviceTokenService.generateToken({
      tenantId: user.tenantId,
      instanceId: user.instanceId || user.tenantId,
      serverId: body.serverId,
      managerLogin: 1, // 默认管理员登录
      managerPassword: 'encrypted', // 将在服务层加密
      scopes: ['*'], // 完整权限
    });

    return {
      token: result.token,
      expiresAt: new Date(result.expiresAt).toISOString(),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '退出登录' })
  @ApiResponse({ status: 204, description: '退出成功' })
  async logout(
    @CurrentUser() user: JwtPayload | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // 清除所有认证相关的 Cookie
    this.cookieService.clearAllAuthCookies(res);

    // 如果有有效的用户信息，记录登出审计日志
    if (user?.sub) {
      // 获取客户端 IP 地址
      const ipAddress = this.getClientIp(req);

      // 记录登出审计日志
      await this.auditLogger.logLogout(
        user.sub,
        user.email,
        user.tenantId,
        ipAddress,
      );
    }

    // JWT 是无状态的，客户端删除 token 即可
    // 如果需要服务端失效，可以使用 token 黑名单
    return;
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
}
