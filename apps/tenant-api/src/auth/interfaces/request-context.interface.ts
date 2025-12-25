/**
 * 认证类型枚举
 */
export enum AuthType {
  /** Console 管理员登录 */
  CONSOLE_ADMIN = 'console_admin',
  /** API Key 第三方应用 */
  API_KEY = 'api_key',
}

/**
 * 统一请求上下文接口
 *
 * 抽象两种认证方式的共同信息，让业务服务可以统一处理。
 * 业务服务不需要关心请求来自 Console 还是第三方应用。
 */
export interface RequestContext {
  /** 认证类型 */
  authType: AuthType;

  /** 租户 ID */
  tenantId: string;

  /** MT 服务器 ID */
  serverId: string;

  /** 实例 ID (兼容旧版，新版使用 serverId) */
  instanceId?: string;

  /** 平台类型 (MT5/MT4) */
  platformType: 'MT5' | 'MT4';

  // ============================================
  // Console Admin 专有字段
  // ============================================

  /** 管理员 ID (Console 登录时) */
  adminId?: string;

  /** 管理员邮箱 (Console 登录时) */
  email?: string;

  /** 管理员角色 (Console 登录时) */
  role?: 'owner' | 'admin' | 'operator';

  // ============================================
  // API Key 专有字段
  // ============================================

  /** MT Manager ID (API Key 认证时) */
  managerId?: string;

  /** MT Manager 登录号 (API Key 认证时) */
  managerLogin?: string;

  /** API Key ID (API Key 认证时) */
  apiKeyId?: string;

  /** 中间件 URL (API Key 认证时，可能直接提供) */
  middlewareUrl?: string;

  /** 中间件实例 ID (API Key 认证时) */
  middlewareId?: string;
}

/**
 * Console 管理员 Token Payload
 * (现有的 JwtPayload，重新导出以保持兼容)
 */
export interface ConsoleAdminPayload {
  /** 管理员 ID */
  sub: string;
  /** 邮箱 */
  email: string;
  /** 角色 */
  role: 'owner' | 'admin' | 'operator';
  /** 租户 ID */
  tenantId: string;
  /** 实例 ID (兼容旧版) */
  instanceId: string;
  /** 默认 MT 服务器 ID (多租户新版) */
  serverId?: string;
  /** 平台类型 (MT5/MT4) */
  platformType?: 'MT5' | 'MT4';
  /** Token 签发时间 */
  iat?: number;
  /** Token 过期时间 */
  exp?: number;
}

/**
 * API Key Token Payload (精简版)
 *
 * 安全改进: Token 只包含最小必要信息 (managerId, tenantId, apiKeyId)
 * 其他信息 (serverId, managerLogin, middlewareUrl 等) 在验证时从数据库获取
 * 这样可以:
 * 1. 减小 Token 体积
 * 2. 避免敏感信息在 Token 中传输
 * 3. 确保使用最新的数据库配置
 */
export interface ApiKeyTokenPayload {
  /** Token 类型 */
  type: 'access' | 'refresh';
  /** MT Manager ID (UUID) */
  managerId: string;
  /** 租户 ID */
  tenantId: string;
  /** API Key ID */
  apiKeyId: string;
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
}

/**
 * 完整的 API Key 上下文信息
 * Token 验证后从数据库补充完整的 Manager 信息
 */
export interface ApiKeyFullContext extends ApiKeyTokenPayload {
  /** MT 服务器 ID */
  serverId: string;
  /** Manager 登录号 */
  managerLogin: string;
  /** 中间件实例 ID */
  middlewareId?: string;
  /** 中间件 URL */
  middlewareUrl?: string;
  /** 平台类型 */
  platformType: string;
}

/**
 * 从 Console Admin Payload 构建 RequestContext
 */
export function buildContextFromAdmin(payload: ConsoleAdminPayload): RequestContext {
  return {
    authType: AuthType.CONSOLE_ADMIN,
    tenantId: payload.tenantId,
    serverId: payload.serverId || '',
    instanceId: payload.instanceId,
    platformType: (payload.platformType as 'MT5' | 'MT4') || 'MT5',
    adminId: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}

/**
 * 从 API Key 完整上下文构建 RequestContext
 *
 * @param context 包含数据库查询补充的完整上下文信息
 */
export function buildContextFromApiKey(context: ApiKeyFullContext): RequestContext {
  return {
    authType: AuthType.API_KEY,
    tenantId: context.tenantId,
    serverId: context.serverId,
    platformType: (context.platformType as 'MT5' | 'MT4') || 'MT5',
    managerId: context.managerId,
    managerLogin: context.managerLogin,
    apiKeyId: context.apiKeyId,
    middlewareUrl: context.middlewareUrl,
    middlewareId: context.middlewareId,
  };
}
