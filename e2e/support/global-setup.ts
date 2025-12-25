import { FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Global setup for E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig): Promise<void> {
  // Load test environment variables
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  console.log('\n=== E2E Test Global Setup ===\n');

  // Verify environment
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8080';
  const apiURL = process.env.E2E_API_URL || 'http://localhost:3000';

  console.log(`Base URL: ${baseURL}`);
  console.log(`API URL: ${apiURL}`);

  // Wait for services to be ready (skip in CI - handled by workflow)
  if (!process.env.CI) {
    await waitForServices(baseURL, apiURL);
  }

  // Initialize test database
  await initializeTestDatabase();

  console.log('\n=== Global Setup Complete ===\n');
}

/**
 * Wait for application services to be ready
 */
async function waitForServices(baseURL: string, apiURL: string): Promise<void> {
  const maxRetries = 30;
  const retryDelay = 2000;

  console.log('Waiting for services to be ready...');

  // Check API health
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${apiURL}/health`);
      if (response.ok) {
        console.log('API service is ready');
        break;
      }
    } catch {
      if (i === maxRetries - 1) {
        console.warn('API service not responding, continuing anyway...');
      }
    }
    await sleep(retryDelay);
  }

  // Check frontend
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) {
        console.log('Frontend service is ready');
        return;
      }
    } catch {
      if (i === maxRetries - 1) {
        console.warn('Frontend service not responding, continuing anyway...');
      }
    }
    await sleep(retryDelay);
  }
}

/**
 * Initialize test database with seed data
 */
async function initializeTestDatabase(): Promise<void> {
  console.log('Initializing test database...');

  // In a real implementation, this would:
  // 1. Reset the test database
  // 2. Run migrations
  // 3. Seed with test data

  // For now, we assume the database is already set up via docker-compose
  console.log('Test database ready (using docker-compose setup)');
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default globalSetup;
