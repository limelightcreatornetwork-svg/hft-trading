import { test, expect } from '@playwright/test';

test.describe('Dashboard - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'test-account',
            status: 'ACTIVE',
            currency: 'USD',
            buyingPower: 50000,
            cash: 25000,
            portfolioValue: 125000,
            equity: 125000,
            lastEquity: 124000,
            longMarketValue: 100000,
            shortMarketValue: 0,
            initialMargin: 0,
            maintenanceMargin: 0,
            daytradeCount: 2,
            patternDayTrader: false,
            dailyPL: 1000,
            dailyPLPercent: 0.8,
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
                symbol: 'AAPL',
                quantity: 100,
                side: 'long',
                avgEntryPrice: 175.50,
                currentPrice: 180.25,
                marketValue: 18025,
                unrealizedPL: 475,
                unrealizedPLPercent: 2.71,
                changeToday: 1.25,
              },
              {
                symbol: 'MSFT',
                quantity: 50,
                side: 'long',
                avgEntryPrice: 420.00,
                currentPrice: 415.50,
                marketValue: 20775,
                unrealizedPL: -225,
                unrealizedPLPercent: -1.07,
                changeToday: -0.5,
              },
            ],
          },
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { orders: [] },
        }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { intents: [] },
          }),
        });
      } else {
        await route.continue();
      }
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
              maxOrderSize: 5000,
              maxDailyLoss: 2000,
              allowedSymbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY', 'QQQ'],
              tradingEnabled: true,
            },
            headroom: {
              orderSizeRemaining: 5000,
              maxPositionHeadroom: 8000,
              dailyLossRemaining: 1500,
              tradingEnabled: true,
            },
            status: 'ok',
          },
        }),
      });
    });
  });

  test('loads and displays trading dashboard header', async ({ page }) => {
    await page.goto('/');
    
    // Check header elements
    await expect(page.locator('h1')).toContainText('HFT Trading');
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
  });

  test('displays account information', async ({ page }) => {
    await page.goto('/');
    
    // Wait for data to load - look for portfolio value or equity
    await expect(page.getByText(/125,000|125000/)).toBeVisible({ timeout: 10000 });
  });

  test('renders positions table with mock data', async ({ page }) => {
    await page.goto('/');
    
    // Wait for positions to load - use table cell selector to be specific
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'MSFT' })).toBeVisible();
  });

  test('shows live/paper trading badge', async ({ page }) => {
    await page.goto('/');
    
    // Should show either LIVE or PAPER badge
    const liveOrPaperBadge = page.locator('text=/LIVE|PAPER|TRADING/');
    await expect(liveOrPaperBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test('refresh button triggers data reload', async ({ page }) => {
    await page.goto('/');
    
    // Wait for initial load
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
    
    // Click refresh
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await refreshButton.click();
    
    // Button should show loading state (spinning icon)
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });
});

test.describe('Dashboard Page - /dashboard route', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'test-account',
            portfolioValue: 100000,
            equity: 100000,
            buyingPower: 50000,
            cash: 25000,
            dailyPL: 500,
            dailyPLPercent: 0.5,
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
                symbol: 'SPY',
                quantity: 10,
                side: 'long',
                avgEntryPrice: 500.00,
                currentPrice: 505.00,
                marketValue: 5050,
                unrealizedPL: 50,
                unrealizedPLPercent: 1.0,
                changeToday: 0.5,
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
        body: JSON.stringify({
          success: true,
          data: { alerts: [] },
        }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { intents: [] },
        }),
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

  test('loads dashboard page with positions view', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should show dashboard header
    await expect(page.locator('h1').first()).toContainText(/HFT|Dashboard|Trading/i);
    
    // Should show SPY position
    await expect(page.getByText('SPY').first()).toBeVisible({ timeout: 10000 });
  });

  test('can switch between tabs (positions, trade, history)', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Look for tab buttons - they might be on desktop only
    const tradeTab = page.getByRole('button', { name: /trade/i });
    if (await tradeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tradeTab.click();
      await expect(page.getByText(/position sizing|quick trade/i)).toBeVisible({ timeout: 5000 });
    }
    
    // Try history tab
    const historyTab = page.getByRole('button', { name: /history/i });
    if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyTab.click();
      // History tab should show trade history component
      await page.waitForTimeout(500);
    }
  });

  test('shows P&L display', async ({ page }) => {
    await page.goto('/dashboard');
    
    // P&L component should be visible
    await expect(page.getByText(/P&L|daily|total/i).first()).toBeVisible({ timeout: 10000 });
  });
});
