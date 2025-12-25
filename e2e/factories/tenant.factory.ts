import { faker } from '@faker-js/faker';

/**
 * Tenant test data interface
 */
export interface TenantData {
  id?: string;
  code: string;
  name: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  settings: {
    locale: string;
    timezone: string;
    dateFormat: string;
    currency: string;
  };
  branding: {
    primaryColor: string;
    logoUrl?: string;
    companyName: string;
  };
  subscription: {
    plan: 'free' | 'basic' | 'professional' | 'enterprise';
    status: 'active' | 'suspended' | 'cancelled';
    expiresAt?: string;
  };
  deploymentMode: 'SHARED' | 'DEDICATED';
  status: 'active' | 'inactive' | 'pending';
  createdAt?: string;
}

/**
 * Factory for generating tenant test data
 */
export class TenantFactory {
  /**
   * Create a single tenant with default or custom data
   */
  static create(overrides: Partial<TenantData> = {}): TenantData {
    const code = overrides.code || faker.string.alphanumeric(8).toLowerCase();
    const companyName = overrides.branding?.companyName || faker.company.name();

    return {
      id: overrides.id || faker.string.uuid(),
      code,
      name: overrides.name || companyName,
      contactEmail: overrides.contactEmail || faker.internet.email(),
      contactPhone: overrides.contactPhone || faker.phone.number(),
      address: overrides.address || faker.location.streetAddress(),
      settings: {
        locale: 'en-US',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        currency: 'USD',
        ...overrides.settings,
      },
      branding: {
        primaryColor: faker.color.rgb(),
        logoUrl: faker.image.url(),
        companyName,
        ...overrides.branding,
      },
      subscription: {
        plan: 'professional',
        status: 'active',
        expiresAt: faker.date.future().toISOString(),
        ...overrides.subscription,
      },
      deploymentMode: overrides.deploymentMode || 'SHARED',
      status: overrides.status || 'active',
      createdAt: overrides.createdAt || new Date().toISOString(),
    };
  }

  /**
   * Create multiple tenants
   */
  static createMany(count: number, overrides: Partial<TenantData> = {}): TenantData[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  /**
   * Create a tenant with free plan
   */
  static createFree(overrides: Partial<TenantData> = {}): TenantData {
    return this.create({
      ...overrides,
      subscription: {
        plan: 'free',
        status: 'active',
        ...overrides.subscription,
      },
    });
  }

  /**
   * Create a tenant with enterprise plan
   */
  static createEnterprise(overrides: Partial<TenantData> = {}): TenantData {
    return this.create({
      ...overrides,
      subscription: {
        plan: 'enterprise',
        status: 'active',
        ...overrides.subscription,
      },
      deploymentMode: 'DEDICATED',
    });
  }

  /**
   * Create an inactive tenant
   */
  static createInactive(overrides: Partial<TenantData> = {}): TenantData {
    return this.create({
      ...overrides,
      status: 'inactive',
    });
  }

  /**
   * Create a suspended tenant
   */
  static createSuspended(overrides: Partial<TenantData> = {}): TenantData {
    return this.create({
      ...overrides,
      subscription: {
        plan: 'professional',
        status: 'suspended',
        ...overrides.subscription,
      },
    });
  }
}
