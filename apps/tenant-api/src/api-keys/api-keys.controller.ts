import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipInstanceCheck } from '../auth/decorators/skip-instance-check.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeysService } from './api-keys.service';
import {
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  UpdateApiKeyDto,
  ApiKeyQueryDto,
  ApiKeyListResponseDto,
  ApiKeyListItemDto,
  ApiKeyDetailDto,
  ValidateApiKeyDto,
  ValidateApiKeyResponseDto,
  RevokeApiKeyDto,
} from './dto';

/**
 * API Key 控制器
 * 提供 API Key 的 CRUD 操作和内部验证端点
 */
@ApiTags('API Keys')
@Controller()
export class ApiKeysController {
  /** 内部调用密钥 (用于验证端点) */
  private readonly internalSecret: string;

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
  ) {
    this.internalSecret = this.configService.get<string>(
      'INTERNAL_API_SECRET',
      'internal-secret-change-me',
    );
  }

  // ============================================
  // Tenant API Key Management (需要 JWT 认证)
  // ============================================

  /**
   * 获取 API Key 列表
   */
  @Get('api-keys')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @ApiOperation({ summary: '获取 API Key 列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取 API Key 列表',
    type: ApiKeyListResponseDto,
  })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ApiKeyQueryDto,
  ): Promise<ApiKeyListResponseDto> {
    return this.apiKeysService.findAll(user.tenantId, query);
  }

  /**
   * 创建 API Key
   */
  @Post('api-keys')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @ApiOperation({
    summary: '创建 API Key',
    description: '创建新的 API Key。注意：完整的 Key 仅在创建时返回一次，请妥善保存。',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建 API Key',
    type: CreateApiKeyResponseDto,
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    return this.apiKeysService.create(user.tenantId, dto, user.sub);
  }

  /**
   * 获取 API Key 详情
   */
  @Get('api-keys/:id')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @ApiOperation({ summary: '获取 API Key 详情' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取 API Key 详情',
    type: ApiKeyDetailDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'API Key 不存在',
  })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<ApiKeyDetailDto> {
    return this.apiKeysService.findOne(user.tenantId, id);
  }

  /**
   * 更新 API Key
   */
  @Patch('api-keys/:id')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @ApiOperation({
    summary: '更新 API Key',
    description: '更新 API Key 的名称、IP 白名单、作用域等。已撤销的 Key 无法更新。',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新 API Key',
    type: ApiKeyListItemDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'API Key 不存在',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '已撤销的 API Key 无法更新',
  })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ): Promise<ApiKeyListItemDto> {
    return this.apiKeysService.update(user.tenantId, id, dto);
  }

  /**
   * 撤销 API Key
   */
  @Delete('api-keys/:id')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @ApiOperation({
    summary: '撤销 API Key',
    description: '撤销 API Key，撤销后无法恢复。已撤销的 Key 将无法用于认证。',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功撤销 API Key',
    type: ApiKeyListItemDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'API Key 不存在',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'API Key 已被撤销',
  })
  async revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto?: RevokeApiKeyDto,
  ): Promise<ApiKeyListItemDto> {
    return this.apiKeysService.revoke(user.tenantId, id, user.sub, dto);
  }

  /**
   * 永久删除 API Key (仅限已吊销或已过期的)
   */
  @Delete('api-keys/:id/permanent')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  @SkipInstanceCheck()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '永久删除 API Key',
    description: '永久删除已吊销或已过期的 API Key。此操作无法恢复。',
  })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '成功删除 API Key',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'API Key 不存在',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '只能删除已吊销或已过期的 API Key',
  })
  async deletePermanently(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.apiKeysService.delete(user.tenantId, id);
  }

  // ============================================
  // Internal Validation Endpoint (供中间件调用)
  // ============================================

  /**
   * 验证 API Key (内部端点)
   * 供 MT5 中间件调用，验证 API Key 的有效性
   * 需要提供内部调用密钥进行认证
   */
  @Post('internal/api-keys/validate')
  @Public() // 跳过 JWT 认证，使用内部密钥认证
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证 API Key (内部)',
    description:
      '供中间件内部调用的 API Key 验证端点。需要在 X-Internal-Secret 头中提供内部调用密钥。',
  })
  @ApiHeader({
    name: 'X-Internal-Secret',
    description: '内部调用密钥',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '验证结果',
    type: ValidateApiKeyResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '内部调用密钥无效',
  })
  async validateApiKey(
    @Headers('x-internal-secret') internalSecret: string,
    @Body() dto: ValidateApiKeyDto,
  ): Promise<ValidateApiKeyResponseDto> {
    // 验证内部调用密钥
    if (!internalSecret || internalSecret !== this.internalSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    return this.apiKeysService.validate(dto);
  }

  /**
   * 验证 API Key (GET 方式，便于调试)
   * 仅在开发环境可用
   */
  @Get('internal/api-keys/validate')
  @Public()
  @ApiOperation({
    summary: '验证 API Key (GET, 仅开发环境)',
    description: '便于调试的 GET 方式验证端点，仅在开发环境可用。',
  })
  @ApiHeader({
    name: 'X-Internal-Secret',
    description: '内部调用密钥',
    required: true,
  })
  @ApiHeader({
    name: 'X-API-Key',
    description: '要验证的 API Key',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '验证结果',
    type: ValidateApiKeyResponseDto,
  })
  async validateApiKeyGet(
    @Headers('x-internal-secret') internalSecret: string,
    @Headers('x-api-key') apiKey: string,
    @Query('scopes') scopes?: string,
    @Query('clientIp') clientIp?: string,
  ): Promise<ValidateApiKeyResponseDto> {
    // 仅在开发环境可用
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      throw new UnauthorizedException('This endpoint is not available in production');
    }

    // 验证内部调用密钥
    if (!internalSecret || internalSecret !== this.internalSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    if (!apiKey) {
      return {
        valid: false,
        reason: 'API Key is required',
        errorCode: 'INVALID_KEY',
      };
    }

    return this.apiKeysService.validate({
      apiKey,
      requiredScopes: scopes ? scopes.split(',') : undefined,
      clientIp,
    });
  }
}
