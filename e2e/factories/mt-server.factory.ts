import { faker } from '@faker-js/faker';

/**
 * Platform type
 */
export type PlatformType = 'MT5' | 'MT4';

/**
 * MT Server test data interface
 */
export interface MtServerData {
  id?: string;
  tenantId: string;
  name: string;
  platformType: PlatformType;
  serverAddress: string;
  serverPort: number;
  middlewareUrl: string;
  managerLogin: string;
  managerPassword: string;
  isDefault: boolean;
  isActive: boolean;
  connectionStatus?: 'connected' | 'disconnected' | 'error';
  lastHealthCheck?: string;
  metadata?: {
    version?: string;
    build?: string;
    company?: string;
    latency?: number;
  };
  createdAt?: string;
}

/**
 * Factory for generating MT server test data
 */
export class MtServerFactory {
  /**
   * Create a single MT server with default or custom data
   */
  static create(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    const platformType = overrides.platformType || 'MT5';
    const name = overrides.name || `${platformType} ${faker.company.name()} Server`;

    return {
      id: overrides.id || faker.string.uuid(),
      tenantId,
      name,
      platformType,
      serverAddress: overrides.serverAddress || faker.internet.ip(),
      serverPort: overrides.serverPort || (platformType === 'MT5' ? 443 : 443),
      middlewareUrl: overrides.middlewareUrl || `http://localhost:${8080 + faker.number.int({ min: 1, max: 100 })}`,
      managerLogin: overrides.managerLogin || faker.string.numeric(6),
      managerPassword: overrides.managerPassword || faker.internet.password({ length: 12 }),
      isDefault: overrides.isDefault ?? false,
      isActive: overrides.isActive ?? true,
      connectionStatus: overrides.connectionStatus || 'connected',
      lastHealthCheck: overrides.lastHealthCheck || new Date().toISOString(),
      metadata: {
        version: platformType === 'MT5' ? '5.0.0' : '4.0.0',
        build: faker.string.numeric(4),
        company: faker.company.name(),
        latency: faker.number.int({ min: 10, max: 100 }),
        ...overrides.metadata,
      },
      createdAt: overrides.createdAt || new Date().toISOString(),
    };
  }

  /**
   * Create multiple MT servers for a tenant
   */
  static createMany(tenantId: string, count: number, overrides: Partial<MtServerData> = {}): MtServerData[] {
    return Array.from({ length: count }, (_, index) =>
      this.create(tenantId, {
        ...overrides,
        isDefault: index === 0 && !overrides.isDefault,
      })
    );
  }

  /**
   * Create an MT5 server
   */
  static createMT5(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      platformType: 'MT5',
      name: overrides.name || `MT5 ${faker.company.name()}`,
    });
  }

  /**
   * Create an MT4 server
   */
  static createMT4(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      platformType: 'MT4',
      name: overrides.name || `MT4 ${faker.company.name()}`,
    });
  }

  /**
   * Create a default server
   */
  static createDefault(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      isDefault: true,
      name: overrides.name || 'Primary Trading Server',
    });
  }

  /**
   * Create a disconnected server
   */
  static createDisconnected(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      connectionStatus: 'disconnected',
      lastHealthCheck: faker.date.past().toISOString(),
    });
  }

  /**
   * Create a server with connection error
   */
  static createWithError(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      connectionStatus: 'error',
      isActive: false,
    });
  }

  /**
   * Create a server with mock middleware URL for testing
   */
  static createWithMockMiddleware(tenantId: string, overrides: Partial<MtServerData> = {}): MtServerData {
    return this.create(tenantId, {
      ...overrides,
      middlewareUrl: process.env.E2E_MT5_MIDDLEWARE_URL || 'http://localhost:8888',
      serverAddress: '127.0.0.1',
      managerLogin: '1000',
      managerPassword: 'mock_password',
    });
  }
}
