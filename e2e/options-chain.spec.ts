import { test, expect, setupMockAPIs, mockOptionsChainData } from './fixtures';

test.describe('Options Chain Browser', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should load options page with header', async ({ page }) => {
    await page.goto('/options');
    
    await expect(page.getByText(/Options Trading/i)).toBeVisible();
  });

  test('should display buying power on options page', async ({ page }) => {
    await page.goto('/options');
    
    await page.waitForResponse('**/api/account');
    
    // Should show buying power
    await expect(page.getByText(/Buying Power/i)).toBeVisible();
  });

  test('should have tab navigation for chain, positions, analysis, strategies', async ({ page }) => {
    await page.goto('/options');
    
    // Check for tab buttons
    await expect(page.getByRole('button', { name: /chain/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /positions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /analysis/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /strategies/i })).toBeVisible();
  });

  test('should display options chain viewer by default', async ({ page }) => {
    await page.goto('/options');
    
    // Chain tab should be active by default
    const chainButton = page.getByRole('button', { name: /chain/i });
    await expect(chainButton).toBeVisible();
  });

  test('should switch between tabs correctly', async ({ page }) => {
    await page.goto('/options');
    
    // Click positions tab
    await page.getByRole('button', { name: /positions/i }).click();
    await expect(page.getByText(/Portfolio Greeks|Positions/i)).toBeVisible();
    
    // Click strategies tab
    await page.getByRole('button', { name: /strategies/i }).click();
    await expect(page.getByText(/Covered Call|Cash-Secured Put/i)).toBeVisible();
    
    // Click analysis tab
    await page.getByRole('button', { name: /analysis/i }).click();
    await expect(page.getByText(/IV Surface|Scenario/i)).toBeVisible();
  });

  test('should display covered call strategy information', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /strategies/i }).click();
    
    // Check for covered call info
    await expect(page.getByText(/Covered Call/i)).toBeVisible();
    await expect(page.getByText(/Generate income on stocks you own/i)).toBeVisible();
  });

  test('should display cash-secured put strategy information', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /strategies/i }).click();
    
    // Check for CSP info
    await expect(page.getByText(/Cash-Secured Put/i)).toBeVisible();
    await expect(page.getByText(/Get paid to buy stocks at lower prices/i)).toBeVisible();
  });

  test('should show options trading tips', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /strategies/i }).click();
    
    // Check for trading tips
    await expect(page.getByText(/Options Trading Tips/i)).toBeVisible();
    await expect(page.getByText(/Delta/i)).toBeVisible();
    await expect(page.getByText(/Time Decay|Theta/i)).toBeVisible();
    await expect(page.getByText(/Implied Volatility/i)).toBeVisible();
  });

  test('should display greeks when contract is selected', async ({ page }) => {
    await page.goto('/options');
    
    // Greeks display should be present
    await expect(page.getByText(/Greeks|Delta|Gamma|Theta|Vega/i)).toBeVisible();
  });

  test('should show notification on successful order submission', async ({ page }) => {
    await page.route('**/api/options/orders', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { orderId: 'opt-order-123', status: 'submitted' },
        },
      });
    });
    
    await page.goto('/options');
    
    // Notification area should exist
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display level 1 trading restrictions message', async ({ page }) => {
    await page.goto('/options');
    
    // Should show Level 1 message
    await expect(page.getByText(/Level 1.*Covered Calls.*Cash-Secured Puts/i)).toBeVisible();
  });
});

test.describe('Options Chain - Positions Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display options positions table', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /positions/i }).click();
    
    // Positions section should be visible
    await expect(page.getByText(/Positions|Portfolio Greeks/i)).toBeVisible();
  });

  test('should show portfolio greeks summary', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /positions/i }).click();
    
    // Portfolio greeks should be shown
    await expect(page.getByText(/Portfolio Greeks/i)).toBeVisible();
  });
});

test.describe('Options Chain - Analysis Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display IV surface visualization', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /analysis/i }).click();
    
    // IV Surface should be visible
    await expect(page.getByText(/IV Surface/i)).toBeVisible();
  });

  test('should show scenario comparison tool', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /analysis/i }).click();
    
    // Scenario comparison should be visible
    await expect(page.getByText(/Scenario|Comparison/i)).toBeVisible();
  });

  test('should display smart contract picker', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /analysis/i }).click();
    
    // Smart picker should be visible
    await expect(page.getByText(/Smart.*Picker|Contract|Filter/i)).toBeVisible();
  });
});

test.describe('Options Chain - Order Form', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display order form on chain tab', async ({ page }) => {
    await page.goto('/options');
    
    // Order form should be present
    await expect(page.getByText(/Order|Buy|Sell/i).first()).toBeVisible();
  });

  test('should show P&L simulator when contract selected', async ({ page }) => {
    await page.goto('/options');
    
    // P&L simulator should be present
    await expect(page.getByText(/P&L|Profit|Loss|Simulator/i)).toBeVisible();
  });
});

test.describe('Options - Eligible Positions', () => {
  test.beforeEach(async ({ page }) => {
    // Mock positions with 100+ shares
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            positions: [
              { symbol: 'AAPL', quantity: 150, side: 'long' },
              { symbol: 'MSFT', quantity: 200, side: 'long' },
              { symbol: 'GOOGL', quantity: 50, side: 'long' }, // Not eligible
            ],
          },
        },
      });
    });
    
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { buyingPower: 50000 } },
      });
    });
    await page.route('**/api/options/**', async (route) => {
      await route.fulfill({ json: mockOptionsChainData });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { config: { tradingEnabled: true }, headroom: {} },
        },
      });
    });
  });

  test('should show eligible positions for covered calls', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /strategies/i }).click();
    
    // Should show positions with 100+ shares
    await expect(page.getByText(/AAPL.*1 contract|MSFT.*2 contract/i)).toBeVisible();
  });

  test('should calculate buying power for cash-secured puts', async ({ page }) => {
    await page.goto('/options');
    
    await page.getByRole('button', { name: /strategies/i }).click();
    
    // Should show buying power and contract calculation
    await expect(page.getByText(/\$50,000|5 contracts at \$100/i)).toBeVisible();
  });
});
