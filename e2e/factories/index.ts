/**
 * E2E Test Data Factories
 *
 * This module exports all test data factories for generating
 * realistic test data in E2E tests.
 */

export { TenantFactory } from './tenant.factory';
export type { TenantData } from './tenant.factory';

export { UserFactory } from './user.factory';
export type { UserData, UserRole } from './user.factory';

export { MtServerFactory } from './mt-server.factory';
export type { MtServerData, PlatformType } from './mt-server.factory';

export { TradingUserFactory } from './trading-user.factory';
export type {
  TradingUserData,
  TradingPositionData,
  TradingOrderData,
} from './trading-user.factory';
