/**
 * 响应格式验证工具
 * 用于验证 Platform Service API 响应符合契约规范
 */

import { Response } from 'supertest';

/**
 * 成功响应格式接口
 */
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp?: string;
    requestId?: string;
  };
}

/**
 * 错误响应格式接口
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp?: string;
    traceId?: string;
  };
}

/**
 * 分页响应数据接口
 */
interface PaginatedData<T = any> {
  items?: T[];
  tenants?: T[];
  instances?: T[];
  admins?: T[];
  invoices?: T[];
  subscriptions?: T[];
  users?: T[];
  events?: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

/**
 * 验证成功响应格式
 */
export function expectSuccessResponse(response: Response): void {
  expect(response.body).toHaveProperty('success', true);
  expect(response.body).toHaveProperty('data');
}

/**
 * 验证成功响应并返回数据
 */
export function getSuccessData<T = any>(response: Response): T {
  expectSuccessResponse(response);
  return response.body.data as T;
}

/**
 * 验证错误响应格式
 */
export function expectErrorResponse(
  response: Response,
  expectedCode?: string,
  expectedStatus?: number,
): void {
  if (expectedStatus) {
    expect(response.status).toBe(expectedStatus);
  }

  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toHaveProperty('code');
  expect(response.body.error).toHaveProperty('message');

  if (expectedCode) {
    expect(response.body.error.code).toBe(expectedCode);
  }
}

/**
 * 验证认证错误 (401)
 */
export function expectAuthError(
  response: Response,
  expectedCode?: string,
): void {
  expect(response.status).toBe(401);
  expectErrorResponse(response, expectedCode);
}

/**
 * 验证权限错误 (403)
 */
export function expectForbiddenError(
  response: Response,
  expectedCode?: string,
): void {
  expect(response.status).toBe(403);
  expectErrorResponse(response, expectedCode);
}

/**
 * 验证资源不存在 (404)
 */
export function expectNotFoundError(
  response: Response,
  expectedCode?: string,
): void {
  expect(response.status).toBe(404);
  expectErrorResponse(response, expectedCode);
}

/**
 * 验证请求参数错误 (400)
 */
export function expectBadRequestError(
  response: Response,
  expectedCode?: string,
): void {
  expect(response.status).toBe(400);
  expectErrorResponse(response, expectedCode);
}

/**
 * 验证冲突错误 (409)
 */
export function expectConflictError(
  response: Response,
  expectedCode?: string,
): void {
  expect(response.status).toBe(409);
  expectErrorResponse(response, expectedCode);
}

/**
 * 验证分页响应格式
 */
export function expectPaginatedResponse(
  response: Response,
  itemsKey: string = 'items',
): void {
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('total');
  expect(data).toHaveProperty('page');
  expect(data).toHaveProperty('limit');

  // 检查数据数组 (可能是 items, data, tenants, instances 等)
  const hasItems =
    Array.isArray(data[itemsKey]) ||
    Array.isArray(data.items) ||
    Array.isArray(data.data) ||
    Array.isArray(data.tenants) ||
    Array.isArray(data.instances) ||
    Array.isArray(data.admins) ||
    Array.isArray(data.invoices) ||
    Array.isArray(data.subscriptions) ||
    Array.isArray(data.users) ||
    Array.isArray(data.events);

  expect(hasItems).toBe(true);

  // 验证分页数值类型
  expect(typeof data.total).toBe('number');
  expect(typeof data.page).toBe('number');
  expect(typeof data.limit).toBe('number');
}

/**
 * 验证分页数据并返回
 */
export function getPaginatedData<T = any>(
  response: Response,
  itemsKey: string = 'items',
): PaginatedData<T> {
  expectPaginatedResponse(response, itemsKey);
  return response.body.data as PaginatedData<T>;
}

/**
 * 验证登录响应格式
 */
export function expectLoginResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('accessToken');
  expect(data).toHaveProperty('refreshToken');
  expect(data).toHaveProperty('expiresIn');
  expect(data).toHaveProperty('user');

  expect(typeof data.accessToken).toBe('string');
  expect(typeof data.refreshToken).toBe('string');
  expect(typeof data.expiresIn).toBe('number');
}

/**
 * 验证 Platform Admin 登录响应
 */
export function expectPlatformAdminLoginResponse(response: Response): void {
  expectLoginResponse(response);

  const user = response.body.data.user;
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('name');
  expect(user).toHaveProperty('role');
  expect(user).toHaveProperty('userType');
  expect(user.userType).toBe('platform_admin');
}

/**
 * 验证 Tenant Admin 登录响应
 */
export function expectTenantAdminLoginResponse(response: Response): void {
  expectLoginResponse(response);

  const user = response.body.data.user;
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('name');
  expect(user).toHaveProperty('role');
  expect(user).toHaveProperty('userType');
  expect(user).toHaveProperty('tenantId');
  expect(user).toHaveProperty('tenantCode');
  expect(user.userType).toBe('tenant_admin');
}

/**
 * 验证个人信息响应格式
 */
export function expectProfileResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('email');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('role');
}

/**
 * 验证 Tenant 详情响应
 */
export function expectTenantResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('code');
  expect(data).toHaveProperty('email');
  expect(data).toHaveProperty('status');
  expect(data).toHaveProperty('plan');
}

/**
 * 验证 Tenant 创建响应
 */
export function expectTenantCreatedResponse(response: Response): void {
  expect(response.status).toBe(201);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('code');
}

/**
 * 验证 Instance 详情响应
 */
export function expectInstanceResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('tenantId');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('host');
  expect(data).toHaveProperty('port');
  expect(data).toHaveProperty('status');
}

/**
 * 验证 Instance 创建响应
 */
export function expectInstanceCreatedResponse(response: Response): void {
  expect(response.status).toBe(201);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('host');
}

/**
 * 验证 Instance 健康检查响应
 */
export function expectInstanceHealthResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('status');
  expect(data).toHaveProperty('lastCheckedAt');
}

/**
 * 验证 Invoice 详情响应
 */
export function expectInvoiceResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('tenantId');
  expect(data).toHaveProperty('invoiceNo');
  expect(data).toHaveProperty('amount');
  expect(data).toHaveProperty('status');
}

/**
 * 验证 Invoice 创建响应
 */
export function expectInvoiceCreatedResponse(response: Response): void {
  expect(response.status).toBe(201);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('invoiceNo');
  expect(data).toHaveProperty('amount');
}

/**
 * 验证 Platform Admin 详情响应
 */
export function expectPlatformAdminResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('email');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('role');
  expect(data).toHaveProperty('isActive');
  // 密码字段不应该返回
  expect(data).not.toHaveProperty('password');
}

/**
 * 验证 Tenant Admin 详情响应
 */
export function expectTenantAdminResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('tenantId');
  expect(data).toHaveProperty('email');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('role');
  expect(data).toHaveProperty('isActive');
  // 密码字段不应该返回
  expect(data).not.toHaveProperty('password');
}

/**
 * 验证统计响应格式
 */
export function expectStatsResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);
}

/**
 * 验证响应时间
 */
export function expectResponseTimeWithin(
  startTime: number,
  maxMs: number,
): void {
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(maxMs);
}

/**
 * 验证数组不为空
 */
export function expectNonEmptyArray(response: Response, path: string): void {
  const data = response.body.data;
  const array = path.split('.').reduce((obj, key) => obj?.[key], data);
  expect(Array.isArray(array)).toBe(true);
  expect(array.length).toBeGreaterThan(0);
}

/**
 * 验证字段类型
 */
export function expectFieldTypes(
  obj: any,
  schema: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>,
): void {
  for (const [field, type] of Object.entries(schema)) {
    if (type === 'array') {
      expect(Array.isArray(obj[field])).toBe(true);
    } else {
      expect(typeof obj[field]).toBe(type);
    }
  }
}

/**
 * 验证日期字段
 */
export function expectDateField(value: any): void {
  expect(value).toBeDefined();
  // 可以是 Date 对象或 ISO 字符串
  if (typeof value === 'string') {
    expect(new Date(value).toISOString()).toBe(value);
  }
}

/**
 * 验证枚举值
 */
export function expectEnumValue(value: any, validValues: string[]): void {
  expect(validValues).toContain(value);
}

/**
 * 验证 UUID 格式
 */
export function expectUUID(value: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(value).toMatch(uuidRegex);
}

/**
 * 验证 Email 格式
 */
export function expectEmail(value: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  expect(value).toMatch(emailRegex);
}
