import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * User data for creating/editing users
 */
export interface UserFormData {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  password?: string;
}

/**
 * Users Page Object
 * Handles user management interactions
 */
export class UsersPage extends BasePage {
  // Page elements
  private readonly userTable: Locator;
  private readonly addUserButton: Locator;
  private readonly searchInput: Locator;
  private readonly roleFilter: Locator;
  private readonly statusFilter: Locator;

  // Modal elements
  private readonly userModal: Locator;
  private readonly emailInput: Locator;
  private readonly nameInput: Locator;
  private readonly roleSelect: Locator;
  private readonly passwordInput: Locator;
  private readonly confirmPasswordInput: Locator;
  private readonly saveButton: Locator;
  private readonly cancelButton: Locator;

  // Confirmation dialog
  private readonly confirmDialog: Locator;
  private readonly confirmButton: Locator;
  private readonly cancelConfirmButton: Locator;

  // Pagination
  private readonly pagination: Locator;
  private readonly nextPageButton: Locator;
  private readonly prevPageButton: Locator;

  constructor(page: Page) {
    super(page);
    this.userTable = page.locator('table, [data-testid="users-table"]');
    this.addUserButton = page.locator('button:has-text("Add User"), button:has-text("Create User"), [data-testid="add-user"]');
    this.searchInput = page.locator('input[placeholder*="Search"], input[name="search"], [data-testid="search-users"]');
    this.roleFilter = page.locator('select[name="role"], [data-testid="role-filter"]');
    this.statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]');

    this.userModal = page.locator('.modal, [role="dialog"]');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.nameInput = page.locator('input[name="name"], input[placeholder*="Name"]');
    this.roleSelect = page.locator('select[name="role"], [data-testid="role-select"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]');
    this.cancelButton = page.locator('button:has-text("Cancel"), [data-testid="cancel"]');

    this.confirmDialog = page.locator('[role="alertdialog"], .confirm-dialog');
    this.confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")');
    this.cancelConfirmButton = page.locator('button:has-text("Cancel"), button:has-text("No")');

    this.pagination = page.locator('.pagination, [data-testid="pagination"]');
    this.nextPageButton = page.locator('button:has-text("Next"), [aria-label="Next page"]');
    this.prevPageButton = page.locator('button:has-text("Previous"), [aria-label="Previous page"]');
  }

  /**
   * Navigate to users page
   */
  async goto(): Promise<void> {
    await this.page.goto('/users');
  }

  /**
   * Wait for users page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.userTable).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * Search for users
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForLoadingComplete();
  }

  /**
   * Filter users by role
   */
  async filterByRole(role: string): Promise<void> {
    await this.roleFilter.selectOption(role);
    await this.waitForLoadingComplete();
  }

  /**
   * Filter users by status
   */
  async filterByStatus(status: 'active' | 'inactive' | 'all'): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.waitForLoadingComplete();
  }

  /**
   * Open add user modal
   */
  async openAddUserModal(): Promise<void> {
    await this.addUserButton.click();
    await expect(this.userModal).toBeVisible();
  }

  /**
   * Fill user form
   */
  async fillUserForm(data: UserFormData): Promise<void> {
    await this.emailInput.fill(data.email);
    await this.nameInput.fill(data.name);
    await this.roleSelect.selectOption(data.role);
    if (data.password) {
      await this.passwordInput.fill(data.password);
      if (await this.confirmPasswordInput.isVisible()) {
        await this.confirmPasswordInput.fill(data.password);
      }
    }
  }

  /**
   * Create a new user
   */
  async createUser(data: UserFormData): Promise<void> {
    await this.openAddUserModal();
    await this.fillUserForm(data);
    await this.saveButton.click();
    await this.waitForToast();
    await expect(this.userModal).toBeHidden();
  }

  /**
   * Get user row by email
   */
  private getUserRow(email: string): Locator {
    return this.userTable.locator(`tr:has-text("${email}")`);
  }

  /**
   * Edit a user
   */
  async editUser(email: string, data: Partial<UserFormData>): Promise<void> {
    const row = this.getUserRow(email);
    await row.locator('button:has-text("Edit"), [data-testid="edit"]').click();
    await expect(this.userModal).toBeVisible();

    if (data.email) await this.emailInput.fill(data.email);
    if (data.name) await this.nameInput.fill(data.name);
    if (data.role) await this.roleSelect.selectOption(data.role);

    await this.saveButton.click();
    await this.waitForToast();
    await expect(this.userModal).toBeHidden();
  }

  /**
   * Delete a user
   */
  async deleteUser(email: string): Promise<void> {
    const row = this.getUserRow(email);
    await row.locator('button:has-text("Delete"), [data-testid="delete"]').click();
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmButton.click();
    await this.waitForToast();
  }

  /**
   * Toggle user status (activate/deactivate)
   */
  async toggleUserStatus(email: string): Promise<void> {
    const row = this.getUserRow(email);
    await row.locator('button:has-text("Activate"), button:has-text("Deactivate"), [data-testid="toggle-status"]').click();
    await this.waitForToast();
  }

  /**
   * Get all user emails from the table
   */
  async getUserEmails(): Promise<string[]> {
    const rows = await this.userTable.locator('tbody tr').all();
    const emails: string[] = [];
    for (const row of rows) {
      const email = await row.locator('td:nth-child(2), [data-field="email"]').textContent();
      if (email) emails.push(email.trim());
    }
    return emails;
  }

  /**
   * Get user count from table
   */
  async getUserCount(): Promise<number> {
    const rows = await this.userTable.locator('tbody tr').all();
    return rows.length;
  }

  /**
   * Check if user exists in table
   */
  async userExists(email: string): Promise<boolean> {
    const row = this.getUserRow(email);
    return row.isVisible();
  }

  /**
   * Navigate to next page
   */
  async nextPage(): Promise<void> {
    await this.nextPageButton.click();
    await this.waitForLoadingComplete();
  }

  /**
   * Navigate to previous page
   */
  async prevPage(): Promise<void> {
    await this.prevPageButton.click();
    await this.waitForLoadingComplete();
  }

  /**
   * Expect user to be visible in table
   */
  async expectUserVisible(email: string): Promise<void> {
    await expect(this.getUserRow(email)).toBeVisible();
  }

  /**
   * Expect user to not be visible in table
   */
  async expectUserNotVisible(email: string): Promise<void> {
    await expect(this.getUserRow(email)).toBeHidden();
  }
}
