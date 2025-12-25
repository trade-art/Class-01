import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceTokenService } from '../auth/services/service-token.service';
import {
  ManagerAccessTokenResponseDto,
  ManagerAccessTokenInfoDto,
} from './dto/manager-access-token.dto';

/**
 * Manager 验证结果
 */
interface ManagerValidationResult {
  manager: {
    id: string;
    tenantId: string;
    managerLogin: bigint;
    displayName: string | null;
    isActive: boolean;
  };
  server: {
    id: string;
    serverId: string;
    displayName: string | null;
    platformType: string;
    middlewareId: string;
    middlewareUrl: string;
  };
}

/**
 * Manager Access Token 服务
 *
 * 为租户后台提供获取 Manager Access Token 的能力
 * 生成的 Token 使用 Pool Mode，通过 managerId 在中间件连接池中复用连接
 *
 * Requirements: REQ-4 (新增内部 Access Token 端点)
 */
@Injectable()
export class MtManagerAccessTokenService {
  private readonly logger = new Logger(MtManagerAccessTokenService.name);

  /** Token 默认过期时间 (秒) - 15 分钟 */
  private readonly defaultExpiresIn = 900;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceTokenService: ServiceTokenService,
  ) {}

  /**
   * 生成 Manager Access Token
   *
   * 验证 Manager 访问权限后，生成 Pool Mode Service Token
   * 该 Token 可用于访问中间件 API，中间件通过 managerId 从连接池获取连接
   *
   * @param tenantId 租户 ID
   * @param managerId 经理账号 ID
   * @param userId 操作用户 ID (用于审计)
   * @returns Access Token 响应
   *
   * @throws NotFoundException Manager 不存在
   * @throws ForbiddenException Manager 未激活或不属于该租户
   * @throws BadRequestException 中间件未配置或未分配
   */
  async generateAccessToken(
    tenantId: string,
    managerId: string,
    userId: string,
  ): Promise<ManagerAccessTokenResponseDto> {
    // 验证 Manager 访问权限
    const validation = await this.validateManagerAccess(tenantId, managerId);

    // 生成 Pool Mode Token
    // 注意: apiKeyId 使用 'console' 标识这是来自 Tenant Console 的直接访问（非第三方 API Key）
    const tokenResult = this.serviceTokenService.generatePoolModeToken({
      managerId: validation.manager.id,
      tenantId: validation.manager.tenantId,
      apiKeyId: 'console', // 标识为 Tenant Console 直接访问
      scopes: ['*'],
      expiresIn: this.defaultExpiresIn,
    });

    this.logger.log(
      `生成 Manager Access Token: managerId=${managerId}, userId=${userId}, expiresIn=${this.defaultExpiresIn}s`,
    );

    // 构建响应
    const managerInfo: ManagerAccessTokenInfoDto = {
      id: validation.manager.id,
      managerLogin: validation.manager.managerLogin.toString(),
      displayName: validation.manager.displayName,
      serverName: validation.server.displayName || validation.server.serverId,
      platformType: validation.server.platformType,
    };

    return {
      accessToken: tokenResult.token,
      expiresIn: this.defaultExpiresIn,
      expiresAt: tokenResult.expiresAt,
      tokenType: 'Bearer',
      middlewareUrl: validation.server.middlewareUrl,
      manager: managerInfo,
    };
  }

  /**
   * 验证 Manager 访问权限
   *
   * 检查以下条件:
   * 1. Manager 存在
   * 2. Manager 属于指定租户
   * 3. Manager 已激活
   * 4. Manager 关联的服务器有中间件配置
   * 5. 中间件已分配给该租户
   *
   * @param tenantId 租户 ID
   * @param managerId 经理账号 ID
   * @returns 验证结果，包含 Manager 和 Server 信息
   *
   * @throws NotFoundException Manager 不存在
   * @throws ForbiddenException Manager 未激活、不属于该租户或中间件未分配
   * @throws BadRequestException 中间件未配置
   */
  async validateManagerAccess(
    tenantId: string,
    managerId: string,
  ): Promise<ManagerValidationResult> {
    // 查询 Manager 及其关联的 Server
    const manager = await this.prisma.mtManager.findUnique({
      where: { id: managerId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            middlewareId: true,
            middlewareUrl: true,
            isActive: true,
          },
        },
      },
    });

    // 检查 Manager 是否存在
    if (!manager) {
      throw new NotFoundException(`经理账号不存在`);
    }

    // 检查 Manager 是否属于该租户
    if (manager.tenantId !== tenantId) {
      this.logger.warn(
        `租户 ${tenantId} 尝试访问不属于自己的 Manager ${managerId}`,
      );
      throw new ForbiddenException(`无权访问该经理账号`);
    }

    // 检查 Manager 是否激活
    if (!manager.isActive) {
      throw new ForbiddenException(`经理账号未激活`);
    }

    // 检查关联的服务器是否激活
    if (!manager.server.isActive) {
      throw new ForbiddenException(`关联的 MT 服务器未激活`);
    }

    // 检查服务器是否配置了中间件
    if (!manager.server.middlewareId || !manager.server.middlewareUrl) {
      throw new BadRequestException(
        `MT 服务器未配置中间件实例，请先在 MT 服务器设置中选择中间件`,
      );
    }

    // 检查中间件是否已分配给该租户
    const middlewareAssignment =
      await this.prisma.middlewareAssignment.findUnique({
        where: {
          middlewareId_tenantId: {
            middlewareId: manager.server.middlewareId,
            tenantId: tenantId,
          },
        },
      });

    if (!middlewareAssignment) {
      this.logger.warn(
        `租户 ${tenantId} 的 Manager ${managerId} 关联的中间件 ${manager.server.middlewareId} 未分配给该租户`,
      );
      throw new ForbiddenException(`中间件实例未分配给当前租户`);
    }

    return {
      manager: {
        id: manager.id,
        tenantId: manager.tenantId,
        managerLogin: manager.managerLogin,
        displayName: manager.displayName,
        isActive: manager.isActive,
      },
      server: {
        id: manager.server.id,
        serverId: manager.server.serverId,
        displayName: manager.server.displayName,
        platformType: manager.server.platformType,
        middlewareId: manager.server.middlewareId,
        middlewareUrl: manager.server.middlewareUrl,
      },
    };
  }
}
