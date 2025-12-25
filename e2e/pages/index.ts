/**
 * E2E Test Page Objects
 *
 * This module exports all page objects for E2E testing using the Page Object Model pattern.
 * Each page object encapsulates the selectors and actions for a specific page or component.
 */

export { BasePage } from './base.page';
export { LoginPage } from './login.page';
export { DashboardPage } from './dashboard.page';
export { UsersPage } from './users.page';
export type { UserFormData } from './users.page';
export { MtServersPage } from './mt-servers.page';
export type { MtServerFormData } from './mt-servers.page';
export { PositionsPage } from './positions.page';
export type { PositionFilter } from './positions.page';
