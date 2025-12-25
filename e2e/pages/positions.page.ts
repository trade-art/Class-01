import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Position filter options
 */
export interface PositionFilter {
  symbol?: string;
  type?: 'buy' | 'sell' | 'all';
  login?: number;
  minProfit?: number;
  maxProfit?: number;
}

/**
 * Positions Page Object
 * Handles trading positions display and interactions
 */
export class PositionsPage extends BasePage {
  // Page elements
  private readonly positionsTable: Locator;
  private readonly refreshButton: Locator;
  private readonly searchInput: Locator;
  private readonly symbolFilter: Locator;
  private readonly typeFilter: Locator;
  private readonly exportButton: Locator;

  // Summary cards
  private readonly totalPositionsCard: Locator;
  private readonly totalProfitCard: Locator;
  private readonly totalVolumeCard: Locator;

  // Position details modal
  private readonly positionModal: Locator;
  private readonly closeModalButton: Locator;

  // Pagination
  private readonly pagination: Locator;
  private readonly nextPageButton: Locator;
  private readonly prevPageButton: Locator;
  private readonly pageSizeSelect: Locator;

  // Real-time indicators
  private readonly lastUpdateTime: Locator;
  private readonly connectionIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.positionsTable = page.locator('table, [data-testid="positions-table"]');
    this.refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"]');
    this.searchInput = page.locator('input[placeholder*="Search"], input[name="search"]');
    this.symbolFilter = page.locator('select[name="symbol"], [data-testid="symbol-filter"]');
    this.typeFilter = page.locator('select[name="type"], [data-testid="type-filter"]');
    this.exportButton = page.locator('button:has-text("Export"), [data-testid="export"]');

    this.totalPositionsCard = page.locator('[data-testid="total-positions"], .stat-card:has-text("Position")');
    this.totalProfitCard = page.locator('[data-testid="total-profit"], .stat-card:has-text("Profit")');
    this.totalVolumeCard = page.locator('[data-testid="total-volume"], .stat-card:has-text("Volume")');

    this.positionModal = page.locator('.modal, [role="dialog"]');
    this.closeModalButton = page.locator('.modal-close, [aria-label="Close"]');

    this.pagination = page.locator('.pagination, [data-testid="pagination"]');
    this.nextPageButton = page.locator('button:has-text("Next"), [aria-label="Next page"]');
    this.prevPageButton = page.locator('button:has-text("Previous"), [aria-label="Previous page"]');
    this.pageSizeSelect = page.locator('select[name="pageSize"], [data-testid="page-size"]');

    this.lastUpdateTime = page.locator('[data-testid="last-update"], .last-update');
    this.connectionIndicator = page.locator('[data-testid="connection-indicator"], .connection-status');
  }

  /**
   * Navigate to positions page
   */
  async goto(): Promise<void> {
    await this.page.goto('/positions');
  }

  /**
   * Wait for positions page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.positionsTable).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * Refresh positions data
   */
  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForLoadingComplete();
  }

  /**
   * Search for positions
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForLoadingComplete();
  }

  /**
   * Filter positions by symbol
   */
  async filterBySymbol(symbol: string): Promise<void> {
    await this.symbolFilter.selectOption(symbol);
    await this.waitForLoadingComplete();
  }

  /**
   * Filter positions by type
   */
  async filterByType(type: 'buy' | 'sell' | 'all'): Promise<void> {
    await this.typeFilter.selectOption(type);
    await this.waitForLoadingComplete();
  }

  /**
   * Apply multiple filters
   */
  async applyFilters(filters: PositionFilter): Promise<void> {
    if (filters.symbol) {
      await this.filterBySymbol(filters.symbol);
    }
    if (filters.type) {
      await this.filterByType(filters.type);
    }
    if (filters.login) {
      await this.search(filters.login.toString());
    }
  }

  /**
   * Get position row by ticket
   */
  private getPositionRow(ticket: number): Locator {
    return this.positionsTable.locator(`tr:has-text("${ticket}")`);
  }

  /**
   * View position details
   */
  async viewPositionDetails(ticket: number): Promise<void> {
    const row = this.getPositionRow(ticket);
    await row.click();
    await expect(this.positionModal).toBeVisible();
  }

  /**
   * Close position details modal
   */
  async closePositionDetails(): Promise<void> {
    await this.closeModalButton.click();
    await expect(this.positionModal).toBeHidden();
  }

  /**
   * Get position data from row
   */
  async getPositionData(ticket: number): Promise<{
    ticket: number;
    login: number;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
  }> {
    const row = this.getPositionRow(ticket);

    return {
      ticket,
      login: parseInt((await row.locator('[data-field="login"], td:nth-child(2)').textContent()) || '0', 10),
      symbol: (await row.locator('[data-field="symbol"], td:nth-child(3)').textContent()) || '',
      type: (await row.locator('[data-field="type"], td:nth-child(4)').textContent()) || '',
      volume: parseFloat((await row.locator('[data-field="volume"], td:nth-child(5)').textContent()) || '0'),
      openPrice: parseFloat((await row.locator('[data-field="openPrice"], td:nth-child(6)').textContent()) || '0'),
      currentPrice: parseFloat((await row.locator('[data-field="currentPrice"], td:nth-child(7)').textContent()) || '0'),
      profit: parseFloat((await row.locator('[data-field="profit"], td:nth-child(8)').textContent())?.replace(/[$,]/g, '') || '0'),
    };
  }

  /**
   * Get total positions count from summary
   */
  async getTotalPositions(): Promise<number> {
    const text = await this.totalPositionsCard.locator('.value, .stat-value').textContent();
    return parseInt(text?.replace(/,/g, '') || '0', 10);
  }

  /**
   * Get total profit from summary
   */
  async getTotalProfit(): Promise<number> {
    const text = await this.totalProfitCard.locator('.value, .stat-value').textContent();
    return parseFloat(text?.replace(/[$,]/g, '') || '0');
  }

  /**
   * Get total volume from summary
   */
  async getTotalVolume(): Promise<number> {
    const text = await this.totalVolumeCard.locator('.value, .stat-value').textContent();
    return parseFloat(text?.replace(/,/g, '') || '0');
  }

  /**
   * Get all positions from table
   */
  async getAllPositions(): Promise<number[]> {
    const rows = await this.positionsTable.locator('tbody tr').all();
    const tickets: number[] = [];
    for (const row of rows) {
      const ticket = await row.locator('[data-field="ticket"], td:first-child').textContent();
      if (ticket) tickets.push(parseInt(ticket.trim(), 10));
    }
    return tickets;
  }

  /**
   * Get position count from table
   */
  async getPositionCount(): Promise<number> {
    const rows = await this.positionsTable.locator('tbody tr').all();
    return rows.length;
  }

  /**
   * Check if position exists in table
   */
  async positionExists(ticket: number): Promise<boolean> {
    const row = this.getPositionRow(ticket);
    return row.isVisible();
  }

  /**
   * Export positions
   */
  async exportPositions(): Promise<void> {
    await this.exportButton.click();
    // Wait for download to start
    await this.page.waitForEvent('download');
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
   * Change page size
   */
  async setPageSize(size: number): Promise<void> {
    await this.pageSizeSelect.selectOption(size.toString());
    await this.waitForLoadingComplete();
  }

  /**
   * Get last update time
   */
  async getLastUpdateTime(): Promise<string> {
    return (await this.lastUpdateTime.textContent()) || '';
  }

  /**
   * Check if connection is active
   */
  async isConnectionActive(): Promise<boolean> {
    const indicator = this.connectionIndicator;
    const classList = await indicator.getAttribute('class');
    return classList?.includes('active') || classList?.includes('connected') || false;
  }

  /**
   * Wait for real-time update
   */
  async waitForUpdate(timeout = 10000): Promise<void> {
    const initialTime = await this.getLastUpdateTime();
    await this.page.waitForFunction(
      (initial) => {
        const element = document.querySelector('[data-testid="last-update"], .last-update');
        return element && element.textContent !== initial;
      },
      initialTime,
      { timeout }
    );
  }

  /**
   * Expect position to be visible in table
   */
  async expectPositionVisible(ticket: number): Promise<void> {
    await expect(this.getPositionRow(ticket)).toBeVisible();
  }

  /**
   * Expect position profit to have specific value
   */
  async expectPositionProfit(ticket: number, expectedProfit: number): Promise<void> {
    const data = await this.getPositionData(ticket);
    expect(data.profit).toBeCloseTo(expectedProfit, 2);
  }

  /**
   * Expect summary statistics to be visible
   */
  async expectSummaryVisible(): Promise<void> {
    await expect(this.totalPositionsCard).toBeVisible();
    await expect(this.totalProfitCard).toBeVisible();
    await expect(this.totalVolumeCard).toBeVisible();
  }
}
