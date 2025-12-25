import { Client } from 'pg';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Database Helper
 * Provides utilities for database operations in E2E tests
 */
export class DatabaseHelper {
  private client: Client | null = null;
  private config: DatabaseConfig;

  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      host: config?.host || process.env.E2E_DB_HOST || 'localhost',
      port: config?.port || parseInt(process.env.E2E_DB_PORT || '5432', 10),
      user: config?.user || process.env.E2E_DB_USER || 'postgres',
      password: config?.password || process.env.E2E_DB_PASSWORD || 'password',
      database: config?.database || process.env.E2E_DB_NAME || 'mt5_platform_test',
    };
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    this.client = new Client(this.config);
    await this.client.connect();
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  /**
   * Execute a query
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.client) {
      throw new Error('Database not connected');
    }
    const result = await this.client.query(sql, params);
    return result.rows as T[];
  }

  /**
   * Execute a query and return first row
   */
  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  /**
   * Clean all test data (use with caution!)
   */
  async cleanTestData(): Promise<void> {
    // Delete in reverse order of foreign key dependencies
    const tables = [
      'trading_positions',
      'trading_orders',
      'trading_users',
      'mt_servers',
      'user_sessions',
      'users',
      'tenants',
    ];

    for (const table of tables) {
      await this.query(`DELETE FROM ${table} WHERE id IS NOT NULL`);
    }
  }

  /**
   * Clean data for a specific tenant
   */
  async cleanTenantData(tenantId: string): Promise<void> {
    await this.query('DELETE FROM trading_positions WHERE tenant_id = $1', [tenantId]);
    await this.query('DELETE FROM trading_orders WHERE tenant_id = $1', [tenantId]);
    await this.query('DELETE FROM trading_users WHERE tenant_id = $1', [tenantId]);
    await this.query('DELETE FROM mt_servers WHERE tenant_id = $1', [tenantId]);
    await this.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await this.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  }

  /**
   * Create a test tenant
   */
  async createTenant(data: {
    id: string;
    name: string;
    code: string;
    plan?: string;
    status?: string;
  }): Promise<void> {
    await this.query(
      `INSERT INTO tenants (id, name, code, plan, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        data.id,
        data.name,
        data.code,
        data.plan || 'starter',
        data.status || 'active',
      ]
    );
  }

  /**
   * Create a test user
   */
  async createUser(data: {
    id: string;
    email: string;
    passwordHash: string;
    tenantId: string;
    role?: string;
    name?: string;
    status?: string;
  }): Promise<void> {
    await this.query(
      `INSERT INTO users (id, email, password_hash, tenant_id, role, name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        data.id,
        data.email,
        data.passwordHash,
        data.tenantId,
        data.role || 'operator',
        data.name || 'Test User',
        data.status || 'active',
      ]
    );
  }

  /**
   * Create a test MT server
   */
  async createMtServer(data: {
    id: string;
    tenantId: string;
    name: string;
    platformType: 'MT5' | 'MT4';
    serverAddress: string;
    serverPort: number;
    middlewareUrl: string;
    managerLogin: string;
    managerPassword: string;
    isDefault?: boolean;
    isActive?: boolean;
  }): Promise<void> {
    await this.query(
      `INSERT INTO mt_servers (id, tenant_id, name, platform_type, server_address, server_port,
       middleware_url, manager_login, manager_password, is_default, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        data.id,
        data.tenantId,
        data.name,
        data.platformType,
        data.serverAddress,
        data.serverPort,
        data.middlewareUrl,
        data.managerLogin,
        data.managerPassword,
        data.isDefault || false,
        data.isActive !== false,
      ]
    );
  }

  /**
   * Get tenant by code
   */
  async getTenantByCode(code: string): Promise<{ id: string; name: string; status: string } | null> {
    return this.queryOne(
      'SELECT id, name, status FROM tenants WHERE code = $1',
      [code]
    );
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<{ id: string; tenant_id: string; role: string } | null> {
    return this.queryOne(
      'SELECT id, tenant_id, role FROM users WHERE email = $1',
      [email]
    );
  }

  /**
   * Get MT servers by tenant
   */
  async getMtServersByTenant(tenantId: string): Promise<{ id: string; name: string; platform_type: string }[]> {
    return this.query(
      'SELECT id, name, platform_type FROM mt_servers WHERE tenant_id = $1',
      [tenantId]
    );
  }

  /**
   * Count records in a table
   */
  async count(table: string, where?: { column: string; value: unknown }): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const params: unknown[] = [];

    if (where) {
      sql += ` WHERE ${where.column} = $1`;
      params.push(where.value);
    }

    const result = await this.queryOne<{ count: string }>(sql, params);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Check if a record exists
   */
  async exists(table: string, where: { column: string; value: unknown }): Promise<boolean> {
    const count = await this.count(table, where);
    return count > 0;
  }

  /**
   * Truncate a table (for test cleanup)
   */
  async truncate(table: string): Promise<void> {
    await this.query(`TRUNCATE TABLE ${table} CASCADE`);
  }

  /**
   * Run raw SQL file
   */
  async runSqlFile(filepath: string): Promise<void> {
    const fs = await import('fs');
    const sql = fs.readFileSync(filepath, 'utf-8');
    await this.query(sql);
  }

  /**
   * Seed test data from fixtures
   */
  async seedTestData(): Promise<void> {
    // Create default test tenant
    await this.createTenant({
      id: 'test-tenant-001',
      name: 'Test Tenant',
      code: 'TEST001',
      plan: 'professional',
      status: 'active',
    });

    // Create default test user
    await this.createUser({
      id: 'test-user-001',
      email: 'admin@test.com',
      passwordHash: '$2b$10$dummyhashfortest', // Needs proper hash in real tests
      tenantId: 'test-tenant-001',
      role: 'owner',
      name: 'Test Admin',
    });
  }
}

/**
 * Create database helper instance
 */
export function createDatabaseHelper(config?: Partial<DatabaseConfig>): DatabaseHelper {
  return new DatabaseHelper(config);
}

/**
 * Shared database instance for tests
 */
let sharedDb: DatabaseHelper | null = null;

/**
 * Get or create shared database connection
 */
export async function getSharedDatabase(): Promise<DatabaseHelper> {
  if (!sharedDb) {
    sharedDb = new DatabaseHelper();
    await sharedDb.connect();
  }
  return sharedDb;
}

/**
 * Close shared database connection
 */
export async function closeSharedDatabase(): Promise<void> {
  if (sharedDb) {
    await sharedDb.disconnect();
    sharedDb = null;
  }
}
