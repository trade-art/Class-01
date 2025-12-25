/**
 * E2E Test Support Utilities
 *
 * This module exports all support utilities for E2E testing.
 */

// Auth helpers
export { AuthHelper, createAuthHelper } from './auth.helper';
export type { AuthCredentials, StoredAuthState } from './auth.helper';

// Database helpers
export {
  DatabaseHelper,
  createDatabaseHelper,
  getSharedDatabase,
  closeSharedDatabase,
} from './database.helper';
export type { DatabaseConfig } from './database.helper';

// API helpers
export { ApiHelper, ApiError, createApiHelper, createApiHelperFromContext } from './api.helper';
export type { ApiResponse } from './api.helper';

// Test utilities
export {
  createTestContext,
  waitForStable,
  waitForNetworkIdle,
  retry,
  generateTestId,
  createTestTenantData,
  createTestUserData,
  createTestMtServerData,
  screenshotOnFailure,
  setupConsoleLogger,
  waitForApiResponse,
  mockApiResponse,
  clearMocks,
  expectTableRowCount,
  expectFormError,
  expectToast,
  dismissToasts,
  scrollIntoView,
  getTableData,
  fillForm,
  clearForm,
  formatDateForInput,
  formatDateTimeForInput,
  sleep,
  // Naive UI specific helpers
  setupPiniaAuthState,
  clearPiniaAuthState,
  expectNaiveMessage,
  clickNaiveDropdownItem,
} from './test-utils';
export type { TestContext } from './test-utils';
