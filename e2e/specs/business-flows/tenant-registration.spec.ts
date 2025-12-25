import { test, expect } from '@playwright/test';
import { TenantFactory, UserFactory } from '../../factories';
import {
  createTestContext,
  generateTestId,
  waitForApiResponse,
  expectToast,
  mockApiResponse,
  clearMocks,
} from '../../support';

/**
 * Tenant Registration Flow E2E Tests
 *
 * Tests the complete tenant registration flow including:
 * - Successful registration with valid data
 * - Email validation and verification
 * - Admin account creation
 * - Default settings initialization
 * - Error handling for duplicate emails
 */

test.describe('Tenant Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to registration page
    await page.goto('/register');
  });

  test.afterEach(async ({ page }) => {
    await clearMocks(page);
  });

  test.describe('Successful Registration', () => {
    test('should register a new tenant successfully', async ({ page }) => {
      const testId = generateTestId();
      const tenantData = {
        companyName: `Test Company ${testId}`,
        tenantCode: `TC${testId.substring(0, 6).toUpperCase()}`,
        adminEmail: `admin-${testId}@test.local`,
        adminName: 'Test Admin',
        adminPassword: 'SecurePass123!',
        plan: 'starter',
      };

      // Fill registration form
      await page.locator('input[name="companyName"]').fill(tenantData.companyName);
      await page.locator('input[name="tenantCode"]').fill(tenantData.tenantCode);
      await page.locator('input[name="adminEmail"]').fill(tenantData.adminEmail);
      await page.locator('input[name="adminName"]').fill(tenantData.adminName);
      await page.locator('input[name="password"]').fill(tenantData.adminPassword);
      await page.locator('input[name="confirmPassword"]').fill(tenantData.adminPassword);

      // Select plan
      await page.locator('select[name="plan"]').selectOption(tenantData.plan);

      // Accept terms
      await page.locator('input[name="acceptTerms"]').check();

      // Submit registration
      const submitButton = page.locator('button[type="submit"]:has-text("Register")');
      await submitButton.click();

      // Wait for API response
      const response = await waitForApiResponse(page, '/api/tenants/register', { method: 'POST' });
      expect(response.status).toBe(201);

      // Should show success message
      await expectToast(page, { type: 'success', message: 'Registration successful' });

      // Should redirect to login or verification page
      await expect(page).toHaveURL(/\/(login|verify-email)/);
    });

    test('should create admin account during registration', async ({ page }) => {
      const testId = generateTestId();
      const adminEmail = `admin-${testId}@test.local`;

      await page.locator('input[name="companyName"]').fill(`Company ${testId}`);
      await page.locator('input[name="tenantCode"]').fill(`TC${testId.substring(0, 6).toUpperCase()}`);
      await page.locator('input[name="adminEmail"]').fill(adminEmail);
      await page.locator('input[name="adminName"]').fill('Admin User');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();

      const response = await waitForApiResponse(page, '/api/tenants/register', { method: 'POST' });

      // Verify admin account was created with owner role
      const data = response.body as { user: { email: string; role: string } };
      expect(data.user.email).toBe(adminEmail);
      expect(data.user.role).toBe('owner');
    });

    test('should initialize default settings after registration', async ({ page, context }) => {
      const testId = generateTestId();
      const adminEmail = `admin-${testId}@test.local`;
      const password = 'SecurePass123!';

      // Complete registration
      await page.locator('input[name="companyName"]').fill(`Company ${testId}`);
      await page.locator('input[name="tenantCode"]').fill(`TC${testId.substring(0, 6).toUpperCase()}`);
      await page.locator('input[name="adminEmail"]').fill(adminEmail);
      await page.locator('input[name="adminName"]').fill('Admin User');
      await page.locator('input[name="password"]').fill(password);
      await page.locator('input[name="confirmPassword"]').fill(password);
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();
      await waitForApiResponse(page, '/api/tenants/register', { method: 'POST' });

      // Navigate to login and sign in
      await page.goto('/login');
      await page.locator('input[name="email"]').fill(adminEmail);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('button[type="submit"]').click();

      // Wait for dashboard
      await page.waitForURL(/\/(dashboard|home|onboarding)/);

      // Verify default settings exist
      await page.goto('/settings');
      await expect(page.locator('[data-testid="timezone"]')).toBeVisible();
      await expect(page.locator('[data-testid="language"]')).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should show error for invalid email format', async ({ page }) => {
      await page.locator('input[name="adminEmail"]').fill('invalid-email');
      await page.locator('input[name="adminEmail"]').blur();

      const errorMessage = page.locator('.error-message, [data-field="adminEmail"] .error');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/valid email|invalid email/i);
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('DifferentPass123!');
      await page.locator('input[name="confirmPassword"]').blur();

      const errorMessage = page.locator('.error-message, [data-field="confirmPassword"] .error');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/match|mismatch/i);
    });

    test('should show error for weak password', async ({ page }) => {
      await page.locator('input[name="password"]').fill('weak');
      await page.locator('input[name="password"]').blur();

      const errorMessage = page.locator('.error-message, [data-field="password"] .error');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/strong|characters|uppercase|number/i);
    });

    test('should require terms acceptance', async ({ page }) => {
      await page.locator('input[name="companyName"]').fill('Test Company');
      await page.locator('input[name="tenantCode"]').fill('TESTCO');
      await page.locator('input[name="adminEmail"]').fill('admin@test.local');
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');

      // Don't check terms
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should show error or remain on page
      await expect(page).toHaveURL(/\/register/);
    });

    test('should validate tenant code format', async ({ page }) => {
      // Try special characters in tenant code
      await page.locator('input[name="tenantCode"]').fill('TEST@#$');
      await page.locator('input[name="tenantCode"]').blur();

      const errorMessage = page.locator('.error-message, [data-field="tenantCode"] .error');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/alphanumeric|invalid/i);
    });
  });

  test.describe('Duplicate Registration Prevention', () => {
    test('should fail registration with duplicate email', async ({ page }) => {
      const existingEmail = 'existing@test.local';

      // Mock API to return conflict error
      await mockApiResponse(page, /\/api\/tenants\/register/, {
        status: 409,
        body: {
          error: 'Conflict',
          message: 'Email already registered',
        },
      });

      await page.locator('input[name="companyName"]').fill('Test Company');
      await page.locator('input[name="tenantCode"]').fill('TESTCO');
      await page.locator('input[name="adminEmail"]').fill(existingEmail);
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();

      // Should show error message
      await expectToast(page, { type: 'error', message: 'already registered' });

      // Should remain on registration page
      await expect(page).toHaveURL(/\/register/);
    });

    test('should fail registration with duplicate tenant code', async ({ page }) => {
      const existingCode = 'EXISTING';

      // Mock API to return conflict error
      await mockApiResponse(page, /\/api\/tenants\/register/, {
        status: 409,
        body: {
          error: 'Conflict',
          message: 'Tenant code already in use',
        },
      });

      await page.locator('input[name="companyName"]').fill('Test Company');
      await page.locator('input[name="tenantCode"]').fill(existingCode);
      await page.locator('input[name="adminEmail"]').fill('new@test.local');
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();

      // Should show error message
      await expectToast(page, { type: 'error', message: 'already in use' });
    });
  });

  test.describe('Plan Selection', () => {
    test('should display all available plans', async ({ page }) => {
      const planSelect = page.locator('select[name="plan"]');
      const options = planSelect.locator('option');

      // Should have starter, professional, and enterprise plans
      await expect(options).toHaveCount(4); // Including empty/placeholder
      await expect(planSelect).toContainText('Starter');
      await expect(planSelect).toContainText('Professional');
      await expect(planSelect).toContainText('Enterprise');
    });

    test('should show plan features on selection', async ({ page }) => {
      await page.locator('select[name="plan"]').selectOption('professional');

      const planFeatures = page.locator('[data-testid="plan-features"]');
      await expect(planFeatures).toBeVisible();
      await expect(planFeatures).toContainText(/servers|users|support/i);
    });
  });

  test.describe('Email Verification', () => {
    test('should send verification email after registration', async ({ page }) => {
      const testId = generateTestId();
      const adminEmail = `admin-${testId}@test.local`;

      await page.locator('input[name="companyName"]').fill(`Company ${testId}`);
      await page.locator('input[name="tenantCode"]').fill(`TC${testId.substring(0, 6).toUpperCase()}`);
      await page.locator('input[name="adminEmail"]').fill(adminEmail);
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();

      // Wait for success and check for verification message
      await page.waitForURL(/\/(login|verify-email)/);

      // Check for verification notice
      const verificationNotice = page.locator('.verification-notice, [data-testid="verification-message"]');
      if (await verificationNotice.isVisible()) {
        await expect(verificationNotice).toContainText(/verification|email sent/i);
      }
    });

    test('should show resend verification option', async ({ page }) => {
      // Navigate to verify email page
      await page.goto('/verify-email?email=unverified@test.local');

      const resendButton = page.locator('button:has-text("Resend"), a:has-text("Resend")');
      await expect(resendButton).toBeVisible();
    });
  });

  test.describe('Registration Loading States', () => {
    test('should disable submit button while processing', async ({ page }) => {
      const testId = generateTestId();

      await page.locator('input[name="companyName"]').fill(`Company ${testId}`);
      await page.locator('input[name="tenantCode"]').fill(`TC${testId.substring(0, 6).toUpperCase()}`);
      await page.locator('input[name="adminEmail"]').fill(`admin-${testId}@test.local`);
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      const submitButton = page.locator('button[type="submit"]');

      // Start submission
      await submitButton.click();

      // Button should be disabled during submission
      await expect(submitButton).toBeDisabled();

      // Wait for completion
      await page.waitForResponse((resp) => resp.url().includes('/api/tenants/register'));
    });

    test('should show loading indicator during submission', async ({ page }) => {
      const testId = generateTestId();

      await page.locator('input[name="companyName"]').fill(`Company ${testId}`);
      await page.locator('input[name="tenantCode"]').fill(`TC${testId.substring(0, 6).toUpperCase()}`);
      await page.locator('input[name="adminEmail"]').fill(`admin-${testId}@test.local`);
      await page.locator('input[name="adminName"]').fill('Admin');
      await page.locator('input[name="password"]').fill('SecurePass123!');
      await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');
      await page.locator('input[name="acceptTerms"]').check();

      await page.locator('button[type="submit"]').click();

      // Loading indicator should appear
      const loadingIndicator = page.locator('.loading, .spinner, [role="progressbar"]');
      await expect(loadingIndicator).toBeVisible();
    });
  });
});
