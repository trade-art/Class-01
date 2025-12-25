import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Dashboard Page Object
 * Handles dashboard interactions and statistics display
 */
export class DashboardPage extends BasePage {
  // Navigation
  private readonly sideNav: Locator;
  private readonly userMenu: Locator;
  private readonly logoutButton: Locator;

  // Statistics cards
  private readonly totalUsersCard: Locator;
  private readonly activePositionsCard: Locator;
  private readonly totalBalanceCard: Locator;
  private readonly mtServersCard: Locator;

  // Quick actions
  private readonly addUserButton: Locator;
  private readonly addServerButton: Locator;
  private readonly refreshButton: Locator;

  // Content areas
  private readonly recentActivityList: Locator;
  private readonly alertsSection: Locator;
  private readonly chartContainer: Locator;

  constructor(page: Page) {
    super(page);
    this.sideNav = page.locator('nav, .sidebar, [role="navigation"]');
    this.userMenu = page.locator('.user-menu, .avatar, [aria-label="User menu"]');
    this.logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), button:has-text("Sign out")');

    this.totalUsersCard = page.locator('[data-testid="total-users"], .stat-card:has-text("Users")');
    this.activePositionsCard = page.locator('[data-testid="active-positions"], .stat-card:has-text("Position")');
    this.totalBalanceCard = page.locator('[data-testid="total-balance"], .stat-card:has-text("Balance")');
    this.mtServersCard = page.locator('[data-testid="mt-servers"], .stat-card:has-text("Server")');

    this.addUserButton = page.locator('button:has-text("Add User"), [data-testid="add-user"]');
    this.addServerButton = page.locator('button:has-text("Add Server"), [data-testid="add-server"]');
    this.refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"]');

    this.recentActivityList = page.locator('.recent-activity, [data-testid="recent-activity"]');
    this.alertsSection = page.locator('.alerts, [data-testid="alerts"]');
    this.chartContainer = page.locator('.chart, [data-testid="chart"]');
  }

  /**
   * Navigate to dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  /**
   * Wait for dashboard to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForURL(/\/(dashboard|home|overview)/);
    await this.waitForLoadingComplete();
  }

  /**
   * Navigate to a section via sidebar
   */
  async navigateTo(section: 'users' | 'servers' | 'positions' | 'settings' | 'reports'): Promise<void> {
    const sectionLinks: Record<string, string> = {
      users: 'Users',
      servers: 'Servers',
      positions: 'Positions',
      settings: 'Settings',
      reports: 'Reports',
    };

    await this.sideNav.locator(`a:has-text("${sectionLinks[section]}")`).click();
  }

  /**
   * Open user menu
   */
  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
    await this.page.waitForSelector('.dropdown-menu, [role="menu"]');
  }

  /**
   * Logout from the application
   */
  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
    await this.page.waitForURL(/\/login/);
  }

  /**
   * Get total users count from dashboard
   */
  async getTotalUsers(): Promise<number> {
    const text = await this.totalUsersCard.locator('.value, .stat-value').textContent();
    return parseInt(text?.replace(/,/g, '') || '0', 10);
  }

  /**
   * Get active positions count from dashboard
   */
  async getActivePositions(): Promise<number> {
    const text = await this.activePositionsCard.locator('.value, .stat-value').textContent();
    return parseInt(text?.replace(/,/g, '') || '0', 10);
  }

  /**
   * Get total balance from dashboard
   */
  async getTotalBalance(): Promise<number> {
    const text = await this.totalBalanceCard.locator('.value, .stat-value').textContent();
    return parseFloat(text?.replace(/[$,]/g, '') || '0');
  }

  /**
   * Get MT servers count from dashboard
   */
  async getMtServersCount(): Promise<number> {
    const text = await this.mtServersCard.locator('.value, .stat-value').textContent();
    return parseInt(text?.replace(/,/g, '') || '0', 10);
  }

  /**
   * Refresh dashboard data
   */
  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForLoadingComplete();
  }

  /**
   * Click add user button
   */
  async clickAddUser(): Promise<void> {
    await this.addUserButton.click();
  }

  /**
   * Click add server button
   */
  async clickAddServer(): Promise<void> {
    await this.addServerButton.click();
  }

  /**
   * Check if alerts are displayed
   */
  async hasAlerts(): Promise<boolean> {
    return this.alertsSection.isVisible();
  }

  /**
   * Get alert messages
   */
  async getAlerts(): Promise<string[]> {
    const alerts = await this.alertsSection.locator('.alert-item, li').all();
    return Promise.all(alerts.map((alert) => alert.textContent().then((t) => t || '')));
  }

  /**
   * Get recent activity items
   */
  async getRecentActivity(): Promise<string[]> {
    const items = await this.recentActivityList.locator('.activity-item, li').all();
    return Promise.all(items.map((item) => item.textContent().then((t) => t || '')));
  }

  /**
   * Verify dashboard statistics are visible
   */
  async expectStatisticsVisible(): Promise<void> {
    await expect(this.totalUsersCard).toBeVisible();
    await expect(this.totalBalanceCard).toBeVisible();
  }

  /**
   * Verify sidebar navigation is accessible
   */
  async expectNavigationVisible(): Promise<void> {
    await expect(this.sideNav).toBeVisible();
    await expect(this.userMenu).toBeVisible();
  }
}
