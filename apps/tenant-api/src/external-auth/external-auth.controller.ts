/**
 * 外部应用认证控制器
 *
 * 为第三方应用提供 API Key + Secret 认证机制
 * 认证成功后返回短期 Access Token 和 Refresh Token
 *
 * 认证流程:
 * 1. POST /api/v1/external/auth - 使用 API Key + Secret 获取 Token
 * 2. 使用 Access Token 调用其他 API (15分钟有效期)
 * 3. POST /api/v1/external/auth/refresh - 使用 Refresh Token 刷新 (7天有效期)
 * 4. 两者都过期时，重新使用 API Key + Secret 认证
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimitGuard, RateLimit } from '../security';
import { MtManagerApiKeyService, ApiKeyAuthResponse, RefreshTokenResponse } from '../mt-manager';
import {
  ExternalAuthDto,
  ExternalAuthResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
} from './dto';

@ApiTags('External Auth')
@Controller('external/auth')
export class ExternalAuthController {
  constructor(private readonly apiKeyService: MtManagerApiKeyService) {}

  /**
   * 使用 API Key + Secret 进行认证
   * 公开接口，不需要 JWT
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'login' })
  @ApiOperation({
    summary: '外部应用认证',
    description: `
使用 API Key 和 Secret 进行认证，获取 Access Token 和 Refresh Token。

**认证流程:**
1. 在租户后台为 MT 经理账号生成 API Key
2. 使用 API Key ID 和 Secret 调用此接口
3. 获取 Access Token (15分钟有效) 和 Refresh Token (7天有效)
4. 使用 Access Token 调用其他 API
5. Access Token 过期后使用 Refresh Token 刷新
6. 两者都过期后，重新调用此接口认证

**安全注意事项:**
- API Secret 请妥善保管，切勿泄露
- 建议仅在服务端使用，不要在客户端暴露
- 如怀疑泄露，请立即在租户后台撤销 API Key
    `,
  })
  @ApiBody({ type: ExternalAuthDto })
  @ApiResponse({
    status: 200,
    description: '认证成功',
    type: ExternalAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: '无效的 API Key 或 Secret' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async authenticate(
    @Body() dto: ExternalAuthDto,
    @Req() req: Request,
  ): Promise<ApiKeyAuthResponse> {
    const clientIp = this.getClientIp(req);
    return this.apiKeyService.authenticate(dto.apiKeyId, dto.apiSecret, clientIp);
  }

  /**
   * 使用 Refresh Token 刷新 Access Token
   * 公开接口，不需要 JWT
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ strategy: 'general' })
  @ApiOperation({
    summary: '刷新 Access Token',
    description: `
使用 Refresh Token 获取新的 Access Token 和 Refresh Token。

**使用场景:**
- Access Token 过期后，使用此接口刷新
- Refresh Token 有效期为 7 天
- 每次刷新会返回新的 Refresh Token (旧的自动失效)

**注意:**
- Refresh Token 过期后，需重新使用 API Key + Secret 认证
    `,
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Refresh Token 无效或已过期' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<RefreshTokenResponse> {
    const clientIp = this.getClientIp(req);
    return this.apiKeyService.refreshAccessToken(dto.refreshToken, clientIp);
  }

  /**
   * 获取客户端真实 IP 地址
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }
}
