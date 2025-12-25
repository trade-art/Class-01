/**
 * MiddlewareAuthService Mock
 * 用于 E2E 测试的中间件认证服务 mock
 */

import { Injectable } from '@nestjs/common';

export interface MockMiddlewareSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  instanceId: string;
}

@Injectable()
export class MockMiddlewareAuthService {
  private readonly mockSession: MockMiddlewareSession = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    instanceId: 'instance-test-001',
  };

  getSession = jest.fn().mockResolvedValue(this.mockSession);

  getAccessToken = jest.fn().mockResolvedValue('mock-access-token');

  getAuthHeaders = jest.fn().mockResolvedValue({
    'Authorization': 'Bearer mock-access-token',
    'X-Instance-ID': 'instance-test-001',
  });

  login = jest.fn().mockResolvedValue(this.mockSession);

  refreshToken = jest.fn().mockResolvedValue(this.mockSession);

  clearSession = jest.fn();

  clearAllSessions = jest.fn();

  isSessionValid = jest.fn().mockReturnValue(true);

  getCacheSize = jest.fn().mockReturnValue(0);

  hasSession = jest.fn().mockReturnValue(false);

  onModuleDestroy = jest.fn();

  resetMocks() {
    this.getSession.mockClear();
    this.getAccessToken.mockClear();
    this.getAuthHeaders.mockClear();
    this.login.mockClear();
    this.refreshToken.mockClear();
    this.clearSession.mockClear();
    this.clearAllSessions.mockClear();
    this.isSessionValid.mockClear();
    this.getCacheSize.mockClear();
    this.hasSession.mockClear();
  }
}
