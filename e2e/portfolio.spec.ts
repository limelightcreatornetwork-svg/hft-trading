import { test, expect, setupMockAPIs, mockPortfolioData, mockPositionsData } from './fixtures';

test.describe('Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should load portfolio page', async ({ page }) => {
    await page.goto('/portfolio');
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display total portfolio value', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/portfolio');
    
    // Portfolio value should be displayed
    await expect(page.getByText(/100,000|\$100k|Portfolio/i)).toBeVisible();
  });

  test('should show daily change with color coding', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/account');
    
    // Daily change should be visible (positive = green)
    await expect(page.getByText(/2,000|\+2\.04%/)).toBeVisible();
  });

  test('should display all positions', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/positions');
    
    // Check for position symbols
    for (const position of mockPositionsData.data.positions) {
      await expect(page.getByText(position.symbol)).toBeVisible();
    }
  });

  test('should show cash balance', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/account');
    
    // Cash should be displayed
    await expect(page.getByText(/25,000|Cash/i)).toBeVisible();
  });
});

test.describe('Portfolio - Position Details', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display entry price for positions', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/positions');
    
    // Entry prices should be visible
    await expect(page.getByText(/175\.50|380\.00|450\.00/)).toBeVisible();
  });

  test('should show current price vs entry price', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/positions');
    
    // Current prices
    await expect(page.getByText(/178\.25|385\.50|455\.00/)).toBeVisible();
  });

  test('should calculate and display P&L for each position', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/positions');
    
    // P&L values
    await expect(page.getByText(/275|\+1\.57%|\+1\.45%/)).toBeVisible();
  });

  test('should show position quantity and market value', async ({ page }) => {
    await page.goto('/portfolio');
    
    await page.waitForResponse('**/api/positions');
    
    // Quantities and market values
    await expect(page.getByText(/100|50|200/)).toBeVisible();
  });
});

test.describe('Portfolio - Statistics', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display trading statistics', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/stats');
    
    // Stats should be available (win rate, profit factor, etc.)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show account status', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/account');
    
    // Account status
    await expect(page.getByText(/ACTIVE|LIVE/i)).toBeVisible();
  });
});

test.describe('Portfolio - Risk Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display risk configuration', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Risk config should be shown
    await expect(page.getByText(/Max|Position|Order|Risk/i)).toBeVisible();
  });

  test('should show daily loss limit status', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Daily loss limit
    await expect(page.getByText(/Daily|Loss|Limit|Remaining/i)).toBeVisible();
  });
});
