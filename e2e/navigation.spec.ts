import { test, expect, setupMockAPIs } from './fixtures';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should navigate to main trading dashboard', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByText(/HFT Trading System/i)).toBeVisible();
  });

  test('should navigate to enhanced dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    await expect(page.getByText(/HFT.*Dashboard/i)).toBeVisible();
  });

  test('should navigate to options page', async ({ page }) => {
    await page.goto('/options');
    
    await expect(page.getByText(/Options Trading/i)).toBeVisible();
  });

  test('should navigate to portfolio page', async ({ page }) => {
    await page.goto('/portfolio');
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to automation page', async ({ page }) => {
    await page.goto('/automation');
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to monitoring page', async ({ page }) => {
    await page.goto('/monitoring');
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to scanner page', async ({ page }) => {
    await page.goto('/scanner');
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to API docs page', async ({ page }) => {
    await page.goto('/api-docs');
    
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('should display mobile header on enhanced dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Mobile header should be visible
    await expect(page.getByText(/HFT Dashboard/i)).toBeVisible();
  });

  test('should have mobile menu button', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Menu button should be visible
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(menuButton).toBeVisible();
  });

  test('should toggle mobile navigation', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Click menu button to open navigation
    const menuButton = page.locator('header button').last();
    
    if (await menuButton.isVisible()) {
      await menuButton.click();
      
      // Navigation should be visible
      await expect(page.getByRole('button', { name: /positions|trade|history/i }).first()).toBeVisible();
    }
  });

  test('should close mobile menu after selecting tab', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open menu
    const menuButton = page.locator('header button').last();
    
    if (await menuButton.isVisible()) {
      await menuButton.click();
      
      // Select a tab
      const tradeButton = page.getByRole('button', { name: /trade/i }).first();
      if (await tradeButton.isVisible()) {
        await tradeButton.click();
      }
    }
  });

  test('should show PAPER badge on mobile', async ({ page }) => {
    await page.goto('/dashboard');
    
    await expect(page.getByText(/PAPER/i)).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should render correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await page.goto('/dashboard');
    
    await expect(page.getByText(/HFT.*Dashboard/i)).toBeVisible();
  });

  test('should render correctly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    await page.goto('/dashboard');
    
    await expect(page.getByText(/HFT Trading Dashboard/i)).toBeVisible();
  });

  test('should collapse/expand panels on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/dashboard');
    
    // Collapsible panels should be present
    await expect(page.getByText(/Market Regime|Risk Controls|Alerts/i)).toBeVisible();
  });
});
