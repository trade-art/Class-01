import { Page, Locator, expect } from '@playwright/test';

/**
 * Base Page Object class that all page objects extend
 * Provides common functionality for page interactions
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the page
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for the page to be loaded
   */
  abstract waitForLoad(): Promise<void>;

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /**
   * Get the current URL
   */
  getUrl(): string {
    return this.page.url();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({ path: `e2e/screenshots/${name}.png` });
  }

  /**
   * Wait for an element to be visible
   */
  async waitForVisible(selector: string, timeout = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await expect(element).toBeVisible({ timeout });
    return element;
  }

  /**
   * Wait for an element to be hidden
   */
  async waitForHidden(selector: string, timeout = 10000): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toBeHidden({ timeout });
  }

  /**
   * Fill an input field
   */
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.locator(selector).textContent()) || '';
  }

  /**
   * Check if an element exists
   */
  async exists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  /**
   * Wait for a toast/notification message
   */
  async waitForToast(message?: string): Promise<Locator> {
    const toast = this.page.locator('.toast, .notification, [role="alert"]');
    await expect(toast).toBeVisible();
    if (message) {
      await expect(toast).toContainText(message);
    }
    return toast;
  }

  /**
   * Close any visible modal
   */
  async closeModal(): Promise<void> {
    const closeButton = this.page.locator('.modal-close, [aria-label="Close"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete(): Promise<void> {
    const loader = this.page.locator('.loading, .spinner, [role="progressbar"]');
    if (await loader.isVisible()) {
      await expect(loader).toBeHidden({ timeout: 30000 });
    }
  }
}
