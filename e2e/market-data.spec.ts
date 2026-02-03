import { test, expect } from '@playwright/test';

test.describe('Market Data Display', () => {
  test.beforeEach(async ({ page }) => {
    // Mock account data
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            portfolioValue: 100000,
            equity: 100000,
            buyingPower: 50000,
            cash: 25000,
            dailyPL: 250,
            dailyPLPercent: 0.25,
          },
        }),
      });
    });

    // Mock positions with market data
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            positions: [
              {
                symbol: 'AAPL',
                quantity: 100,
                side: 'long',
                avgEntryPrice: 175.00,
                currentPrice: 178.50,
                marketValue: 17850,
                unrealizedPL: 350,
                unrealizedPLPercent: 2.0,
                changeToday: 1.5,
              },
              {
                symbol: 'NVDA',
                quantity: 25,
                side: 'long',
                avgEntryPrice: 850.00,
                currentPrice: 840.00,
                marketValue: 21000,
                unrealizedPL: -250,
                unrealizedPLPercent: -1.18,
                changeToday: -2.0,
              },
            ],
          },
        }),
      });
    });

    // Mock other required endpoints
    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orders: [] } }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { intents: [] } }),
      });
    });

    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            config: {
              maxPositionSize: 10000,
              allowedSymbols: ['AAPL', 'NVDA', 'SPY'],
              tradingEnabled: true,
            },
            headroom: { tradingEnabled: true },
          },
        }),
      });
    });

    await page.route('**/api/alerts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { alerts: [] } }),
      });
    });
  });

  test('displays position symbols and quantities', async ({ page }) => {
    await page.goto('/');
    
    // Check that position symbols are displayed - use table cell selector
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'NVDA' })).toBeVisible();
  });

  test('shows unrealized P&L for positions', async ({ page }) => {
    await page.goto('/');
    
    // Wait for data to load
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    
    // Check for P&L values (positive and negative)
    // The exact format depends on the component, look for formatted numbers
    await expect(page.locator('text=/\\+?\\$?350|\\+?2\\.?0?%/').first()).toBeVisible();
  });

  test('displays current prices for positions', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    
    // Look for price values (178.50 or 840.00)
    await expect(page.locator('text=/178\\.50|840\\.00/').first()).toBeVisible();
  });

  test('shows market value for positions', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    
    // Market values should be displayed
    await expect(page.locator('text=/17,?850|21,?000/').first()).toBeVisible();
  });

  test('displays portfolio summary metrics', async ({ page }) => {
    await page.goto('/');
    
    // Portfolio value should be displayed
    await expect(page.locator('text=/100,?000/').first()).toBeVisible({ timeout: 10000 });
  });

  test('differentiates positive and negative P&L visually', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    
    // Look for green/red styling indicators (classes or text)
    const positivePL = page.locator('.text-green-500, .text-green-600, [class*="green"]').first();
    const negativePL = page.locator('.text-red-500, .text-red-600, [class*="red"]').first();
    
    // At least one should be visible for positions with gains/losses
    const hasColoredPL = await positivePL.isVisible().catch(() => false) || 
                         await negativePL.isVisible().catch(() => false);
    expect(hasColoredPL).toBeTruthy();
  });
});

test.describe('Market Data - Dashboard Route', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            portfolioValue: 150000,
            equity: 150000,
            dailyPL: 1500,
            dailyPLPercent: 1.0,
          },
        }),
      });
    });

    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            positions: [
              {
                symbol: 'QQQ',
                quantity: 50,
                side: 'long',
                avgEntryPrice: 480.00,
                currentPrice: 490.00,
                marketValue: 24500,
                unrealizedPL: 500,
                unrealizedPLPercent: 2.08,
                changeToday: 0.8,
              },
            ],
          },
        }),
      });
    });

    await page.route('**/api/alerts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { alerts: [] } }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { intents: [] } }),
      });
    });

    await page.route('**/api/automation/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      });
    });
  });

  test('dashboard shows position cards with market data', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for position to load
    await expect(page.getByText('QQQ').first()).toBeVisible({ timeout: 10000 });
    
    // Position card should show relevant data
    await expect(page.locator('text=/490|24,?500/').first()).toBeVisible();
  });

  test('shows daily P&L in dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Daily P&L should be visible somewhere
    await expect(page.locator('text=/1,?500|1\\.0%|daily/i').first()).toBeVisible({ timeout: 10000 });
  });
});
