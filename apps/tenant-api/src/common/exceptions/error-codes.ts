/**
 * Tenant API 错误码定义
 * 格式: MODULE_HTTP_SEQ
 * - MODULE: 模块名称
 * - HTTP: HTTP 状态码
 * - SEQ: 序列号 (001-999)
 */

export const ErrorCodes = {
  // ==================== 认证模块 (AUTH) ====================

  /** 用户名或密码错误 */
  AUTH_401_001: 'AUTH_401_001',
  /** Token 无效或已过期 */
  AUTH_401_002: 'AUTH_401_002',
  /** 账号已被禁用 */
  AUTH_403_001: 'AUTH_403_001',
  /** 权限不足 */
  AUTH_403_002: 'AUTH_403_002',

  // ==================== 租户模块 (TENANT) ====================

  /** 租户已暂停或过期 */
  TENANT_403_001: 'TENANT_403_001',
  /** 租户不存在 */
  TENANT_404_001: 'TENANT_404_001',

  // ==================== 实例模块 (INSTANCE) ====================

  /** 实例不存在或离线 */
  INSTANCE_404_001: 'INSTANCE_404_001',
  /** 中间件服务不可用 */
  INSTANCE_503_001: 'INSTANCE_503_001',

  // ==================== 用户模块 (USER) ====================

  /** 用户不存在 */
  USER_404_001: 'USER_404_001',
  /** 无效的组别 */
  USER_422_001: 'USER_422_001',
  /** 无效的杠杆值 */
  USER_422_002: 'USER_422_002',

  // ==================== 管理员模块 (ADMIN) ====================

  /** 管理员不存在 */
  ADMIN_404_001: 'ADMIN_404_001',
  /** 邮箱已存在 */
  ADMIN_409_001: 'ADMIN_409_001',
  /** 无法删除唯一的 Owner */
  ADMIN_422_001: 'ADMIN_422_001',
  /** 不能修改自己的角色 */
  ADMIN_422_002: 'ADMIN_422_002',

  // ==================== API 密钥模块 (API_KEY) ====================

  /** API 密钥不存在 */
  API_KEY_404_001: 'API_KEY_404_001',

  // ==================== 风控模块 (RISK) ====================

  /** 风控配置不存在 */
  RISK_404_001: 'RISK_404_001',

  // ==================== 报表模块 (REPORT) ====================

  /** 报表生成失败 */
  REPORT_500_001: 'REPORT_500_001',

  // ==================== 中间件模块 (MIDDLEWARE) ====================

  /** 中间件请求失败 */
  MIDDLEWARE_500_001: 'MIDDLEWARE_500_001',
  /** 中间件响应异常 */
  MIDDLEWARE_500_002: 'MIDDLEWARE_500_002',
  /** 中间件服务错误 */
  MIDDLEWARE_500_003: 'MIDDLEWARE_500_003',
  /** 中间件 API 调用超时 */
  MIDDLEWARE_504_001: 'MIDDLEWARE_504_001',

  // ==================== 通用错误 ====================

  /** 验证失败 */
  VALIDATION_400_001: 'VALIDATION_400_001',
  /** 请求参数错误 */
  VALIDATION_400_002: 'VALIDATION_400_002',
  /** 资源不存在 */
  NOT_FOUND_404_001: 'NOT_FOUND_404_001',
  /** 内部服务器错误 */
  INTERNAL_500_001: 'INTERNAL_500_001',
  /** 数据库操作失败 */
  INTERNAL_500_002: 'INTERNAL_500_002',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * 错误码对应的默认消息
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // 认证模块
  [ErrorCodes.AUTH_401_001]: '用户名或密码错误',
  [ErrorCodes.AUTH_401_002]: 'Token 无效或已过期',
  [ErrorCodes.AUTH_403_001]: '账号已被禁用',
  [ErrorCodes.AUTH_403_002]: '权限不足，无法执行此操作',

  // 租户模块
  [ErrorCodes.TENANT_403_001]: '租户已暂停或过期',
  [ErrorCodes.TENANT_404_001]: '租户不存在',

  // 实例模块
  [ErrorCodes.INSTANCE_404_001]: '实例不存在或离线',
  [ErrorCodes.INSTANCE_503_001]: '中间件服务不可用',

  // 用户模块
  [ErrorCodes.USER_404_001]: '用户不存在',
  [ErrorCodes.USER_422_001]: '无效的组别',
  [ErrorCodes.USER_422_002]: '无效的杠杆值',

  // 管理员模块
  [ErrorCodes.ADMIN_404_001]: '管理员不存在',
  [ErrorCodes.ADMIN_409_001]: '邮箱已存在',
  [ErrorCodes.ADMIN_422_001]: '无法删除唯一的 Owner',
  [ErrorCodes.ADMIN_422_002]: '不能修改自己的角色',

  // API 密钥模块
  [ErrorCodes.API_KEY_404_001]: 'API 密钥不存在',

  // 风控模块
  [ErrorCodes.RISK_404_001]: '风控配置不存在',

  // 报表模块
  [ErrorCodes.REPORT_500_001]: '报表生成失败',

  // 中间件模块
  [ErrorCodes.MIDDLEWARE_500_001]: '中间件请求失败',
  [ErrorCodes.MIDDLEWARE_500_002]: '中间件响应异常',
  [ErrorCodes.MIDDLEWARE_500_003]: '中间件服务错误',
  [ErrorCodes.MIDDLEWARE_504_001]: '中间件 API 调用超时',

  // 通用错误
  [ErrorCodes.VALIDATION_400_001]: '请求参数验证失败',
  [ErrorCodes.VALIDATION_400_002]: '请求参数错误',
  [ErrorCodes.NOT_FOUND_404_001]: '请求的资源不存在',
  [ErrorCodes.INTERNAL_500_001]: '服务器内部错误',
  [ErrorCodes.INTERNAL_500_002]: '数据库操作失败',
};
