import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  CreateMiddlewareDto,
  UpdateMiddlewareDto,
  QueryMiddlewareDto,
  MiddlewareResponseDto,
  MiddlewareWithApiKeyDto,
} from './dto';
import { Middleware, MiddlewareStatus } from '@prisma/client';

/**
 * 中间件管理服务
 * 处理中间件的 CRUD 操作、API Key 管理和健康状态监控
 */
@Injectable()
export class MiddlewareService {
  private readonly logger = new Logger(MiddlewareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 创建新的中间件实例
   * @param dto 创建中间件 DTO
   * @returns 包含注册密钥的中间件响应
   */
  async create(dto: CreateMiddlewareDto): Promise<MiddlewareWithApiKeyDto> {
    // 检查名称是否已存在
    const existingName = await this.prisma.middleware.findFirst({
      where: { name: dto.name },
    });

    if (existingName) {
      throw new ConflictException(`中间件名称 ${dto.name} 已存在`);
    }

    // 生成唯一的注册密钥 (中间件启动时使用)
    const registrationSecret = this.encryptionService.generateApiKey('reg_');
    const registrationSecretHash = this.encryptionService.hash(registrationSecret);

    const middleware = await this.prisma.middleware.create({
      data: {
        name: dto.name,
        description: dto.description,
        url: dto.url || 'pending', // URL 在中间件注册时会更新
        serverIp: dto.serverIp,
        platformType: dto.platformType,
        registrationSecret, // 注册密钥 (用于中间件启动)
        registrationSecretHash, // 注册密钥哈希
        // apiKey 和 apiKeyHash 在中间件注册成功后生成
        assignmentMode: dto.assignmentMode,
        maxTenants: dto.maxTenants,
        status: MiddlewareStatus.UNKNOWN,
      },
      include: {
        assignments: true,
      },
    });

    this.logger.log(`创建中间件: ${middleware.name} (${middleware.id}), registrationSecret 已生成`);

    return {
      ...this.toResponseDto(middleware),
      registrationSecret, // 仅在创建时返回明文注册密钥
    };
  }

  /**
   * 获取所有中间件列表
   * @param query 查询参数
   * @returns 中间件列表
   */
  async findAll(query: QueryMiddlewareDto): Promise<MiddlewareResponseDto[]> {
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignmentMode) {
      where.assignmentMode = query.assignmentMode;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const middlewares = await this.prisma.middleware.findMany({
      where,
      include: {
        assignments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return middlewares.map((m) => this.toResponseDto(m));
  }

  /**
   * 根据 ID 获取中间件详情
   * @param id 中间件 ID
   * @returns 中间件详情
   */
  async findOne(id: string): Promise<MiddlewareResponseDto> {
    const middleware = await this.prisma.middleware.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${id} 不存在`);
    }

    return this.toResponseDto(middleware);
  }

  /**
   * 更新中间件信息
   * @param id 中间件 ID
   * @param dto 更新 DTO
   * @returns 更新后的中间件
   */
  async update(id: string, dto: UpdateMiddlewareDto): Promise<MiddlewareResponseDto> {
    // 检查中间件是否存在
    await this.findOne(id);

    // 如果更新 URL，检查是否冲突
    if (dto.url) {
      const existing = await this.prisma.middleware.findFirst({
        where: {
          url: dto.url,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException(`中间件 URL ${dto.url} 已被其他中间件使用`);
      }
    }

    const middleware = await this.prisma.middleware.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        url: dto.url,
        serverIp: dto.serverIp,
        platformType: dto.platformType,
        assignmentMode: dto.assignmentMode,
        maxTenants: dto.maxTenants,
      },
      include: {
        assignments: true,
      },
    });

    this.logger.log(`更新中间件: ${middleware.name} (${middleware.id})`);

    return this.toResponseDto(middleware);
  }

  /**
   * 删除中间件
   * @param id 中间件 ID
   */
  async remove(id: string): Promise<void> {
    const middleware = await this.findOne(id);

    // 检查是否有关联的租户
    const assignmentCount = await this.prisma.middlewareAssignment.count({
      where: { middlewareId: id },
    });

    if (assignmentCount > 0) {
      throw new ConflictException(
        `中间件 ${middleware.name} 仍有 ${assignmentCount} 个租户分配，请先解除分配`,
      );
    }

    await this.prisma.middleware.delete({
      where: { id },
    });

    this.logger.log(`删除中间件: ${middleware.name} (${id})`);
  }

  /**
   * 重新生成注册密钥
   * @param id 中间件 ID
   * @returns 新的注册密钥
   */
  async regenerateRegistrationSecret(id: string): Promise<{ registrationSecret: string; message: string }> {
    await this.findOne(id);

    const registrationSecret = this.encryptionService.generateApiKey('reg_');
    const registrationSecretHash = this.encryptionService.hash(registrationSecret);

    await this.prisma.middleware.update({
      where: { id },
      data: {
        registrationSecret,
        registrationSecretHash,
        // 重新生成注册密钥后，需要中间件重新注册
        apiKey: null,
        apiKeyHash: null,
        status: MiddlewareStatus.UNKNOWN,
      },
    });

    this.logger.warn(`重新生成中间件注册密钥: ${id}`);

    return {
      registrationSecret,
      message: '新的注册密钥已生成，请妥善保管。中间件需要使用新密钥重新启动。',
    };
  }

  /**
   * 通过 API Key 哈希验证中间件
   * @param apiKey 明文 API Key
   * @returns 中间件信息 (如果验证成功)
   */
  async validateApiKey(apiKey: string): Promise<Middleware | null> {
    const apiKeyHash = this.encryptionService.hash(apiKey);

    const middleware = await this.prisma.middleware.findFirst({
      where: { apiKeyHash },
    });

    return middleware;
  }

  /**
   * 更新中间件健康状态 (由健康检查服务调用)
   * @param id 中间件 ID
   * @param healthData 健康数据
   */
  async updateHealthStatus(
    id: string,
    healthData: {
      status: MiddlewareStatus;
      serverIp?: string;
      activeSessions?: number;
      memoryUsage?: number;
      memoryTotal?: number;
      memoryUsagePercent?: number;
      cpuUsage?: number;
      diskUsage?: number;
      diskUsagePercent?: number;
      diskTotal?: number;
      cacheStatus?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.middleware.update({
      where: { id },
      data: {
        status: healthData.status,
        serverIp: healthData.serverIp,
        activeSessions: healthData.activeSessions,
        memoryUsage: healthData.memoryUsage,
        memoryTotal: healthData.memoryTotal,
        memoryUsagePercent: healthData.memoryUsagePercent,
        cpuUsage: healthData.cpuUsage,
        diskUsage: healthData.diskUsage,
        diskUsagePercent: healthData.diskUsagePercent,
        diskTotal: healthData.diskTotal,
        cacheStatus: healthData.cacheStatus as object | undefined,
        lastHeartbeat: new Date(),
      },
    });
  }

  /**
   * 将数据库模型转换为响应 DTO
   */
  private toResponseDto(
    middleware: Middleware & { assignments?: { id: string }[] },
  ): MiddlewareResponseDto {
    return {
      id: middleware.id,
      name: middleware.name,
      description: middleware.description ?? undefined,
      url: middleware.url,
      platformType: middleware.platformType,
      assignmentMode: middleware.assignmentMode,
      maxTenants: middleware.maxTenants,
      status: middleware.status,
      lastHeartbeat: middleware.lastHeartbeat ?? undefined,
      serverIp: middleware.serverIp ?? undefined,
      activeSessions: middleware.activeSessions,
      memoryUsage: middleware.memoryUsage ?? undefined,
      memoryTotal: middleware.memoryTotal ?? undefined,
      memoryUsagePercent: middleware.memoryUsagePercent ?? undefined,
      cpuUsage: middleware.cpuUsage ?? undefined,
      processCpuUsage: middleware.processCpuUsage ?? undefined,
      processMemory: middleware.processMemory ?? undefined,
      diskUsage: middleware.diskUsage ?? undefined,
      diskUsagePercent: middleware.diskUsagePercent ?? undefined,
      diskTotal: middleware.diskTotal ?? undefined,
      cacheStatus: middleware.cacheStatus as Record<string, unknown> | undefined,
      assignedTenantCount: middleware.assignments?.length ?? 0,
      createdAt: middleware.createdAt,
      updatedAt: middleware.updatedAt,
    };
  }
}
