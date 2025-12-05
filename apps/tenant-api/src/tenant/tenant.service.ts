import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MtServerService } from '../middleware-proxy/services/mt-server.service';

/**
 * 部署模式
 */
export enum DeploymentMode {
  SHARED = 'SHARED',
  DEDICATED = 'DEDICATED',
}

/**
 * 租户配置（公开信息）
 */
export interface TenantConfig {
  id: string;
  code: string;
  name: string;
  displayName?: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  /** 默认平台类型 */
  platformType?: string;
  /** 可用服务器列表 (仅包含基本信息) */
  servers?: {
    serverId: string;
    displayName: string;
    platformType: string;
    isDefault: boolean;
  }[];
}

/**
 * 部署配置
 */
export interface DeploymentConfig {
  tenantId: string;
  tenantCode: string;
  deploymentMode: DeploymentMode;
  /** 中间件 URL 列表（按服务器） */
  middlewareEndpoints: {
    serverId: string;
    platformType: string;
    middlewareUrl: string;
    isDefault: boolean;
  }[];
  /** 默认中间件 URL */
  defaultMiddlewareUrl?: string;
}

/**
 * 租户域名解析服务
 * 支持多种域名识别方式：
 * 1. 子域名约定：{tenant-code}.platform.com
 * 2. 白标域名：TenantDomain 表查询
 * 3. 自定义域名：Tenant.customDomain 字段
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  // 域名解析缓存 (5分钟)
  private readonly domainCache = new Map<string, { tenant: TenantConfig; expires: number }>();
  // 部署配置缓存 (5分钟)
  private readonly deploymentCache = new Map<string, { config: DeploymentConfig; expires: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtServerService: MtServerService,
  ) {}

  /**
   * 通过域名解析租户
   * @param domain 完整域名（如 trading.client.com 或 demo.platform.com）
   */
  async getTenantByDomain(domain: string): Promise<TenantConfig | null> {
    // 检查缓存
    const cached = this.domainCache.get(domain);
    if (cached && cached.expires > Date.now()) {
      return cached.tenant;
    }

    // 尝试多种解析方式
    let tenant = await this.resolveByTenantDomain(domain);

    if (!tenant) {
      tenant = await this.resolveByCustomDomain(domain);
    }

    if (!tenant) {
      tenant = await this.resolveBySubdomain(domain);
    }

    // 缓存结果
    if (tenant) {
      this.domainCache.set(domain, {
        tenant,
        expires: Date.now() + this.CACHE_TTL,
      });
    }

    return tenant;
  }

  /**
   * 通过租户代码获取租户
   */
  async getTenantByCode(code: string): Promise<TenantConfig | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        logo: true,
        favicon: true,
        primaryColor: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return null;
    }

    return this.enrichTenantConfig(tenant);
  }

  /**
   * 清除域名缓存
   */
  clearCache(domain?: string): void {
    if (domain) {
      this.domainCache.delete(domain);
    } else {
      this.domainCache.clear();
    }
  }

  /**
   * 获取租户部署配置
   * 用于 API Gateway 路由决策
   * @param tenantId 租户 ID
   */
  async getDeploymentConfig(tenantId: string): Promise<DeploymentConfig | null> {
    // 检查缓存
    const cacheKey = `deployment:${tenantId}`;
    const cached = this.deploymentCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.config;
    }

    // 查询租户
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        code: true,
        deploymentMode: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return null;
    }

    // 获取服务器列表
    const serversResult = await this.mtServerService.getServers(tenantId);

    const middlewareEndpoints = serversResult.servers.map((s) => ({
      serverId: s.serverId,
      platformType: s.platformType,
      middlewareUrl: s.middlewareUrl,
      isDefault: s.isDefault,
    }));

    // 查找默认中间件 URL
    const defaultServer = middlewareEndpoints.find((e) => e.isDefault);
    const defaultMiddlewareUrl = defaultServer?.middlewareUrl || middlewareEndpoints[0]?.middlewareUrl;

    const config: DeploymentConfig = {
      tenantId: tenant.id,
      tenantCode: tenant.code,
      deploymentMode: tenant.deploymentMode as DeploymentMode,
      middlewareEndpoints,
      defaultMiddlewareUrl,
    };

    // 缓存结果
    this.deploymentCache.set(cacheKey, {
      config,
      expires: Date.now() + this.CACHE_TTL,
    });

    this.logger.debug(`获取租户 ${tenant.code} 部署配置: ${tenant.deploymentMode}`);
    return config;
  }

  /**
   * 通过租户代码获取部署配置
   * @param code 租户代码
   */
  async getDeploymentConfigByCode(code: string): Promise<DeploymentConfig | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!tenant) {
      return null;
    }

    return this.getDeploymentConfig(tenant.id);
  }

  /**
   * 清除部署配置缓存
   */
  clearDeploymentCache(tenantId?: string): void {
    if (tenantId) {
      this.deploymentCache.delete(`deployment:${tenantId}`);
    } else {
      this.deploymentCache.clear();
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 通过 TenantDomain 表解析
   */
  private async resolveByTenantDomain(domain: string): Promise<TenantConfig | null> {
    const tenantDomain = await this.prisma.tenantDomain.findUnique({
      where: { domain },
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true,
            logo: true,
            favicon: true,
            primaryColor: true,
            status: true,
          },
        },
      },
    });

    if (!tenantDomain || tenantDomain.tenant.status !== 'ACTIVE') {
      return null;
    }

    this.logger.debug(`域名 ${domain} 通过 TenantDomain 解析到租户 ${tenantDomain.tenant.code}`);
    return this.enrichTenantConfig(tenantDomain.tenant);
  }

  /**
   * 通过 Tenant.customDomain 解析
   */
  private async resolveByCustomDomain(domain: string): Promise<TenantConfig | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        customDomain: domain,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        logo: true,
        favicon: true,
        primaryColor: true,
        status: true,
      },
    });

    if (!tenant) {
      return null;
    }

    this.logger.debug(`域名 ${domain} 通过 customDomain 解析到租户 ${tenant.code}`);
    return this.enrichTenantConfig(tenant);
  }

  /**
   * 通过子域名约定解析
   * 格式：{tenant-code}.platform.com
   */
  private async resolveBySubdomain(domain: string): Promise<TenantConfig | null> {
    // 提取子域名
    const parts = domain.split('.');
    if (parts.length < 2) {
      return null;
    }

    // 假设第一部分是租户代码
    const possibleTenantCode = parts[0];

    const tenant = await this.prisma.tenant.findUnique({
      where: { code: possibleTenantCode },
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        logo: true,
        favicon: true,
        primaryColor: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return null;
    }

    this.logger.debug(`域名 ${domain} 通过子域名约定解析到租户 ${tenant.code}`);
    return this.enrichTenantConfig(tenant);
  }

  /**
   * 丰富租户配置，添加服务器信息
   */
  private async enrichTenantConfig(tenant: {
    id: string;
    code: string;
    name: string;
    displayName: string | null;
    logo: string | null;
    favicon: string | null;
    primaryColor: string | null;
  }): Promise<TenantConfig> {
    // 获取租户的服务器列表
    const serversResult = await this.mtServerService.getServers(tenant.id);

    const servers = serversResult.servers.map((s) => ({
      serverId: s.serverId,
      displayName: s.displayName || s.serverId,
      platformType: s.platformType,
      isDefault: s.isDefault,
    }));

    // 确定默认平台类型
    const defaultServer = servers.find((s) => s.isDefault);
    const platformType = defaultServer?.platformType || servers[0]?.platformType;

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      displayName: tenant.displayName || undefined,
      logo: tenant.logo || undefined,
      favicon: tenant.favicon || undefined,
      primaryColor: tenant.primaryColor || undefined,
      platformType,
      servers: servers.length > 0 ? servers : undefined,
    };
  }
}
