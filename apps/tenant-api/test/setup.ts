/**
 * E2E 测试全局设置
 * 在所有测试执行前运行
 */

// 导出空对象使文件成为模块
export {};

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-e2e-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-e2e-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// 增加 Jest 超时时间
jest.setTimeout(30000);

// 全局 beforeAll - 测试开始前
beforeAll(async () => {
  // 可以在这里初始化测试数据库连接等
});

// 全局 afterAll - 测试结束后
afterAll(async () => {
  // 清理资源
});

// 自定义 Jest 匹配器
expect.extend({
  /**
   * 验证成功响应格式
   */
  toBeSuccessResponse(received) {
    const pass =
      received.body &&
      received.body.success === true &&
      received.body.data !== undefined;

    if (pass) {
      return {
        message: () => `expected response not to be a success response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected response to be a success response with { success: true, data: ... }, but got ${JSON.stringify(received.body)}`,
        pass: false,
      };
    }
  },

  /**
   * 验证错误响应格式
   */
  toBeErrorResponse(received, expectedCode?: string) {
    const body = received.body;
    const hasErrorFormat =
      body &&
      body.success === false &&
      body.error &&
      typeof body.error.code === 'string' &&
      typeof body.error.message === 'string';

    const codeMatches = expectedCode ? body?.error?.code === expectedCode : true;

    const pass = hasErrorFormat && codeMatches;

    if (pass) {
      return {
        message: () => `expected response not to be an error response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected response to be an error response${expectedCode ? ` with code "${expectedCode}"` : ''}, but got ${JSON.stringify(body)}`,
        pass: false,
      };
    }
  },

  /**
   * 验证分页响应格式
   */
  toBePaginatedResponse(received) {
    const data = received.body?.data;
    const pass =
      received.body?.success === true &&
      data &&
      Array.isArray(data.items || data.positions || data.users || data.alerts || data.orders) &&
      typeof data.total === 'number' &&
      typeof data.page === 'number' &&
      typeof data.limit === 'number';

    if (pass) {
      return {
        message: () => `expected response not to be a paginated response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected response to be a paginated response with { items, total, page, limit }, but got ${JSON.stringify(received.body)}`,
        pass: false,
      };
    }
  },
});

// TypeScript 类型声明
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeSuccessResponse(): R;
      toBeErrorResponse(expectedCode?: string): R;
      toBePaginatedResponse(): R;
    }
  }
}
