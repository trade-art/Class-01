import {
  Controller,
  Get,
  Query,
  HttpStatus,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { MtManagerService } from './mt-manager.service';
import {
  InternalManagerInfoDto,
  InternalManagerListResponseDto,
} from './dto';

/**
 * 内部 API 控制器
 * 供 C++ 中间件调用，获取需要预连接的经理账号列表
 *
 * 安全机制：
 * - 使用 X-Internal-Secret 头进行内部认证
 * - 不走 JWT 认证 (@Public 装饰器)
 */
@ApiTags('Internal API')
@Controller('internal')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  /** 内部调用密钥 (用于中间件认证) */
  private readonly internalSecret: string;

  constructor(
    private readonly mtManagerService: MtManagerService,
    private readonly configService: ConfigService,
  ) {
    this.internalSecret = this.configService.get<string>(
      'INTERNAL_API_SECRET',
      'internal-secret-change-me',
    );
  }

  /**
   * 获取经理账号列表 (内部端点)
   * 供 C++ 中间件启动时调用，获取需要预连接的所有经理账号
   *
   * @param internalSecret X-Internal-Secret 头
   * @param middlewareId 中间件实例 ID
   * @returns 经理账号列表
   */
  @Get('managers')
  @Public() // 跳过 JWT 认证，使用内部密钥认证
  @ApiOperation({
    summary: '获取经理账号列表 (内部)',
    description:
      '供 C++ 中间件启动时调用的内部端点，获取需要预连接的所有启用经理账号。需要在 X-Internal-Secret 头中提供内部调用密钥。',
  })
  @ApiHeader({
    name: 'X-Internal-Secret',
    description: '内部调用密钥',
    required: true,
  })
  @ApiQuery({
    name: 'middlewareId',
    description: '中间件实例 UUID',
    required: true,
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取经理账号列表',
    type: InternalManagerListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '内部调用密钥无效',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '缺少必需参数 middlewareId',
  })
  async getManagers(
    @Headers('x-internal-secret') internalSecret: string,
    @Query('middlewareId') middlewareId: string,
  ): Promise<InternalManagerListResponseDto> {
    // 验证内部调用密钥
    if (!internalSecret || internalSecret !== this.internalSecret) {
      this.logger.warn('内部 API 调用失败: 无效的内部密钥');
      throw new UnauthorizedException('Invalid internal secret');
    }

    // 验证必需参数
    if (!middlewareId) {
      this.logger.warn('内部 API 调用失败: 缺少 middlewareId 参数');
      throw new UnauthorizedException('Missing required parameter: middlewareId');
    }

    this.logger.log(`内部 API 调用: 获取中间件 ${middlewareId} 的经理账号列表`);

    // 调用 Service 获取经理账号列表
    const result = await this.mtManagerService.findByMiddlewareId(middlewareId);

    this.logger.log(
      `内部 API 响应: 返回 ${result.total} 个经理账号给中间件 ${middlewareId}`,
    );

    return {
      managers: result.managers.map((m) => ({
        managerId: m.managerId,
        tenantId: m.tenantId,
        mtServerId: m.mtServerId,
        serverAddress: m.serverAddress,
        managerLogin: m.managerLogin,
        encryptedPassword: m.encryptedPassword,
      })),
      total: result.total,
    };
  }
}
