/**
 * MtServerService Mock
 * 用于 E2E 测试的 MT 服务器服务 mock
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class MockMtServerService {
  private readonly mockServerConfig = {
    serverId: 'mt-server-test-001',
    serverAddress: 'localhost:443',
    middlewareUrl: 'http://localhost:8083',
    managerLogin: 1,
    managerPassword: 'test-password',
  };

  getDefaultServerConfig = jest.fn().mockResolvedValue(this.mockServerConfig);

  getServerConfig = jest.fn().mockResolvedValue(this.mockServerConfig);

  getServers = jest.fn().mockResolvedValue([]);

  getActiveServers = jest.fn().mockResolvedValue([]);

  getServer = jest.fn().mockResolvedValue(null);

  getDefaultServer = jest.fn().mockResolvedValue(null);

  createServer = jest.fn().mockResolvedValue({
    id: 'mt-server-test-001',
    name: 'Test Server',
    platform: 'MT5',
  });

  updateServer = jest.fn().mockResolvedValue({
    id: 'mt-server-test-001',
    name: 'Updated Server',
  });

  deleteServer = jest.fn().mockResolvedValue({ id: 'mt-server-test-001' });

  resetMocks() {
    this.getDefaultServerConfig.mockClear();
    this.getServerConfig.mockClear();
    this.getServers.mockClear();
    this.getActiveServers.mockClear();
    this.getServer.mockClear();
    this.getDefaultServer.mockClear();
    this.createServer.mockClear();
    this.updateServer.mockClear();
    this.deleteServer.mockClear();
  }
}
