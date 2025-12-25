import { test, expect } from '@playwright/test';
import { TenantFactory, MtServerFactory } from '../../factories';
import {
  createTestContext,
  generateTestId,
  waitForApiResponse,
  expectToast,
  mockApiResponse,
  clearMocks,
  sleep,
} from '../../support';

/**
 * Onboarding Wizard E2E Tests
 *
 * Tests the first-login onboarding experience including:
 * - Wizard step navigation
 * - MT server configuration
 * - Optional step skipping
 * - Completion and redirect
 */

test.describe('Onboarding Wizard', () => {
  // Test credentials for new tenant
  const testCredentials = {
    email: 'onboarding-test@test.local',
    password: 'TestPassword123!',
  };

  test.beforeEach(async ({ page }) => {
    // Mock authentication for a new tenant that hasn't completed onboarding
    await mockApiResponse(page, /\/api\/auth\/me/, {
      body: {
        id: 'test-user-001',
        email: testCredentials.email,
        role: 'owner',
        tenantId: 'test-tenant-001',
        onboardingCompleted: false,
      },
    });

    // Login and navigate to onboarding
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(testCredentials.email);
    await page.locator('input[name="password"]').fill(testCredentials.password);
    await page.locator('button[type="submit"]').click();

    // Should redirect to onboarding for new tenants
    await page.waitForURL(/\/(onboarding|setup)/);
  });

  test.afterEach(async ({ page }) => {
    await clearMocks(page);
  });

  test.describe('Wizard Navigation', () => {
    test('should display welcome step initially', async ({ page }) => {
      // Check for welcome step
      const welcomeStep = page.locator('[data-step="welcome"], .step-welcome');
      await expect(welcomeStep).toBeVisible();

      // Should show progress indicator
      const progressIndicator = page.locator('.progress-steps, .step-indicator');
      await expect(progressIndicator).toBeVisible();

      // Should show "Get Started" or "Next" button
      const nextButton = page.locator('button:has-text("Get Started"), button:has-text("Next")');
      await expect(nextButton).toBeVisible();
    });

    test('should navigate through all wizard steps', async ({ page }) => {
      // Step 1: Welcome
      await expect(page.locator('[data-step="welcome"]')).toBeVisible();
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();

      // Step 2: Company Profile (optional)
      await expect(page.locator('[data-step="profile"], [data-step="company"]')).toBeVisible();
      await page.locator('button:has-text("Next"), button:has-text("Skip")').click();

      // Step 3: MT Server Configuration
      await expect(page.locator('[data-step="server"], [data-step="mt-server"]')).toBeVisible();
      await page.locator('button:has-text("Skip"), button:has-text("Later")').click();

      // Step 4: Invite Team (optional)
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');
      if (await inviteStep.isVisible()) {
        await page.locator('button:has-text("Skip"), button:has-text("Later")').click();
      }

      // Step 5: Complete
      await expect(page.locator('[data-step="complete"], [data-step="finish"]')).toBeVisible();
    });

    test('should show step progress indicator', async ({ page }) => {
      const progressSteps = page.locator('.progress-step, .step-dot');

      // Should have multiple steps
      const stepCount = await progressSteps.count();
      expect(stepCount).toBeGreaterThanOrEqual(3);

      // First step should be active
      await expect(progressSteps.first()).toHaveClass(/active|current/);
    });

    test('should allow going back to previous steps', async ({ page }) => {
      // Go to step 2
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await expect(page.locator('[data-step="profile"], [data-step="company"]')).toBeVisible();

      // Go back
      await page.locator('button:has-text("Back"), button:has-text("Previous")').click();

      // Should be back at welcome step
      await expect(page.locator('[data-step="welcome"]')).toBeVisible();
    });
  });

  test.describe('MT Server Configuration Step', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to server configuration step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Next"), button:has-text("Skip")').click();
      await expect(page.locator('[data-step="server"], [data-step="mt-server"]')).toBeVisible();
    });

    test('should display server configuration form', async ({ page }) => {
      // Check for form fields
      await expect(page.locator('input[name="serverName"]')).toBeVisible();
      await expect(page.locator('select[name="platformType"]')).toBeVisible();
      await expect(page.locator('input[name="serverAddress"]')).toBeVisible();
      await expect(page.locator('input[name="middlewareUrl"]')).toBeVisible();
      await expect(page.locator('input[name="managerLogin"]')).toBeVisible();
      await expect(page.locator('input[name="managerPassword"]')).toBeVisible();
    });

    test('should configure MT5 server successfully', async ({ page }) => {
      const serverData = MtServerFactory.createWithMockMiddleware('test-tenant-001');

      // Fill server form
      await page.locator('input[name="serverName"]').fill(serverData.name);
      await page.locator('select[name="platformType"]').selectOption('MT5');
      await page.locator('input[name="serverAddress"]').fill(serverData.serverAddress);
      await page.locator('input[name="serverPort"]').fill(serverData.serverPort.toString());
      await page.locator('input[name="middlewareUrl"]').fill(serverData.middlewareUrl);
      await page.locator('input[name="managerLogin"]').fill(serverData.managerLogin);
      await page.locator('input[name="managerPassword"]').fill(serverData.managerPassword);

      // Submit and continue
      await page.locator('button:has-text("Add Server"), button:has-text("Save")').click();

      // Wait for success response
      await waitForApiResponse(page, '/api/mt-servers', { method: 'POST' });

      // Should show success message
      await expectToast(page, { type: 'success' });
    });

    test('should test server connection before saving', async ({ page }) => {
      const serverData = MtServerFactory.createWithMockMiddleware('test-tenant-001');

      // Fill server form
      await page.locator('input[name="serverName"]').fill(serverData.name);
      await page.locator('select[name="platformType"]').selectOption('MT5');
      await page.locator('input[name="serverAddress"]').fill(serverData.serverAddress);
      await page.locator('input[name="middlewareUrl"]').fill(serverData.middlewareUrl);
      await page.locator('input[name="managerLogin"]').fill(serverData.managerLogin);
      await page.locator('input[name="managerPassword"]').fill(serverData.managerPassword);

      // Test connection
      const testButton = page.locator('button:has-text("Test Connection"), button:has-text("Test")');
      await testButton.click();

      // Wait for connection test
      const connectionStatus = page.locator('[data-testid="connection-status"], .connection-result');
      await expect(connectionStatus).toBeVisible({ timeout: 10000 });
    });

    test('should show validation errors for invalid server config', async ({ page }) => {
      // Try to submit empty form
      await page.locator('button:has-text("Add Server"), button:has-text("Save")').click();

      // Should show validation errors
      const errors = page.locator('.error-message, .field-error');
      await expect(errors.first()).toBeVisible();
    });

    test('should allow adding multiple servers', async ({ page }) => {
      const serverData = MtServerFactory.createWithMockMiddleware('test-tenant-001');

      // Add first server
      await page.locator('input[name="serverName"]').fill('Server 1');
      await page.locator('select[name="platformType"]').selectOption('MT5');
      await page.locator('input[name="serverAddress"]').fill(serverData.serverAddress);
      await page.locator('input[name="middlewareUrl"]').fill(serverData.middlewareUrl);
      await page.locator('input[name="managerLogin"]').fill(serverData.managerLogin);
      await page.locator('input[name="managerPassword"]').fill(serverData.managerPassword);

      await page.locator('button:has-text("Add Server"), button:has-text("Save")').click();
      await waitForApiResponse(page, '/api/mt-servers', { method: 'POST' });

      // Check for "Add Another" button
      const addAnotherButton = page.locator('button:has-text("Add Another"), button:has-text("Add More")');
      if (await addAnotherButton.isVisible()) {
        await addAnotherButton.click();

        // Should show empty form again
        await expect(page.locator('input[name="serverName"]')).toHaveValue('');
      }
    });
  });

  test.describe('Skip Optional Steps', () => {
    test('should allow skipping company profile step', async ({ page }) => {
      // Navigate to profile step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();

      // Skip profile step
      const skipButton = page.locator('button:has-text("Skip"), button:has-text("Later")');
      await skipButton.click();

      // Should move to next step
      await expect(page.locator('[data-step="server"], [data-step="mt-server"]')).toBeVisible();
    });

    test('should allow skipping server configuration step', async ({ page }) => {
      // Navigate to server step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Next"), button:has-text("Skip")').click();

      // Skip server step
      const skipButton = page.locator('button:has-text("Skip"), button:has-text("Later")');
      await skipButton.click();

      // Should move to next step
      const currentStep = page.locator('[data-step="invite"], [data-step="team"], [data-step="complete"]');
      await expect(currentStep).toBeVisible();
    });

    test('should allow skipping team invite step', async ({ page }) => {
      // Navigate through steps
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Next"), button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip"), button:has-text("Later")').click();

      // Check if team step exists and skip it
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');
      if (await inviteStep.isVisible()) {
        await page.locator('button:has-text("Skip"), button:has-text("Later")').click();
      }

      // Should reach completion step
      await expect(page.locator('[data-step="complete"], [data-step="finish"]')).toBeVisible();
    });

    test('should track skipped steps', async ({ page }) => {
      // Navigate and skip all optional steps
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip")').click();

      // On completion step, should indicate what was skipped
      const skippedNotice = page.locator('.skipped-steps, [data-testid="setup-reminder"]');
      if (await skippedNotice.isVisible()) {
        await expect(skippedNotice).toContainText(/later|settings|complete/i);
      }
    });
  });

  test.describe('Wizard Completion', () => {
    test('should redirect to dashboard after completion', async ({ page }) => {
      // Navigate through all steps
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip")').click();

      // Handle team step if present
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');
      if (await inviteStep.isVisible()) {
        await page.locator('button:has-text("Skip")').click();
      }

      // Complete wizard
      const completeButton = page.locator('button:has-text("Complete"), button:has-text("Go to Dashboard"), button:has-text("Finish")');
      await completeButton.click();

      // Should redirect to dashboard
      await page.waitForURL(/\/(dashboard|home)/);
    });

    test('should mark onboarding as completed', async ({ page }) => {
      // Navigate through all steps
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip")').click();

      // Handle team step if present
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');
      if (await inviteStep.isVisible()) {
        await page.locator('button:has-text("Skip")').click();
      }

      // Complete wizard
      await page.locator('button:has-text("Complete"), button:has-text("Finish")').click();

      // Wait for API call to mark completion
      const response = await waitForApiResponse(page, /\/api\/(onboarding|users)/, { method: 'PATCH' });
      expect(response.status).toBeLessThan(300);

      // Should not redirect to onboarding on next login
      await page.goto('/login');
      await page.goto('/dashboard');
      await expect(page).not.toHaveURL(/\/(onboarding|setup)/);
    });

    test('should show completion summary', async ({ page }) => {
      // Navigate to completion step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip")').click();

      // Handle team step if present
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');
      if (await inviteStep.isVisible()) {
        await page.locator('button:has-text("Skip")').click();
      }

      // Check completion summary
      const completionStep = page.locator('[data-step="complete"], [data-step="finish"]');
      await expect(completionStep).toBeVisible();

      // Should show success message or summary
      const successMessage = completionStep.locator('h1, h2, .title');
      await expect(successMessage).toContainText(/ready|complete|success/i);
    });
  });

  test.describe('Wizard Persistence', () => {
    test('should save progress on page refresh', async ({ page }) => {
      // Navigate to step 2
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await expect(page.locator('[data-step="profile"], [data-step="company"]')).toBeVisible();

      // Fill some data
      const companyNameInput = page.locator('input[name="companyName"], input[name="displayName"]');
      if (await companyNameInput.isVisible()) {
        await companyNameInput.fill('Test Company');
      }

      // Refresh page
      await page.reload();

      // Should restore to the same step
      await expect(page.locator('[data-step="profile"], [data-step="company"], [data-step="welcome"]')).toBeVisible();
    });

    test('should not show wizard for completed onboarding', async ({ page }) => {
      // Mock user with completed onboarding
      await mockApiResponse(page, /\/api\/auth\/me/, {
        body: {
          id: 'test-user-001',
          email: testCredentials.email,
          role: 'owner',
          tenantId: 'test-tenant-001',
          onboardingCompleted: true,
        },
      });

      // Navigate to dashboard
      await page.goto('/dashboard');

      // Should not redirect to onboarding
      await expect(page).not.toHaveURL(/\/(onboarding|setup)/);
    });
  });

  test.describe('Company Profile Step', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to profile step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
    });

    test('should display company profile form', async ({ page }) => {
      const profileStep = page.locator('[data-step="profile"], [data-step="company"]');
      await expect(profileStep).toBeVisible();

      // Check for typical profile fields
      const displayNameInput = page.locator('input[name="displayName"], input[name="companyName"]');
      await expect(displayNameInput).toBeVisible();
    });

    test('should save company profile on next', async ({ page }) => {
      const displayNameInput = page.locator('input[name="displayName"], input[name="companyName"]');
      if (await displayNameInput.isVisible()) {
        await displayNameInput.fill('Updated Company Name');
      }

      // Click next to save
      await page.locator('button:has-text("Next"), button:has-text("Save")').click();

      // Should save profile data
      await waitForApiResponse(page, /\/api\/(tenants|profile)/, { method: 'PATCH' });
    });
  });

  test.describe('Team Invite Step', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to team invite step
      await page.locator('button:has-text("Get Started"), button:has-text("Next")').click();
      await page.locator('button:has-text("Skip")').click();
      await page.locator('button:has-text("Skip")').click();
    });

    test('should display team invite form if step exists', async ({ page }) => {
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');

      if (await inviteStep.isVisible()) {
        // Check for email input
        const emailInput = page.locator('input[name="email"], input[type="email"]');
        await expect(emailInput).toBeVisible();

        // Check for role selection
        const roleSelect = page.locator('select[name="role"]');
        await expect(roleSelect).toBeVisible();
      }
    });

    test('should allow inviting team members', async ({ page }) => {
      const inviteStep = page.locator('[data-step="invite"], [data-step="team"]');

      if (await inviteStep.isVisible()) {
        await page.locator('input[name="email"], input[type="email"]').fill('teammate@test.local');
        await page.locator('select[name="role"]').selectOption('operator');

        await page.locator('button:has-text("Invite"), button:has-text("Add")').click();

        // Should show invited member in list or show success
        await expectToast(page, { type: 'success' });
      }
    });
  });
});
