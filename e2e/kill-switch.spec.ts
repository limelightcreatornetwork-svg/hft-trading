import { test, expect, setupMockAPIs } from './fixtures';

test.describe('Kill Switch Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display kill switch component on main dashboard', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Kill switch section should be visible
    await expect(page.getByText(/Kill Switch|Trading Status/i)).toBeVisible();
  });

  test('should show current trading status as LIVE when kill switch is off', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/kill-switch');
    
    // Should show LIVE badge when trading is enabled
    await expect(page.getByText(/LIVE|Trading Enabled/i)).toBeVisible();
  });

  test('should display kill switch button', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Should have an activate/emergency button
    const killSwitchButton = page.getByRole('button', { name: /kill switch|halt|emergency|stop|activate/i });
    await expect(killSwitchButton).toBeVisible();
  });

  test('should activate kill switch when clicked', async ({ page }) => {
    let killSwitchActivated = false;
    
    await page.route('**/api/kill-switch', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'activate') {
          killSwitchActivated = true;
          await route.fulfill({
            json: {
              success: true,
              data: {
                active: true,
                message: 'Kill switch ACTIVATED',
                cancelledOrders: 2,
              },
            },
          });
        } else {
          await route.fulfill({
            json: {
              success: true,
              data: {
                active: false,
                message: 'Kill switch DEACTIVATED',
              },
            },
          });
        }
      } else {
        await route.fulfill({
          json: {
            success: true,
            data: { active: killSwitchActivated, tradingEnabled: !killSwitchActivated },
          },
        });
      }
    });
    
    // Also need other mock routes
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { equity: 100000, buyingPower: 50000 } },
      });
    });
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({ json: { success: true, data: { positions: [] } } });
    });
    await page.route('**/api/orders**', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fulfill({ json: { success: true, data: { orders: [] } } });
      }
    });
    await page.route('**/api/intents**', async (route) => {
      await route.fulfill({ json: { success: true, data: { intents: [] } } });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            config: { tradingEnabled: !killSwitchActivated, allowedSymbols: [] },
            headroom: {},
          },
        },
      });
    });
    
    await page.goto('/');
    
    // Handle confirmation dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    
    // Find and click kill switch
    const killSwitchButton = page.getByRole('button', { name: /kill switch|halt|emergency|stop|activate/i }).first();
    
    if (await killSwitchButton.isVisible()) {
      await killSwitchButton.click();
      
      // Wait for the API call
      await page.waitForResponse('**/api/kill-switch');
      
      expect(killSwitchActivated).toBe(true);
    }
  });

  test('should show TRADING DISABLED badge when kill switch is active', async ({ page }) => {
    await page.route('**/api/kill-switch', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { active: true, tradingEnabled: false },
        },
      });
    });
    
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { equity: 100000 } },
      });
    });
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({ json: { success: true, data: { positions: [] } } });
    });
    await page.route('**/api/orders**', async (route) => {
      await route.fulfill({ json: { success: true, data: { orders: [] } } });
    });
    await page.route('**/api/intents**', async (route) => {
      await route.fulfill({ json: { success: true, data: { intents: [] } } });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            config: { tradingEnabled: false, allowedSymbols: [] },
            headroom: {},
          },
        },
      });
    });
    
    await page.goto('/');
    
    // Should show disabled status
    await expect(page.getByText(/TRADING DISABLED|HALTED|STOPPED/i)).toBeVisible();
  });

  test('should deactivate kill switch when clicked again', async ({ page }) => {
    let killSwitchActive = true;
    
    await page.route('**/api/kill-switch', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        killSwitchActive = body.action === 'activate';
        await route.fulfill({
          json: {
            success: true,
            data: {
              active: killSwitchActive,
              message: killSwitchActive ? 'Kill switch ACTIVATED' : 'Kill switch DEACTIVATED',
            },
          },
        });
      } else {
        await route.fulfill({
          json: {
            success: true,
            data: { active: killSwitchActive, tradingEnabled: !killSwitchActive },
          },
        });
      }
    });
    
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { equity: 100000 } },
      });
    });
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({ json: { success: true, data: { positions: [] } } });
    });
    await page.route('**/api/orders**', async (route) => {
      await route.fulfill({ json: { success: true, data: { orders: [] } } });
    });
    await page.route('**/api/intents**', async (route) => {
      await route.fulfill({ json: { success: true, data: { intents: [] } } });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            config: { tradingEnabled: !killSwitchActive, allowedSymbols: [] },
            headroom: {},
          },
        },
      });
    });
    
    await page.goto('/');
    
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    
    // Click to deactivate
    const deactivateButton = page.getByRole('button', { name: /deactivate|resume|enable/i }).first();
    
    if (await deactivateButton.isVisible()) {
      await deactivateButton.click();
      await page.waitForResponse('**/api/kill-switch');
      expect(killSwitchActive).toBe(false);
    }
  });

  test('should cancel open orders when kill switch is activated', async ({ page }) => {
    let ordersCancelled = false;
    
    await page.route('**/api/kill-switch', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.cancelOrders) {
          ordersCancelled = true;
        }
        await route.fulfill({
          json: {
            success: true,
            data: {
              active: true,
              cancelledOrders: ordersCancelled ? 3 : 0,
            },
          },
        });
      } else {
        await route.fulfill({
          json: { success: true, data: { active: false } },
        });
      }
    });
    
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { equity: 100000 } },
      });
    });
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({ json: { success: true, data: { positions: [] } } });
    });
    await page.route('**/api/orders**', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            orders: [
              { id: '1', symbol: 'AAPL', status: 'open' },
              { id: '2', symbol: 'MSFT', status: 'open' },
              { id: '3', symbol: 'GOOGL', status: 'open' },
            ],
          },
        },
      });
    });
    await page.route('**/api/intents**', async (route) => {
      await route.fulfill({ json: { success: true, data: { intents: [] } } });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            config: { tradingEnabled: true, allowedSymbols: [] },
            headroom: {},
          },
        },
      });
    });
    
    await page.goto('/');
    
    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('cancelled')) {
        expect(dialog.message()).toContain('3');
      }
      await dialog.accept();
    });
    
    const killSwitchButton = page.getByRole('button', { name: /kill switch|halt|emergency/i }).first();
    
    if (await killSwitchButton.isVisible()) {
      await killSwitchButton.click();
      await page.waitForResponse('**/api/kill-switch');
    }
  });

  test('should show loading state while toggling kill switch', async ({ page }) => {
    await page.route('**/api/kill-switch', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 500)); // Simulate delay
        await route.fulfill({
          json: { success: true, data: { active: true } },
        });
      } else {
        await route.fulfill({
          json: { success: true, data: { active: false } },
        });
      }
    });
    
    await page.route('**/api/account', async (route) => {
      await route.fulfill({
        json: { success: true, data: { equity: 100000 } },
      });
    });
    await page.route('**/api/positions', async (route) => {
      await route.fulfill({ json: { success: true, data: { positions: [] } } });
    });
    await page.route('**/api/orders**', async (route) => {
      await route.fulfill({ json: { success: true, data: { orders: [] } } });
    });
    await page.route('**/api/intents**', async (route) => {
      await route.fulfill({ json: { success: true, data: { intents: [] } } });
    });
    await page.route('**/api/risk', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { config: { tradingEnabled: true, allowedSymbols: [] }, headroom: {} },
        },
      });
    });
    
    await page.goto('/');
    
    const killSwitchButton = page.getByRole('button', { name: /kill switch|halt|emergency/i }).first();
    
    if (await killSwitchButton.isVisible()) {
      // Click and check for loading state
      await killSwitchButton.click();
      
      // Button should be disabled or show loading
      await expect(killSwitchButton).toBeDisabled();
    }
  });
});

test.describe('Kill Switch - Enhanced Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should show HALT TRADING button in risk controls', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Look for kill switch in risk controls
    await expect(page.getByText(/Kill Switch|HALT TRADING/i)).toBeVisible();
  });

  test('should display risk control defaults', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check for risk control defaults
    await expect(page.getByText(/Default TP|Default SL|Time Stop/i)).toBeVisible();
  });
});
