/**
 * 错误码定义
 * 格式: MODULE_HTTP_SEQ
 * - MODULE: 模块名称 (AUTH, TENANT, INSTANCE, INVOICE, ADMIN)
 * - HTTP: HTTP 状态码
 * - SEQ: 序列号 (001-999)
 */

export const ErrorCodes = {
  // ==================== 认证模块 (AUTH) ====================

  /** 无效的凭证 */
  AUTH_401_001: 'AUTH_401_001',
  /** 用户名或密码错误 */
  AUTH_401_002: 'AUTH_401_002',
  /** Token 已过期 */
  AUTH_401_003: 'AUTH_401_003',
  /** Token 无效 */
  AUTH_401_004: 'AUTH_401_004',

  /** 账号已被禁用 */
  AUTH_403_001: 'AUTH_403_001',
  /** 平台管理员账号已被禁用 */
  AUTH_403_002: 'AUTH_403_002',
  /** 权限不足 */
  AUTH_403_003: 'AUTH_403_003',

  // ==================== 租户模块 (TENANT) ====================

  /** 租户不存在 */
  TENANT_404_001: 'TENANT_404_001',
  /** 租户管理员不存在 */
  TENANT_404_002: 'TENANT_404_002',

  /** 租户编码已存在 */
  TENANT_409_001: 'TENANT_409_001',
  /** 租户管理员邮箱已存在 */
  TENANT_409_002: 'TENANT_409_002',

  /** 租户状态无效 */
  TENANT_422_001: 'TENANT_422_001',
  /** 超出实例配额限制 */
  TENANT_422_002: 'TENANT_422_002',
  /** 无效的状态转换 */
  TENANT_422_003: 'TENANT_422_003',
  /** 超出管理员配额限制 */
  TENANT_422_004: 'TENANT_422_004',

  // ==================== 实例模块 (INSTANCE) ====================

  /** 实例不存在 */
  INSTANCE_404_001: 'INSTANCE_404_001',

  /** 实例名称已存在 */
  INSTANCE_409_001: 'INSTANCE_409_001',

  /** 实例状态无效 */
  INSTANCE_422_001: 'INSTANCE_422_001',
  /** 中间件连接失败 */
  INSTANCE_422_002: 'INSTANCE_422_002',
  /** 健康检查失败 */
  INSTANCE_422_003: 'INSTANCE_422_003',

  // ==================== 账单模块 (INVOICE) ====================

  /** 账单不存在 */
  INVOICE_404_001: 'INVOICE_404_001',

  /** 账单号已存在 */
  INVOICE_409_001: 'INVOICE_409_001',

  /** 账单状态无效 (如已支付账单不能取消) */
  INVOICE_422_001: 'INVOICE_422_001',
  /** 账单周期无效 */
  INVOICE_422_002: 'INVOICE_422_002',

  // ==================== 订阅模块 (SUBSCRIPTION) ====================

  /** 订阅计划不存在 */
  SUBSCRIPTION_404_001: 'SUBSCRIPTION_404_001',

  /** 降级检查失败 (当前使用量超出目标计划限制) */
  SUBSCRIPTION_422_001: 'SUBSCRIPTION_422_001',
  /** 订阅已过期 */
  SUBSCRIPTION_422_002: 'SUBSCRIPTION_422_002',

  // ==================== 平台管理员模块 (ADMIN) ====================

  /** 平台管理员不存在 */
  ADMIN_404_001: 'ADMIN_404_001',

  /** 平台管理员邮箱已存在 */
  ADMIN_409_001: 'ADMIN_409_001',

  /** 不能删除自己 */
  ADMIN_422_001: 'ADMIN_422_001',
  /** 不能禁用最后一个超级管理员 */
  ADMIN_422_002: 'ADMIN_422_002',

  // ==================== 交易数据模块 (TRADING) ====================

  /** 交易数据获取失败 */
  TRADING_500_001: 'TRADING_500_001',
  /** 中间件 API 调用超时 */
  TRADING_504_001: 'TRADING_504_001',

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
  [ErrorCodes.AUTH_401_001]: '无效的凭证',
  [ErrorCodes.AUTH_401_002]: '用户名或密码错误',
  [ErrorCodes.AUTH_401_003]: 'Token 已过期，请重新登录',
  [ErrorCodes.AUTH_401_004]: 'Token 无效',
  [ErrorCodes.AUTH_403_001]: '账号已被禁用',
  [ErrorCodes.AUTH_403_002]: '平台管理员账号已被禁用',
  [ErrorCodes.AUTH_403_003]: '权限不足，无法执行此操作',

  // 租户模块
  [ErrorCodes.TENANT_404_001]: '租户不存在',
  [ErrorCodes.TENANT_404_002]: '租户管理员不存在',
  [ErrorCodes.TENANT_409_001]: '租户编码已存在',
  [ErrorCodes.TENANT_409_002]: '该邮箱已被其他管理员使用',
  [ErrorCodes.TENANT_422_001]: '租户状态无效',
  [ErrorCodes.TENANT_422_002]: '已达到最大实例数限制',
  [ErrorCodes.TENANT_422_003]: '无效的状态转换',
  [ErrorCodes.TENANT_422_004]: '已达到最大管理员数限制',

  // 实例模块
  [ErrorCodes.INSTANCE_404_001]: '中间件实例不存在',
  [ErrorCodes.INSTANCE_409_001]: '实例名称已存在',
  [ErrorCodes.INSTANCE_422_001]: '实例状态无效',
  [ErrorCodes.INSTANCE_422_002]: '无法连接到中间件服务',
  [ErrorCodes.INSTANCE_422_003]: '健康检查失败',

  // 账单模块
  [ErrorCodes.INVOICE_404_001]: '账单不存在',
  [ErrorCodes.INVOICE_409_001]: '账单号已存在',
  [ErrorCodes.INVOICE_422_001]: '账单状态不允许此操作',
  [ErrorCodes.INVOICE_422_002]: '账单周期无效',

  // 订阅模块
  [ErrorCodes.SUBSCRIPTION_404_001]: '订阅计划不存在',
  [ErrorCodes.SUBSCRIPTION_422_001]: '当前使用量超出目标计划限制，无法降级',
  [ErrorCodes.SUBSCRIPTION_422_002]: '订阅已过期',

  // 平台管理员模块
  [ErrorCodes.ADMIN_404_001]: '平台管理员不存在',
  [ErrorCodes.ADMIN_409_001]: '该邮箱已被其他管理员使用',
  [ErrorCodes.ADMIN_422_001]: '不能删除自己的账号',
  [ErrorCodes.ADMIN_422_002]: '不能禁用最后一个超级管理员',

  // 交易数据模块
  [ErrorCodes.TRADING_500_001]: '交易数据获取失败',
  [ErrorCodes.TRADING_504_001]: '中间件 API 调用超时',

  // 通用错误
  [ErrorCodes.VALIDATION_400_001]: '请求参数验证失败',
  [ErrorCodes.VALIDATION_400_002]: '请求参数错误',
  [ErrorCodes.NOT_FOUND_404_001]: '请求的资源不存在',
  [ErrorCodes.INTERNAL_500_001]: '服务器内部错误',
  [ErrorCodes.INTERNAL_500_002]: '数据库操作失败',
};
