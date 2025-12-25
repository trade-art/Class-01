import { faker } from '@faker-js/faker';

/**
 * User role type
 */
export type UserRole = 'owner' | 'admin' | 'operator';

/**
 * User test data interface
 */
export interface UserData {
  id?: string;
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  preferences?: {
    theme: 'light' | 'dark';
    language: string;
    notifications: boolean;
  };
}

/**
 * Factory for generating user test data
 */
export class UserFactory {
  /**
   * Create a single user with default or custom data
   */
  static create(tenantId: string, overrides: Partial<UserData> = {}): UserData {
    const firstName = overrides.firstName || faker.person.firstName();
    const lastName = overrides.lastName || faker.person.lastName();

    return {
      id: overrides.id || faker.string.uuid(),
      tenantId,
      email: overrides.email || faker.internet.email({ firstName, lastName }),
      password: overrides.password || 'Test@123456',
      firstName,
      lastName,
      role: overrides.role || 'operator',
      isActive: overrides.isActive ?? true,
      lastLoginAt: overrides.lastLoginAt,
      createdAt: overrides.createdAt || new Date().toISOString(),
      preferences: {
        theme: 'light',
        language: 'en-US',
        notifications: true,
        ...overrides.preferences,
      },
    };
  }

  /**
   * Create multiple users for a tenant
   */
  static createMany(tenantId: string, count: number, overrides: Partial<UserData> = {}): UserData[] {
    return Array.from({ length: count }, () => this.create(tenantId, overrides));
  }

  /**
   * Create an owner user
   */
  static createOwner(tenantId: string, overrides: Partial<UserData> = {}): UserData {
    return this.create(tenantId, {
      ...overrides,
      role: 'owner',
      email: overrides.email || `owner-${faker.string.alphanumeric(6)}@example.com`,
    });
  }

  /**
   * Create an admin user
   */
  static createAdmin(tenantId: string, overrides: Partial<UserData> = {}): UserData {
    return this.create(tenantId, {
      ...overrides,
      role: 'admin',
    });
  }

  /**
   * Create an operator user
   */
  static createOperator(tenantId: string, overrides: Partial<UserData> = {}): UserData {
    return this.create(tenantId, {
      ...overrides,
      role: 'operator',
    });
  }

  /**
   * Create an inactive user
   */
  static createInactive(tenantId: string, overrides: Partial<UserData> = {}): UserData {
    return this.create(tenantId, {
      ...overrides,
      isActive: false,
    });
  }

  /**
   * Create a user with specific credentials for login tests
   */
  static createWithCredentials(
    tenantId: string,
    email: string,
    password: string,
    overrides: Partial<UserData> = {}
  ): UserData {
    return this.create(tenantId, {
      ...overrides,
      email,
      password,
    });
  }
}
