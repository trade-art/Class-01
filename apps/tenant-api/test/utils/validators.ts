/**
 * 响应格式验证工具
 * 用于验证 API 响应符合契约规范
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
  positions?: T[];
  users?: T[];
  alerts?: T[];
  orders?: T[];
  admins?: T[];
  apiKeys?: T[];
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

  // 检查数据数组 (可能是 items, positions, users 等)
  const hasItems =
    Array.isArray(data[itemsKey]) ||
    Array.isArray(data.items) ||
    Array.isArray(data.positions) ||
    Array.isArray(data.users) ||
    Array.isArray(data.alerts) ||
    Array.isArray(data.orders) ||
    Array.isArray(data.admins) ||
    Array.isArray(data.apiKeys);

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

  expect(typeof data.accessToken).toBe('string');
  expect(typeof data.refreshToken).toBe('string');
  expect(typeof data.expiresIn).toBe('number');
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
 * 验证 Dashboard 统计响应格式
 */
export function expectDashboardStatsResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  // 验证必要的统计字段存在
  expect(data).toHaveProperty('totalUsers');
  expect(data).toHaveProperty('totalBalance');
}

/**
 * 验证持仓统计响应格式
 */
export function expectPositionStatsResponse(response: Response): void {
  expect(response.status).toBe(200);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('totalPositions');
  expect(data).toHaveProperty('buyCount');
  expect(data).toHaveProperty('sellCount');
  expect(data).toHaveProperty('totalVolume');
  expect(data).toHaveProperty('totalProfit');
}

/**
 * 验证报价数据格式
 */
export function expectQuoteData(quote: any): void {
  expect(quote).toHaveProperty('symbol');
  expect(quote).toHaveProperty('bid');
  expect(quote).toHaveProperty('ask');

  expect(typeof quote.symbol).toBe('string');
  expect(typeof quote.bid).toBe('number');
  expect(typeof quote.ask).toBe('number');
}

/**
 * 验证持仓数据格式
 */
export function expectPositionData(position: any): void {
  expect(position).toHaveProperty('ticket');
  expect(position).toHaveProperty('symbol');
  expect(position).toHaveProperty('type');
  expect(position).toHaveProperty('volume');
  expect(position).toHaveProperty('profit');

  expect(typeof position.ticket).toBe('number');
  expect(typeof position.symbol).toBe('string');
  expect(typeof position.volume).toBe('number');
}

/**
 * 验证 API Key 创建响应
 */
export function expectApiKeyCreatedResponse(response: Response): void {
  expect(response.status).toBe(201);
  expectSuccessResponse(response);

  const data = response.body.data;
  expect(data).toHaveProperty('id');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('apiKey'); // 完整密钥只在创建时返回
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
