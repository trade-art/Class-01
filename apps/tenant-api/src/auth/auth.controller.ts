import { Controller, Post, Get, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
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

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理员登录' })
  @ApiResponse({
    status: 200,
    description: '登录成功',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    // 从请求头提取域名用于白标识别
    // 优先使用 X-Forwarded-Host (反向代理场景)，其次是 Host
    const forwardedHost = req.headers['x-forwarded-host'] as string;
    const host = req.headers['host'] as string;
    const domain = forwardedHost || host;

    // 移除端口号，只保留域名部分
    const cleanDomain = domain?.split(':')[0];

    return this.authService.login(loginDto, cleanDomain);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新访问令牌' })
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: '无效的刷新令牌' })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<RefreshResponseDto> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
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
  @ApiOperation({ summary: '修改密码' })
  @ApiResponse({ status: 204, description: '修改成功' })
  @ApiResponse({ status: 400, description: '当前密码错误' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user.sub, changePasswordDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出登录' })
  @ApiResponse({ status: 204, description: '退出成功' })
  async logout(): Promise<void> {
    // JWT 是无状态的，客户端删除 token 即可
    // 如果需要服务端失效，可以使用 token 黑名单
    return;
  }
}
