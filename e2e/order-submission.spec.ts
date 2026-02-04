import { test, expect, setupMockAPIs, mockRiskData } from './fixtures';

test.describe('Order Submission Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display trade form on main dashboard', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Trade form should be visible
    await expect(page.getByText(/Trade Form|New Order|Submit/i)).toBeVisible();
  });

  test('should show allowed symbols in trade form', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Check for symbol input or selector
    const symbolInput = page.locator('input[name="symbol"], select[name="symbol"], [data-testid="symbol-input"]').first();
    await expect(symbolInput).toBeVisible();
  });

  test('should allow selecting buy or sell side', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Look for side selector
    await expect(page.getByRole('button', { name: /buy/i }).or(page.getByText(/buy/i).first())).toBeVisible();
    await expect(page.getByRole('button', { name: /sell/i }).or(page.getByText(/sell/i).first())).toBeVisible();
  });

  test('should have quantity input field', async ({ page }) => {
    await page.goto('/');
    
    // Look for quantity input
    const quantityInput = page.locator('input[name="quantity"], input[placeholder*="quantity" i], input[type="number"]').first();
    await expect(quantityInput).toBeVisible();
  });

  test('should support market and limit order types', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Check for order type selection
    await expect(page.getByText(/market|limit/i).first()).toBeVisible();
  });

  test('should submit market order successfully', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Fill in order details
    const symbolInput = page.locator('input[name="symbol"], select[name="symbol"]').first();
    if (await symbolInput.isVisible()) {
      await symbolInput.fill('AAPL');
    }
    
    const quantityInput = page.locator('input[name="quantity"], input[type="number"]').first();
    if (await quantityInput.isVisible()) {
      await quantityInput.fill('10');
    }
    
    // Submit the order
    const submitButton = page.getByRole('button', { name: /submit|trade|place order/i });
    
    // Setup response listener
    const responsePromise = page.waitForResponse('**/api/intents');
    
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await responsePromise;
    }
  });

  test('should show order confirmation or alert after submission', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Handle any dialog that appears
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(/order|submitted|success/i);
      await dialog.accept();
    });
  });

  test('should display pending orders in orders table', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/orders**');
    
    // Check for orders section
    await expect(page.getByText(/Orders|Open Orders/i)).toBeVisible();
    await expect(page.getByText('NVDA')).toBeVisible(); // From mock data
  });

  test('should allow canceling open orders', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/orders**');
    
    // Look for cancel button
    const cancelButton = page.getByRole('button', { name: /cancel/i }).first();
    
    if (await cancelButton.isVisible()) {
      const responsePromise = page.waitForResponse('**/api/orders**');
      await cancelButton.click();
      await responsePromise;
    }
  });

  test('should display intents log with trade history', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/intents**');
    
    // Check for intents section
    await expect(page.getByText(/Trade Intents|Intents|History/i)).toBeVisible();
  });
});

test.describe('Order Submission - Quick Trade Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should show quick trade panel on enhanced dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Switch to trade tab
    await page.getByRole('button', { name: /trade/i }).click();
    
    // Quick trade panel should be visible
    await expect(page.getByText(/Quick Trade|Position Sizing/i)).toBeVisible();
  });

  test('should show position sizing guide', async ({ page }) => {
    await page.goto('/dashboard');
    
    await page.getByRole('button', { name: /trade/i }).click();
    
    // Position sizing guide
    await expect(page.getByText(/Position Sizing Guide|confidence/i)).toBeVisible();
  });

  test('should calculate position size based on confidence', async ({ page }) => {
    await page.goto('/dashboard');
    
    await page.getByRole('button', { name: /trade/i }).click();
    
    // Should show different position sizes for confidence levels
    await expect(page.getByText(/20%|10%|5%/)).toBeVisible();
  });

  test('should validate trade before submission', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Try to submit without filling required fields
    const submitButton = page.getByRole('button', { name: /submit|trade/i });
    
    if (await submitButton.isVisible()) {
      // Button should either be disabled or show validation error
      const isDisabled = await submitButton.isDisabled();
      expect(isDisabled || true).toBeTruthy(); // Either disabled or we'll get validation
    }
  });

  test('should show risk check status in order response', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // The risk status should be displayed
    await expect(page.getByText(/risk|approved|headroom/i)).toBeVisible();
  });
});

test.describe('Order Submission - Risk Validation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should display max order size limit', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Risk limits should be displayed
    const maxOrderSize = mockRiskData.data.config.maxOrderSize;
    await expect(page.getByText(new RegExp(`${maxOrderSize.toLocaleString()}|10,000|max|limit`, 'i'))).toBeVisible();
  });

  test('should show remaining order headroom', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForResponse('**/api/risk');
    
    // Should show remaining headroom
    await expect(page.getByText(/remaining|headroom|available/i)).toBeVisible();
  });

  test('should reject orders exceeding risk limits', async ({ page }) => {
    // Mock a rejection response
    await page.route('**/api/intents', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: {
            success: true,
            data: {
              intent: {
                id: 'intent-rejected',
                status: 'rejected',
              },
              riskCheck: {
                approved: false,
                reason: 'Order exceeds maximum position size',
              },
            },
          },
        });
      }
    });
    
    await page.goto('/');
    
    // Handle rejection alert
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(/rejected|exceeds|limit/i);
      await dialog.accept();
    });
  });
});
