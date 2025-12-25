import {
  Controller,
  Post,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentContext, CurrentApiKey } from '../auth/decorators/current-context.decorator';
import { RequestContext, ApiKeyFullContext } from '../auth/interfaces/request-context.interface';
import { PrismaService } from '../prisma/prisma.service';
import { WsTicketService } from './ws-ticket.service';
import { WsTicketResponseDto } from './dto/ws-ticket.dto';

/**
 * WebSocket Ticket 控制器
 *
 * 提供 WS Ticket 签发 API 端点，供第三方应用获取 WebSocket 连接凭证。
 *
 * @requirements REQ-TA-1
 */
@ApiTags('External Trading')
@Controller('external/trading')
export class WsTicketController {
  private readonly logger = new Logger(WsTicketController.name);

  constructor(
    private readonly wsTicketService: WsTicketService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 生成 WebSocket Ticket
   *
   * 第三方应用使用 Access Token 调用此接口获取一次性 WS Ticket，
   * 然后使用 Ticket 连接 C++ 中间件的 WebSocket 端点接收实时数据。
   *
   * @param context 请求上下文
   * @param apiKeyPayload API Key 完整上下文
   * @returns WS Ticket 响应
   *
   * @requirements REQ-TA-1
   */
  @Post('ws-ticket')
  @UseGuards(ApiKeyAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '生成 WebSocket Ticket',
    description: `
使用 Access Token 获取一次性 WebSocket 连接凭证。

**流程:**
1. 第三方应用使用 Access Token 调用此接口
2. 接口返回一次性 Ticket 和 WebSocket 端点信息
3. 使用 Ticket 连接 WebSocket: \`wss://host:port?ticket={ticket}\`
4. 连接成功后订阅频道接收实时数据

**注意:**
- Ticket 有效期 30 秒，仅可使用一次
- 可订阅的频道取决于 API Key 的 scopes 权限
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Ticket 生成成功',
    type: WsTicketResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Access Token 无效或已过期',
  })
  @ApiResponse({
    status: 403,
    description: 'API Key 无效或已被禁用',
  })
  @ApiResponse({
    status: 503,
    description: 'Redis 服务不可用',
  })
  async generateTicket(
    @CurrentContext() context: RequestContext,
    @CurrentApiKey() apiKeyPayload: ApiKeyFullContext,
  ): Promise<WsTicketResponseDto> {
    this.logger.log(
      `WS Ticket 请求: tenant=${context.tenantId}, manager=${context.managerId}`,
    );

    // 确定 scopes
    let scopes: string[];

    // 检查是否是 MtManager API Key (以 mk_ 开头)
    if (apiKeyPayload.apiKeyId.startsWith('mk_')) {
      // MtManager API Key 使用完整权限 (由 ApiKeyAuthGuard 已验证)
      scopes = ['*']; // 所有权限
      this.logger.debug(
        `MtManager API Key ${apiKeyPayload.apiKeyId} 使用完整权限`,
      );
    } else {
      // 通用 API Key，从数据库获取 scopes
      const apiKey = await this.prisma.apiKey.findUnique({
        where: { id: apiKeyPayload.apiKeyId },
        select: { scopes: true, isActive: true, revokedAt: true },
      });

      if (!apiKey) {
        this.logger.warn(`API Key ${apiKeyPayload.apiKeyId} 不存在`);
        throw new ForbiddenException('API Key 无效');
      }

      if (!apiKey.isActive || apiKey.revokedAt) {
        this.logger.warn(`API Key ${apiKeyPayload.apiKeyId} 已被禁用或撤销`);
        throw new ForbiddenException('API Key 已被禁用');
      }

      scopes = apiKey.scopes;
    }

    // 生成 WS Ticket
    const response = await this.wsTicketService.generateTicket(
      context,
      scopes,
    );

    this.logger.log(
      `WS Ticket 生成成功: tenant=${context.tenantId}, channels=${response.channels.join(',')}`,
    );

    return response;
  }
}
