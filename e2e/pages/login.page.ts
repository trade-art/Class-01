import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Login Page Object
 * Handles authentication-related interactions
 */
export class LoginPage extends BasePage {
  // Selectors
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly errorMessage: Locator;
  private readonly forgotPasswordLink: Locator;
  private readonly registerLink: Locator;
  private readonly rememberMeCheckbox: Locator;
  private readonly tenantCodeInput: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input[name="email"], input[type="email"], #email');
    this.passwordInput = page.locator('input[name="password"], input[type="password"], #password');
    this.loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    this.errorMessage = page.locator('.error-message, .alert-error, [role="alert"]');
    this.forgotPasswordLink = page.locator('a:has-text("Forgot"), a:has-text("Reset")');
    this.registerLink = page.locator('a:has-text("Register"), a:has-text("Sign up")');
    this.rememberMeCheckbox = page.locator('input[name="remember"], #remember');
    this.tenantCodeInput = page.locator('input[name="tenantCode"], #tenantCode');
  }

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /**
   * Wait for login page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, options?: { rememberMe?: boolean }): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    if (options?.rememberMe) {
      await this.rememberMeCheckbox.check();
    }

    await this.loginButton.click();
  }

  /**
   * Login with tenant code
   */
  async loginWithTenant(
    email: string,
    password: string,
    tenantCode: string
  ): Promise<void> {
    if (await this.tenantCodeInput.isVisible()) {
      await this.tenantCodeInput.fill(tenantCode);
    }
    await this.login(email, password);
  }

  /**
   * Check if login was successful (redirected to dashboard)
   */
  async expectLoginSuccess(): Promise<void> {
    await this.page.waitForURL(/\/(dashboard|home|overview)/);
    await expect(this.page).not.toHaveURL(/\/login/);
  }

  /**
   * Check if login failed
   */
  async expectLoginFailure(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Get the error message text
   */
  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }

  /**
   * Check if error message contains specific text
   */
  async expectErrorMessage(text: string): Promise<void> {
    await expect(this.errorMessage).toContainText(text);
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
    await this.page.waitForURL(/\/(forgot|reset)/);
  }

  /**
   * Click register link
   */
  async clickRegister(): Promise<void> {
    await this.registerLink.click();
    await this.page.waitForURL(/\/(register|signup)/);
  }

  /**
   * Check if login form is valid
   */
  async isFormValid(): Promise<boolean> {
    const emailValid = await this.emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    const passwordValid = await this.passwordInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    return emailValid && passwordValid;
  }

  /**
   * Clear all input fields
   */
  async clearForm(): Promise<void> {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }

  /**
   * Submit form and wait for response
   */
  async submitAndWait(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes('/auth/login') && response.status() !== 0
    );
    await this.loginButton.click();
    await responsePromise;
  }
}
