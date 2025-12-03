/**
 * E2E 测试辅助工具
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MiddlewareProxyService } from '../src/middleware-proxy';
import { MockPrismaService } from './mocks/prisma.mock';
import { MockMiddlewareProxyService } from './mocks/middleware-proxy.mock';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { TEST_ADMIN, TEST_TENANT, TEST_TOKENS } from './fixtures/test-data';

/**
 * 创建测试应用实例
 */
export async function createTestingApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useClass(MockPrismaService)
    .overrideProvider(MiddlewareProxyService)
    .useClass(MockMiddlewareProxyService)
    .compile();

  const app = moduleFixture.createNestApplication();

  // 应用全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 应用全局过滤器和拦截器
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 设置全局前缀
  app.setGlobalPrefix('tenant');

  await app.init();

  return app;
}

/**
 * 获取测试用 JWT Token
 */
export function getAuthToken(
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' = 'ADMIN',
  options?: {
    tenantId?: string;
    adminId?: string;
    email?: string;
    expired?: boolean;
  },
): string {
  const jwtService = new JwtService({
    secret: process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing',
  });

  const payload = {
    sub: options?.adminId || TEST_ADMIN.id,
    email: options?.email || TEST_ADMIN.email,
    tenantId: options?.tenantId || TEST_TENANT.id,
    tenantCode: TEST_TENANT.code,
    role: role,
    type: 'tenant_admin',
  };

  const expiresIn = options?.expired ? '-1h' : '1h';

  return jwtService.sign(payload, { expiresIn });
}

/**
 * 获取预设的测试 Token
 */
export function getTestToken(type: keyof typeof TEST_TOKENS): string {
  return TEST_TOKENS[type];
}

/**
 * 创建模拟管理员数据
 */
export function createMockAdmin(overrides?: Partial<typeof TEST_ADMIN>) {
  return {
    ...TEST_ADMIN,
    ...overrides,
  };
}

/**
 * 创建模拟租户数据
 */
export function createMockTenant(overrides?: Partial<typeof TEST_TENANT>) {
  return {
    ...TEST_TENANT,
    ...overrides,
  };
}

/**
 * 生成随机 ID
 */
export function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 清理测试数据
 */
export async function cleanupTestData(app: INestApplication): Promise<void> {
  // 如果使用真实数据库，在这里清理测试数据
  // 对于 Mock 服务，通常不需要清理
}

/**
 * 创建授权请求头
 */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * 验证响应时间
 */
export function expectResponseTime(startTime: number, maxMs: number): void {
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(maxMs);
}
