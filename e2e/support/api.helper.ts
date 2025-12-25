import { APIRequestContext, Page } from '@playwright/test';

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  status: number;
  statusText: string;
  ok: boolean;
  data: T;
  headers: Record<string, string>;
}

/**
 * API Error
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data: unknown
  ) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

/**
 * API Helper
 * Provides utilities for making API calls in E2E tests
 */
export class ApiHelper {
  private baseUrl: string;
  private request: APIRequestContext;
  private defaultHeaders: Record<string, string> = {};

  constructor(request: APIRequestContext, baseUrl?: string) {
    this.request = request;
    this.baseUrl = baseUrl || process.env.E2E_API_URL || 'http://localhost:3000/api';
  }

  /**
   * Set authorization token
   */
  setToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear authorization token
   */
  clearToken(): void {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Set default header
   */
  setHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
  }

  /**
   * Build full URL
   */
  private buildUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /**
   * Build headers
   */
  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...customHeaders,
    };
  }

  /**
   * Make GET request
   */
  async get<T = unknown>(
    path: string,
    options?: { headers?: Record<string, string>; params?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    let url = this.buildUrl(path);

    if (options?.params) {
      const searchParams = new URLSearchParams(options.params);
      url += `?${searchParams.toString()}`;
    }

    const response = await this.request.get(url, {
      headers: this.buildHeaders(options?.headers),
    });

    return this.processResponse<T>(response);
  }

  /**
   * Make POST request
   */
  async post<T = unknown>(
    path: string,
    data?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const response = await this.request.post(this.buildUrl(path), {
      headers: this.buildHeaders(options?.headers),
      data,
    });

    return this.processResponse<T>(response);
  }

  /**
   * Make PUT request
   */
  async put<T = unknown>(
    path: string,
    data?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const response = await this.request.put(this.buildUrl(path), {
      headers: this.buildHeaders(options?.headers),
      data,
    });

    return this.processResponse<T>(response);
  }

  /**
   * Make PATCH request
   */
  async patch<T = unknown>(
    path: string,
    data?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const response = await this.request.patch(this.buildUrl(path), {
      headers: this.buildHeaders(options?.headers),
      data,
    });

    return this.processResponse<T>(response);
  }

  /**
   * Make DELETE request
   */
  async delete<T = unknown>(
    path: string,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const response = await this.request.delete(this.buildUrl(path), {
      headers: this.buildHeaders(options?.headers),
    });

    return this.processResponse<T>(response);
  }

  /**
   * Process API response
   */
  private async processResponse<T>(response: {
    status: () => number;
    statusText: () => string;
    ok: () => boolean;
    json: () => Promise<T>;
    headers: () => Record<string, string>;
  }): Promise<ApiResponse<T>> {
    const status = response.status();
    const statusText = response.statusText();
    const ok = response.ok();
    const headers = response.headers();

    let data: T;
    try {
      data = await response.json();
    } catch {
      data = {} as T;
    }

    if (!ok) {
      throw new ApiError(status, statusText, data);
    }

    return { status, statusText, ok, data, headers };
  }

  // ============= Tenant API =============

  /**
   * Create a tenant via API
   */
  async createTenant(data: {
    name: string;
    code: string;
    plan?: string;
    ownerEmail: string;
    ownerPassword: string;
  }): Promise<ApiResponse<{ id: string; code: string }>> {
    return this.post('/tenants/register', data);
  }

  /**
   * Get tenant by ID
   */
  async getTenant(id: string): Promise<ApiResponse<{ id: string; name: string; code: string; plan: string }>> {
    return this.get(`/tenants/${id}`);
  }

  /**
   * Update tenant
   */
  async updateTenant(
    id: string,
    data: { name?: string; plan?: string }
  ): Promise<ApiResponse<{ id: string }>> {
    return this.patch(`/tenants/${id}`, data);
  }

  // ============= User API =============

  /**
   * Login via API
   */
  async login(
    email: string,
    password: string,
    tenantCode?: string
  ): Promise<ApiResponse<{ token: string; user: { id: string; email: string; role: string } }>> {
    return this.post('/auth/login', { email, password, tenantCode });
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<ApiResponse<{ id: string; email: string; role: string }>> {
    return this.get('/auth/me');
  }

  /**
   * Create a user
   */
  async createUser(data: {
    email: string;
    name: string;
    password: string;
    role: string;
  }): Promise<ApiResponse<{ id: string; email: string }>> {
    return this.post('/users', data);
  }

  /**
   * Get users
   */
  async getUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
  }): Promise<ApiResponse<{ users: Array<{ id: string; email: string; role: string }>; total: number }>> {
    return this.get('/users', {
      params: params as Record<string, string>,
    });
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<ApiResponse<void>> {
    return this.delete(`/users/${id}`);
  }

  // ============= MT Server API =============

  /**
   * Create MT server
   */
  async createMtServer(data: {
    name: string;
    platformType: 'MT5' | 'MT4';
    serverAddress: string;
    serverPort: number;
    middlewareUrl: string;
    managerLogin: string;
    managerPassword: string;
    isDefault?: boolean;
  }): Promise<ApiResponse<{ id: string; name: string }>> {
    return this.post('/mt-servers', data);
  }

  /**
   * Get MT servers
   */
  async getMtServers(): Promise<
    ApiResponse<Array<{ id: string; name: string; platformType: string; connectionStatus: string }>>
  > {
    return this.get('/mt-servers');
  }

  /**
   * Test MT server connection
   */
  async testMtServerConnection(id: string): Promise<ApiResponse<{ connected: boolean; latency?: number }>> {
    return this.post(`/mt-servers/${id}/test-connection`);
  }

  /**
   * Delete MT server
   */
  async deleteMtServer(id: string): Promise<ApiResponse<void>> {
    return this.delete(`/mt-servers/${id}`);
  }

  // ============= Trading API =============

  /**
   * Get trading users
   */
  async getTradingUsers(
    serverId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ApiResponse<{ users: Array<{ login: number; name: string; balance: number }>; total: number }>> {
    return this.get(`/mt-servers/${serverId}/users`, {
      params: params as Record<string, string>,
    });
  }

  /**
   * Get positions
   */
  async getPositions(
    serverId: string,
    params?: { login?: number; symbol?: string }
  ): Promise<ApiResponse<Array<{ ticket: number; symbol: string; type: string; profit: number }>>> {
    return this.get(`/mt-servers/${serverId}/positions`, {
      params: params as Record<string, string>,
    });
  }

  /**
   * Get orders
   */
  async getOrders(
    serverId: string,
    params?: { login?: number; symbol?: string }
  ): Promise<ApiResponse<Array<{ ticket: number; symbol: string; type: string }>>> {
    return this.get(`/mt-servers/${serverId}/orders`, {
      params: params as Record<string, string>,
    });
  }

  // ============= Health API =============

  /**
   * Check API health
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.get('/health');
  }
}

/**
 * Create API helper from page
 */
export function createApiHelper(page: Page, baseUrl?: string): ApiHelper {
  return new ApiHelper(page.request, baseUrl);
}

/**
 * Create API helper from request context
 */
export function createApiHelperFromContext(request: APIRequestContext, baseUrl?: string): ApiHelper {
  return new ApiHelper(request, baseUrl);
}
