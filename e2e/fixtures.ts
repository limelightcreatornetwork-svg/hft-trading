import { test as base, Page } from '@playwright/test';

/**
 * Mock API data fixtures for E2E tests
 */
export const mockAccountData = {
  success: true,
  data: {
    id: 'test-account-123',
    status: 'ACTIVE',
    currency: 'USD',
    buyingPower: 50000,
    cash: 25000,
    portfolioValue: 100000,
    equity: 100000,
    lastEquity: 98000,
    longMarketValue: 75000,
    shortMarketValue: 0,
    initialMargin: 15000,
    maintenanceMargin: 10000,
    daytradeCount: 2,
    patternDayTrader: false,
    dailyPL: 2000,
    dailyPLPercent: 2.04,
  },
};

export const mockPositionsData = {
  success: true,
  data: {
    positions: [
      {
        symbol: 'AAPL',
        quantity: 100,
        side: 'long',
        avgEntryPrice: 175.50,
        currentPrice: 178.25,
        marketValue: 17825,
        unrealizedPL: 275,
        unrealizedPLPercent: 1.57,
        changeToday: 0.5,
        assetType: 'stock',
      },
      {
        symbol: 'MSFT',
        quantity: 50,
        side: 'long',
        avgEntryPrice: 380.00,
        currentPrice: 385.50,
        marketValue: 19275,
        unrealizedPL: 275,
        unrealizedPLPercent: 1.45,
        changeToday: -0.25,
        assetType: 'stock',
      },
      {
        symbol: 'SPY',
        quantity: 200,
        side: 'long',
        avgEntryPrice: 450.00,
        currentPrice: 455.00,
        marketValue: 91000,
        unrealizedPL: 1000,
        unrealizedPLPercent: 1.11,
        changeToday: 0.75,
        assetType: 'stock',
      },
    ],
  },
};

export const mockOrdersData = {
  success: true,
  data: {
    orders: [
      {
        id: 'order-1',
        symbol: 'NVDA',
        side: 'buy',
        type: 'limit',
        quantity: 10,
        filledQuantity: 0,
        limitPrice: 850.00,
        status: 'open',
        submittedAt: new Date().toISOString(),
      },
      {
        id: 'order-2',
        symbol: 'AMD',
        side: 'sell',
        type: 'limit',
        quantity: 25,
        filledQuantity: 0,
        limitPrice: 165.00,
        status: 'open',
        submittedAt: new Date().toISOString(),
      },
    ],
  },
};

export const mockIntentsData = {
  success: true,
  data: {
    intents: [
      {
        id: 'intent-1',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 50,
        orderType: 'market',
        status: 'executed',
        strategy: 'momentum',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'intent-2',
        symbol: 'GOOGL',
        side: 'sell',
        quantity: 20,
        orderType: 'limit',
        status: 'pending',
        strategy: 'mean_reversion',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
  },
};

export const mockRiskData = {
  success: true,
  data: {
    config: {
      maxPositionSize: 50000,
      maxOrderSize: 10000,
      maxDailyLoss: 5000,
      allowedSymbols: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMD', 'SPY', 'QQQ', 'TSLA'],
      tradingEnabled: true,
    },
    headroom: {
      orderSizeRemaining: 10000,
      maxPositionHeadroom: 35000,
      dailyLossRemaining: 3000,
      tradingEnabled: true,
    },
    status: 'active',
  },
};

export const mockKillSwitchData = {
  success: true,
  data: {
    active: false,
    tradingEnabled: true,
    message: 'Kill switch is OFF - trading enabled',
  },
};

export const mockRegimeData = {
  success: true,
  data: {
    symbol: 'SPY',
    regime: 'bullish',
    confidence: 0.75,
    indicators: {
      trend: 'up',
      volatility: 'low',
      momentum: 'positive',
    },
    timestamp: new Date().toISOString(),
  },
};

export const mockOptionsChainData = {
  success: true,
  data: {
    underlying: 'AAPL',
    underlyingPrice: 178.25,
    expirations: ['2024-02-16', '2024-02-23', '2024-03-01', '2024-03-15'],
    chain: [
      {
        strike: 175,
        expiration: '2024-02-16',
        calls: {
          symbol: 'AAPL240216C00175000',
          bid: 4.20,
          ask: 4.35,
          last: 4.25,
          volume: 1500,
          openInterest: 5000,
          iv: 0.28,
          delta: 0.65,
          gamma: 0.05,
          theta: -0.08,
          vega: 0.15,
        },
        puts: {
          symbol: 'AAPL240216P00175000',
          bid: 1.15,
          ask: 1.25,
          last: 1.20,
          volume: 800,
          openInterest: 3000,
          iv: 0.26,
          delta: -0.35,
          gamma: 0.05,
          theta: -0.06,
          vega: 0.12,
        },
      },
      {
        strike: 180,
        expiration: '2024-02-16',
        calls: {
          symbol: 'AAPL240216C00180000',
          bid: 2.10,
          ask: 2.20,
          last: 2.15,
          volume: 2000,
          openInterest: 8000,
          iv: 0.30,
          delta: 0.45,
          gamma: 0.06,
          theta: -0.10,
          vega: 0.18,
        },
        puts: {
          symbol: 'AAPL240216P00180000',
          bid: 3.85,
          ask: 4.00,
          last: 3.90,
          volume: 1200,
          openInterest: 4500,
          iv: 0.29,
          delta: -0.55,
          gamma: 0.06,
          theta: -0.09,
          vega: 0.16,
        },
      },
    ],
  },
};

export const mockPortfolioData = {
  success: true,
  data: {
    totalValue: 100000,
    dailyChange: 2000,
    dailyChangePercent: 2.04,
    weeklyChange: 5500,
    weeklyChangePercent: 5.82,
    positions: mockPositionsData.data.positions,
    cash: 25000,
    buyingPower: 50000,
  },
};

export const mockAlertsData = {
  success: true,
  data: {
    alerts: [
      {
        id: 'alert-1',
        type: 'price',
        symbol: 'AAPL',
        message: 'AAPL crossed above $178',
        severity: 'info',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'alert-2',
        type: 'risk',
        symbol: 'Portfolio',
        message: 'Daily loss limit at 60%',
        severity: 'warning',
        createdAt: new Date(Date.now() - 600000).toISOString(),
      },
    ],
  },
};

/**
 * Setup mock API routes for a page
 */
export async function setupMockAPIs(page: Page) {
  await page.route('**/api/account', async (route) => {
    await route.fulfill({ json: mockAccountData });
  });

  await page.route('**/api/positions', async (route) => {
    await route.fulfill({ json: mockPositionsData });
  });

  await page.route('**/api/orders**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { success: true, data: { cancelled: true } } });
    } else {
      await route.fulfill({ json: mockOrdersData });
    }
  });

  await page.route('**/api/intents**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          success: true,
          data: {
            intent: {
              id: `intent-${Date.now()}`,
              ...body,
              status: 'executed',
              createdAt: new Date().toISOString(),
            },
            riskCheck: { approved: true },
          },
        },
      });
    } else {
      await route.fulfill({ json: mockIntentsData });
    }
  });

  await page.route('**/api/risk', async (route) => {
    await route.fulfill({ json: mockRiskData });
  });

  await page.route('**/api/kill-switch', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const isActivating = body.action === 'activate';
      await route.fulfill({
        json: {
          success: true,
          data: {
            active: isActivating,
            message: isActivating ? 'Kill switch ACTIVATED' : 'Kill switch DEACTIVATED',
            cancelledOrders: isActivating ? 2 : 0,
          },
        },
      });
    } else {
      await route.fulfill({ json: mockKillSwitchData });
    }
  });

  await page.route('**/api/regime**', async (route) => {
    await route.fulfill({ json: mockRegimeData });
  });

  await page.route('**/api/options/chain**', async (route) => {
    await route.fulfill({ json: mockOptionsChainData });
  });

  await page.route('**/api/options/contracts**', async (route) => {
    await route.fulfill({ json: mockOptionsChainData });
  });

  await page.route('**/api/options/quotes**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          bid: 4.20,
          ask: 4.35,
          last: 4.25,
          volume: 1500,
          openInterest: 5000,
        },
      },
    });
  });

  await page.route('**/api/portfolio**', async (route) => {
    await route.fulfill({ json: mockPortfolioData });
  });

  await page.route('**/api/alerts**', async (route) => {
    await route.fulfill({ json: mockAlertsData });
  });

  await page.route('**/api/trade**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            orderId: `order-${Date.now()}`,
            status: 'submitted',
          },
        },
      });
    }
  });

  await page.route('**/api/stats**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          totalTrades: 150,
          winRate: 0.62,
          profitFactor: 1.8,
          sharpeRatio: 1.45,
        },
      },
    });
  });

  await page.route('**/api/health**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          status: 'healthy',
          uptime: 86400,
          version: '1.0.0',
        },
      },
    });
  });
}

/**
 * Extended test fixture with mock APIs
 */
export const test = base.extend<{ mockPage: Page }>({
  mockPage: async ({ page }, use) => {
    await setupMockAPIs(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not React hook
    await use(page);
  },
});

export { expect } from '@playwright/test';
