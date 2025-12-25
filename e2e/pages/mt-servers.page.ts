import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * MT Server data for creating/editing servers
 */
export interface MtServerFormData {
  serverId?: string;
  displayName?: string;
  name?: string;
  platformType: 'MT5' | 'MT4';
  serverAddress: string;
  serverPort?: number;
  middlewareUrl: string;
  managerLogin: string;
  managerPassword: string;
  isDefault?: boolean;
  isActive?: boolean;
}

/**
 * MT Servers Page Object
 * Handles MT server management interactions using Naive UI components
 */
export class MtServersPage extends BasePage {
  // Page elements - Naive UI selectors
  private readonly serverTable: Locator;
  private readonly addServerButton: Locator;
  private readonly searchInput: Locator;
  private readonly platformFilter: Locator;
  private readonly statusFilter: Locator;
  private readonly pageTitle: Locator;

  // Modal elements - Naive UI
  private readonly serverModal: Locator;
  private readonly serverIdInput: Locator;
  private readonly displayNameInput: Locator;
  private readonly platformSelect: Locator;
  private readonly serverAddressInput: Locator;
  private readonly middlewareUrlInput: Locator;
  private readonly managerLoginInput: Locator;
  private readonly managerPasswordInput: Locator;
  private readonly isDefaultSwitch: Locator;
  private readonly saveButton: Locator;
  private readonly cancelButton: Locator;

  // Connection test result modal
  private readonly testResultModal: Locator;

  // Status indicators
  private readonly connectionStatus: Locator;

  // Confirmation dialog - Naive UI
  private readonly confirmDialog: Locator;
  private readonly confirmButton: Locator;

  constructor(page: Page) {
    super(page);
    // Naive UI Data Table
    this.serverTable = page.locator('.n-data-table');
    this.pageTitle = page.locator('.page-title, h1:has-text("MT 服务器管理")');
    this.addServerButton = page.locator('.n-button:has-text("添加服务器")');
    this.searchInput = page.locator('.n-input input[placeholder*="搜索"]');
    this.platformFilter = page.locator('.n-select');
    this.statusFilter = page.locator('.n-select');

    // Naive UI Modal
    this.serverModal = page.locator('.n-modal');
    this.serverIdInput = page.locator('.n-form-item:has-text("服务器ID") .n-input input');
    this.displayNameInput = page.locator('.n-form-item:has-text("显示名称") .n-input input');
    this.platformSelect = page.locator('.n-form-item:has-text("平台类型") .n-select');
    this.serverAddressInput = page.locator('.n-form-item:has-text("服务器地址") .n-input input');
    this.middlewareUrlInput = page.locator('.n-form-item:has-text("中间件地址") .n-input input');
    this.managerLoginInput = page.locator('.n-form-item:has-text("管理员账号") .n-input-number input');
    this.managerPasswordInput = page.locator('.n-form-item:has-text("管理员密码") .n-input input');
    this.isDefaultSwitch = page.locator('.n-form-item:has-text("设为默认") .n-switch');
    this.saveButton = page.locator('.n-modal .n-button:has-text("确定")');
    this.cancelButton = page.locator('.n-modal .n-button:has-text("取消")');

    // Connection test result modal
    this.testResultModal = page.locator('.n-modal:has-text("连接测试结果")');

    this.connectionStatus = page.locator('.n-descriptions-item:has-text("状态")');

    // Naive UI Dialog
    this.confirmDialog = page.locator('.n-dialog, .n-modal');
    this.confirmButton = page.locator('.n-button:has-text("确定"), .n-button:has-text("确认")');
  }

  /**
   * Navigate to MT servers page
   */
  async goto(): Promise<void> {
    await this.page.goto('/mt-servers');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for MT servers page to load
   * Waits for Naive UI data table to be visible
   */
  async waitForLoad(): Promise<void> {
    // Wait for either the data table or the page title
    await Promise.race([
      expect(this.serverTable).toBeVisible({ timeout: 10000 }),
      expect(this.pageTitle).toBeVisible({ timeout: 10000 }),
    ]);
    await this.waitForLoadingComplete();
  }

  /**
   * Wait for Naive UI loading to complete
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for Naive UI loading states to disappear
    const loaders = this.page.locator('.n-spin, .n-data-table--loading, .n-skeleton');
    const count = await loaders.count();
    if (count > 0) {
      await expect(loaders.first()).toBeHidden({ timeout: 30000 });
    }
  }

  /**
   * Search for servers
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForLoadingComplete();
  }

  /**
   * Filter servers by platform type (using Naive UI Select)
   */
  async filterByPlatform(platform: 'MT5' | 'MT4' | 'all'): Promise<void> {
    await this.platformFilter.click();
    await this.page.locator(`.n-base-select-option:has-text("${platform}")`).click();
    await this.waitForLoadingComplete();
  }

  /**
   * Filter servers by status (using Naive UI Select)
   */
  async filterByStatus(status: 'connected' | 'disconnected' | 'error' | 'all'): Promise<void> {
    await this.statusFilter.click();
    await this.page.locator(`.n-base-select-option:has-text("${status}")`).click();
    await this.waitForLoadingComplete();
  }

  /**
   * Open add server modal
   */
  async openAddServerModal(): Promise<void> {
    await this.addServerButton.click();
    await expect(this.serverModal).toBeVisible();
  }

  /**
   * Fill server form (Naive UI form)
   */
  async fillServerForm(data: MtServerFormData): Promise<void> {
    if (data.serverId) {
      await this.serverIdInput.fill(data.serverId);
    }
    if (data.displayName || data.name) {
      await this.displayNameInput.fill(data.displayName || data.name || '');
    }

    // Platform type - click to open select and choose option
    await this.platformSelect.click();
    await this.page.locator(`.n-base-select-option:has-text("${data.platformType}")`).click();

    await this.middlewareUrlInput.fill(data.middlewareUrl);
    await this.serverAddressInput.fill(data.serverAddress);
    await this.managerLoginInput.fill(data.managerLogin);
    await this.managerPasswordInput.fill(data.managerPassword);

    if (data.isDefault) {
      await this.isDefaultSwitch.click();
    }
  }

  /**
   * Test connection and get result from modal
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    await expect(this.testResultModal).toBeVisible({ timeout: 10000 });

    const successTag = this.testResultModal.locator('.n-tag:has-text("连接成功")');
    const failTag = this.testResultModal.locator('.n-tag:has-text("连接失败")');

    const isSuccess = await successTag.isVisible();
    const isFail = await failTag.isVisible();

    let message = '';
    const errorText = this.testResultModal.locator('.n-text--error');
    if (await errorText.isVisible()) {
      message = (await errorText.textContent()) || '';
    }

    return { success: isSuccess && !isFail, message };
  }

  /**
   * Create a new MT server
   */
  async createServer(data: MtServerFormData): Promise<void> {
    await this.openAddServerModal();
    await this.fillServerForm(data);
    await this.saveButton.click();
    await this.waitForNaiveMessage();
    await expect(this.serverModal).toBeHidden();
  }

  /**
   * Get server row by name/display name (Naive UI Data Table)
   */
  private getServerRow(name: string): Locator {
    return this.serverTable.locator(`.n-data-table-tr:has-text("${name}")`);
  }

  /**
   * Edit a server via dropdown menu
   */
  async editServer(name: string, data: Partial<MtServerFormData>): Promise<void> {
    const row = this.getServerRow(name);
    // Click the dropdown trigger button (last button in the row)
    const dropdownTrigger = row.locator('.n-button').last();
    await dropdownTrigger.click();

    // Click "编辑" option in dropdown
    await this.page.locator('.n-dropdown-option:has-text("编辑")').click();
    await expect(this.serverModal).toBeVisible();

    if (data.displayName || data.name) {
      await this.displayNameInput.fill(data.displayName || data.name || '');
    }
    if (data.serverAddress) await this.serverAddressInput.fill(data.serverAddress);
    if (data.middlewareUrl) await this.middlewareUrlInput.fill(data.middlewareUrl);
    if (data.managerLogin) await this.managerLoginInput.fill(data.managerLogin);
    if (data.managerPassword) await this.managerPasswordInput.fill(data.managerPassword);

    await this.saveButton.click();
    await this.waitForNaiveMessage();
    await expect(this.serverModal).toBeHidden();
  }

  /**
   * Delete a server via dropdown menu
   */
  async deleteServer(name: string): Promise<void> {
    const row = this.getServerRow(name);
    const dropdownTrigger = row.locator('.n-button').last();
    await dropdownTrigger.click();

    await this.page.locator('.n-dropdown-option:has-text("删除")').click();
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmButton.click();
    await this.waitForNaiveMessage();
  }

  /**
   * Set server as default via dropdown menu
   */
  async setAsDefault(name: string): Promise<void> {
    const row = this.getServerRow(name);
    const dropdownTrigger = row.locator('.n-button').last();
    await dropdownTrigger.click();

    await this.page.locator('.n-dropdown-option:has-text("设为默认")').click();
    await this.waitForNaiveMessage();
  }

  /**
   * Toggle server active status via dropdown menu
   */
  async toggleServerStatus(name: string): Promise<void> {
    const row = this.getServerRow(name);
    const dropdownTrigger = row.locator('.n-button').last();
    await dropdownTrigger.click();

    // Try to find either 启用 or 禁用 option
    const enableOption = this.page.locator('.n-dropdown-option:has-text("启用")');
    const disableOption = this.page.locator('.n-dropdown-option:has-text("禁用")');

    if (await enableOption.isVisible()) {
      await enableOption.click();
    } else if (await disableOption.isVisible()) {
      await disableOption.click();
    }

    // Confirm if dialog appears
    if (await this.confirmDialog.isVisible()) {
      await this.confirmButton.click();
    }

    await this.waitForNaiveMessage();
  }

  /**
   * Get server status from table row
   */
  async getServerStatus(name: string): Promise<'enabled' | 'disabled' | 'error'> {
    const row = this.getServerRow(name);
    const enabledTag = row.locator('.n-tag:has-text("启用")');
    const disabledTag = row.locator('.n-tag:has-text("禁用")');

    if (await enabledTag.isVisible()) return 'enabled';
    if (await disabledTag.isVisible()) return 'disabled';
    return 'error';
  }

  /**
   * Get all server names from the Naive UI table
   */
  async getServerNames(): Promise<string[]> {
    const rows = await this.serverTable.locator('.n-data-table-tr').all();
    const names: string[] = [];
    for (const row of rows) {
      // Get display name from first column
      const name = await row.locator('.n-data-table-td').first().textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  /**
   * Get server count from table
   */
  async getServerCount(): Promise<number> {
    const rows = await this.serverTable.locator('.n-data-table-tr').all();
    return rows.length;
  }

  /**
   * Check if server exists in table
   */
  async serverExists(name: string): Promise<boolean> {
    const row = this.getServerRow(name);
    return row.isVisible();
  }

  /**
   * Wait for Naive UI message notification
   */
  async waitForNaiveMessage(message?: string): Promise<void> {
    const msgContainer = this.page.locator('.n-message-container, .n-message-wrapper');
    const msg = msgContainer.locator('.n-message');
    await expect(msg.first()).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(msg.first()).toContainText(message);
    }
  }

  /**
   * Expect server to be visible in table
   */
  async expectServerVisible(name: string): Promise<void> {
    await expect(this.getServerRow(name)).toBeVisible();
  }

  /**
   * Expect server to have specific status
   */
  async expectServerStatus(name: string, status: 'enabled' | 'disabled' | 'error'): Promise<void> {
    const actualStatus = await this.getServerStatus(name);
    expect(actualStatus).toBe(status);
  }
}
