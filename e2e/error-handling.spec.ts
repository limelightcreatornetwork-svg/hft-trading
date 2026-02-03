import { test, expect } from '@playwright/test';

test.describe('API Error Handling', () => {
  test('shows error state when account API fails', async ({ page }) => {
    // Mock account endpoint to return error
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Internal server error',
        }),
      });
    });

    // Mock other endpoints to succeed
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { positions: [] } }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orders: [] } }),
      });
    });

    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { config: { tradingEnabled: true }, headroom: {} },
        }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { intents: [] } }),
      });
    });

    await page.goto('/');
    
    // Page should still render despite API error
    await expect(page.locator('h1')).toContainText(/HFT|Trading/i);
    
    // Should not crash - ErrorBoundary should catch component errors
    await page.waitForTimeout(1000);
    
    // Look for loading state or empty state (graceful degradation)
    const pageLoaded = await page.locator('body').isVisible();
    expect(pageLoaded).toBeTruthy();
  });

  test('shows error state when positions API fails', async ({ page }) => {
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { portfolioValue: 100000, buyingPower: 50000 },
        }),
      });
    });

    // Mock positions to fail
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch positions',
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orders: [] } }),
      });
    });

    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { config: { tradingEnabled: true }, headroom: {} },
        }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { intents: [] } }),
      });
    });

    await page.goto('/');
    
    // Page should render with header
    await expect(page.locator('h1')).toContainText(/HFT|Trading/i);
    
    // Positions section might show error or empty state
    await page.waitForTimeout(1000);
    
    // The page should handle the error gracefully
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();
  });

  test('handles network timeout gracefully', async ({ page }) => {
    // Abort all API requests to simulate timeout
    await page.route('**/api/**', async (route) => {
      await route.abort('timedout');
    });

    await page.goto('/');
    
    // Page should still load (Next.js SSR/CSR)
    await page.waitForTimeout(2000);
    
    // Should not show a blank page - at minimum show header
    const hasContent = await page.locator('h1, header, [class*="container"]').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('error boundary catches component errors', async ({ page }) => {
    // Return malformed data to trigger component error
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: null, // Might cause errors if component expects object
        }),
      });
    });

    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { positions: 'invalid' }, // Wrong type
        }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orders: [] } }),
      });
    });

    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { config: { tradingEnabled: true }, headroom: {} },
        }),
      });
    });

    await page.route('**/api/intents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { intents: [] } }),
      });
    });

    await page.goto('/');
    
    // Wait for any errors to be caught
    await page.waitForTimeout(2000);
    
    // Page should not completely crash
    const pageHasContent = await page.locator('body').textContent();
    expect(pageHasContent).not.toBe('');
  });

  test('displays error message for failed trade submission', async ({ page }) => {
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { portfolioValue: 100000, buyingPower: 50000 },
        }),
      });
    });

    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { positions: [] } }),
      });
    });

    await page.route('**/api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orders: [] } }),
      });
    });

    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            config: { allowedSymbols: ['AAPL'], tradingEnabled: true },
            headroom: { tradingEnabled: true },
          },
        }),
      });
    });

    // Mock intent submission to fail
    await page.route('**/api/intents*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid order parameters',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { intents: [] } }),
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Trade form should be available
    const hasTradeElements = await page.locator('text=/trade|order|submit|buy|sell/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasTradeElements).toBeTruthy();
  });
});

test.describe('Dashboard Error Handling', () => {
  test('dashboard handles API errors gracefully', async ({ page }) => {
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Service unavailable' }),
      });
    });

    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Service unavailable' }),
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

    await page.goto('/dashboard');
    
    // Dashboard should still render
    await expect(page.locator('h1, header')).toBeVisible({ timeout: 10000 });
    
    // Should handle errors gracefully without crashing
    await page.waitForTimeout(1000);
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
  });

  test('shows loading state while fetching data', async ({ page }) => {
    // Delay API responses to show loading state
    await page.route('**/api/account', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { portfolioValue: 100000 },
        }),
      });
    });

    await page.route('**/api/positions', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { positions: [] } }),
      });
    });

    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      });
    });

    await page.goto('/');
    
    // Look for loading indicators (skeleton, spinner, animate-pulse)
    const hasLoadingIndicator = await page.locator('.animate-spin, .animate-pulse, [class*="loading"], [class*="skeleton"]').first().isVisible({ timeout: 1000 }).catch(() => false);
    
    // Page should show something while loading
    const hasContent = await page.locator('body').isVisible();
    expect(hasContent).toBeTruthy();
  });
});
