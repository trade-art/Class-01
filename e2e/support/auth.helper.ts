import { Page, BrowserContext } from '@playwright/test';
import { LoginPage } from '../pages';

/**
 * Authentication credentials
 */
export interface AuthCredentials {
  email: string;
  password: string;
  tenantCode?: string;
}

/**
 * Stored auth state
 */
export interface StoredAuthState {
  token: string;
  refreshToken?: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
  };
  tenantId?: string;
  instanceId?: string;
}

/**
 * Authentication Helper
 * Provides utilities for authentication in E2E tests
 */
export class AuthHelper {
  private page: Page | null;
  private context: BrowserContext;
  private loginPage: LoginPage | null;
  private storedAuthState: StoredAuthState | null = null;

  constructor(pageOrContext: Page | BrowserContext, context?: BrowserContext) {
    if (context) {
      // Called with (page, context)
      this.page = pageOrContext as Page;
      this.context = context;
      this.loginPage = new LoginPage(this.page);
    } else {
      // Called with just context (for API-only testing)
      this.context = pageOrContext as BrowserContext;
      this.page = null;
      this.loginPage = null;
    }
  }

  /**
   * Login with credentials via UI or API
   */
  async login(credentials: AuthCredentials): Promise<void> {
    if (this.loginPage && this.page) {
      // UI login
      await this.loginPage.goto();
      await this.loginPage.waitForLoad();

      if (credentials.tenantCode) {
        await this.loginPage.loginWithTenant(
          credentials.email,
          credentials.password,
          credentials.tenantCode
        );
      } else {
        await this.loginPage.login(credentials.email, credentials.password);
      }

      await this.loginPage.expectLoginSuccess();
    } else {
      // API login when no page available
      await this.loginViaApiOnly(credentials);
    }
  }

  /**
   * Login via API without page (for context-only usage)
   */
  async loginViaApiOnly(credentials: AuthCredentials): Promise<StoredAuthState> {
    const baseUrl = process.env.E2E_API_URL || 'http://localhost:3002';
    // Use /tenant prefix for tenant-api endpoints
    const apiPrefix = process.env.E2E_API_PREFIX || '/tenant';

    const page = await this.context.newPage();
    try {
      const response = await page.request.post(`${baseUrl}${apiPrefix}/auth/login`, {
        data: {
          email: credentials.email,
          password: credentials.password,
          tenantCode: credentials.tenantCode,
        },
      });

      if (!response.ok()) {
        throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
      }

      const data = await response.json();

      this.storedAuthState = {
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt || Date.now() + 3600000,
        user: data.user,
        tenantId: data.user?.tenantId || data.tenantId,
        instanceId: data.instanceId,
      };

      return this.storedAuthState;
    } finally {
      await page.close();
    }
  }

  /**
   * Get stored auth state
   */
  getAuthState(): StoredAuthState | null {
    return this.storedAuthState;
  }

  /**
   * Login via API (faster, bypasses UI)
   */
  async loginViaApi(credentials: AuthCredentials): Promise<StoredAuthState> {
    const baseUrl = process.env.E2E_API_URL || 'http://localhost:3000/api';

    const response = await this.page.request.post(`${baseUrl}/auth/login`, {
      data: {
        email: credentials.email,
        password: credentials.password,
        tenantCode: credentials.tenantCode,
      },
    });

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
    }

    const data = await response.json();

    // Store token in local storage
    await this.page.evaluate((authData) => {
      localStorage.setItem('authToken', authData.token);
      if (authData.refreshToken) {
        localStorage.setItem('refreshToken', authData.refreshToken);
      }
      localStorage.setItem('user', JSON.stringify(authData.user));
    }, data);

    // Set cookie if token is in cookie format
    if (data.token) {
      await this.context.addCookies([
        {
          name: 'token',
          value: data.token,
          domain: new URL(baseUrl).hostname,
          path: '/',
        },
      ]);
    }

    return {
      token: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt || Date.now() + 3600000,
      user: data.user,
    };
  }

  /**
   * Logout via UI
   */
  async logout(): Promise<void> {
    await this.page.goto('/logout');
    await this.page.waitForURL(/\/login/);
  }

  /**
   * Logout via clearing storage
   */
  async logoutViaStorage(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    });
    await this.context.clearCookies();
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.page.evaluate(() => localStorage.getItem('authToken'));
    return !!token;
  }

  /**
   * Get current auth token
   */
  async getToken(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('authToken'));
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<StoredAuthState['user'] | null> {
    const userJson = await this.page.evaluate(() => localStorage.getItem('user'));
    return userJson ? JSON.parse(userJson) : null;
  }

  /**
   * Set auth token directly
   */
  async setToken(token: string): Promise<void> {
    await this.page.evaluate((t) => {
      localStorage.setItem('authToken', t);
    }, token);

    const baseUrl = process.env.E2E_API_URL || 'http://localhost:3000';
    await this.context.addCookies([
      {
        name: 'token',
        value: token,
        domain: new URL(baseUrl).hostname,
        path: '/',
      },
    ]);
  }

  /**
   * Save auth state to file for reuse
   */
  async saveAuthState(path: string): Promise<void> {
    await this.context.storageState({ path });
  }

  /**
   * Load auth state from file
   */
  static async loadAuthState(context: BrowserContext, path: string): Promise<void> {
    // Context should be created with storageState option
    // This is a helper method for documentation purposes
    console.log(`Auth state loaded from: ${path}`);
  }

  /**
   * Wait for authentication to complete
   */
  async waitForAuth(timeout = 10000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        return !!localStorage.getItem('authToken');
      },
      { timeout }
    );
  }

  /**
   * Refresh auth token
   */
  async refreshToken(): Promise<string | null> {
    const baseUrl = process.env.E2E_API_URL || 'http://localhost:3000/api';
    const refreshToken = await this.page.evaluate(() => localStorage.getItem('refreshToken'));

    if (!refreshToken) {
      return null;
    }

    const response = await this.page.request.post(`${baseUrl}/auth/refresh`, {
      data: { refreshToken },
    });

    if (!response.ok()) {
      return null;
    }

    const data = await response.json();
    await this.setToken(data.token);
    return data.token;
  }

  /**
   * Create authenticated API headers
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
}

/**
 * Create auth helper instance
 */
export function createAuthHelper(page: Page, context: BrowserContext): AuthHelper {
  return new AuthHelper(page, context);
}
