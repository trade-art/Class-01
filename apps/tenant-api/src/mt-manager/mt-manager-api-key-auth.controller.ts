import { Controller, Post, Body, Ip, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { MtManagerApiKeyService } from './mt-manager-api-key.service';
import {
  AuthenticateApiKeyDto,
  RefreshTokenDto,
  AuthenticateApiKeyResponseDto,
  RefreshTokenResponseDto,
} from './dto';

/**
 * MT 经理账号 API Key 认证控制器 (公开端点)
 *
 * 此控制器不需要 JWT 认证，用于第三方应用通过 API Key + Secret 获取访问令牌。
 * 获取的令牌可用于调用其他需要认证的 API。
 */
@ApiTags('MT Manager API Key Auth')
@Controller('mt-managers/api-key')
@Public() // 跳过全局 JWT 守卫，允许匿名访问
export class MtManagerApiKeyAuthController {
  constructor(private readonly apiKeyService: MtManagerApiKeyService) {}

  /**
   * API Key 认证
   * 使用 API Key ID 和 Secret 获取 Access Token 和 Refresh Token
   */
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'API Key 认证',
    description: `
使用 API Key ID 和 Secret 进行认证，获取访问令牌。

**认证流程:**
1. 使用经理账号管理界面生成 API Key
2. 保存返回的 API Key ID 和 Secret
3. 调用此接口获取 Access Token 和 Refresh Token
4. 使用 Access Token 调用其他 API
5. Access Token 过期后使用 Refresh Token 获取新令牌

**Token 有效期:**
- Access Token: 15 分钟
- Refresh Token: 7 天

**安全提示:**
- API Secret 应安全存储，切勿泄露
- 建议在服务端调用此接口，避免前端暴露 Secret
    `,
  })
  @ApiBody({ type: AuthenticateApiKeyDto })
  @ApiResponse({
    status: 200,
    description: '认证成功，返回 Access Token 和 Refresh Token',
    type: AuthenticateApiKeyResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'API Key 无效、已禁用或 Secret 错误',
  })
  async authenticate(
    @Body() dto: AuthenticateApiKeyDto,
    @Ip() clientIp: string,
  ): Promise<AuthenticateApiKeyResponseDto> {
    return this.apiKeyService.authenticate(dto.apiKeyId, dto.apiSecret, clientIp);
  }

  /**
   * 刷新 Token
   * 使用 Refresh Token 获取新的 Access Token 和 Refresh Token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新 Token',
    description: `
使用 Refresh Token 获取新的 Access Token 和 Refresh Token。

**使用场景:**
- Access Token 即将过期或已过期时调用
- 返回全新的 Access Token 和 Refresh Token
- 旧的 Refresh Token 使用后即失效

**注意事项:**
- Refresh Token 仅能使用一次
- 每次刷新都会返回新的 Refresh Token
- 如果 Refresh Token 过期，需重新使用 API Key + Secret 认证
    `,
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: '刷新成功，返回新的 Access Token 和 Refresh Token',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh Token 无效或已过期',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() clientIp: string,
  ): Promise<RefreshTokenResponseDto> {
    const result = await this.apiKeyService.refreshAccessToken(dto.refreshToken, clientIp);
    return {
      ...result,
      tokenType: 'Bearer',
    };
  }
}
