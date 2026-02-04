/**
 * Tests for GET /api/analysis
 *
 * Verifies the performance analysis endpoint including Sharpe ratio,
 * max drawdown, and average holding time calculations.
 */

import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Auth bypass – these tests focus on business logic, not auth
// -----------------------------------------------------------------------
jest.mock('../../src/lib/api-auth', () => ({
  withAuth: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
  authenticateRequest: jest.fn().mockReturnValue({ authenticated: true, clientId: 'test-client' }),
}));

// -----------------------------------------------------------------------
// Mock dependencies
// -----------------------------------------------------------------------

const mockGetAccount = jest.fn();
const mockGetPortfolioHistory = jest.fn();
const mockGetAccountActivities = jest.fn();
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  getAccount: mockGetAccount,
  getPortfolioHistory: mockGetPortfolioHistory,
  getAccountActivities: mockGetAccountActivities,
}));

const mockPrisma = {
  order: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};
jest.mock('../../src/lib/db', () => ({
  prisma: mockPrisma,
}));

// -----------------------------------------------------------------------
// Route import
// -----------------------------------------------------------------------

import { GET } from '../../src/app/api/analysis/route';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('GET /api/analysis', () => {
  const baseAccount = {
    portfolio_value: '10000',
    cash: '5000',
    buying_power: '10000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue(baseAccount);
    mockGetAccountActivities.mockResolvedValue([]);
  });

  it('returns basic metrics with empty portfolio history', async () => {
    mockGetPortfolioHistory.mockResolvedValue({
      equity: [],
      profit_loss: [],
      profit_loss_pct: [],
      timestamp: [],
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.metrics.totalValue).toBe(10000);
    expect(body.data.metrics.sharpeRatio).toBeNull();
    expect(body.data.metrics.maxDrawdown).toBeNull();
  });

  it('calculates Sharpe ratio from equity series', async () => {
    // Simulate 10 days of steady 1% daily returns
    const equity: number[] = [10000];
    for (let i = 1; i < 10; i++) {
      equity.push(equity[i - 1] * 1.01);
    }

    mockGetPortfolioHistory.mockResolvedValue({
      equity,
      profit_loss: equity.map(e => e - 10000),
      profit_loss_pct: equity.map(e => ((e - 10000) / 10000) * 100),
      timestamp: equity.map((_, i) => 1706745600 + i * 86400),
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    // Sharpe should be very high for consistent positive returns
    expect(body.data.metrics.sharpeRatio).not.toBeNull();
    expect(body.data.metrics.sharpeRatio).toBeGreaterThan(5);
  });

  it('calculates negative Sharpe for losing periods', async () => {
    // Simulate 10 days of steady -1% daily returns
    const equity: number[] = [10000];
    for (let i = 1; i < 10; i++) {
      equity.push(equity[i - 1] * 0.99);
    }

    mockGetPortfolioHistory.mockResolvedValue({
      equity,
      profit_loss: equity.map(e => e - 10000),
      profit_loss_pct: equity.map(e => ((e - 10000) / 10000) * 100),
      timestamp: equity.map((_, i) => 1706745600 + i * 86400),
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(body.data.metrics.sharpeRatio).toBeLessThan(0);
  });

  it('calculates max drawdown from equity series', async () => {
    // Peak at 12000, drops to 9600 (20% drawdown), then recovers
    const equity = [10000, 11000, 12000, 10800, 9600, 10200, 11000];

    mockGetPortfolioHistory.mockResolvedValue({
      equity,
      profit_loss: equity.map(e => e - 10000),
      profit_loss_pct: equity.map(e => ((e - 10000) / 10000) * 100),
      timestamp: equity.map((_, i) => 1706745600 + i * 86400),
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    // Drawdown from 12000 to 9600 = 20%
    expect(body.data.metrics.maxDrawdown).toBeCloseTo(20, 0);
  });

  it('reports zero drawdown for monotonically increasing equity', async () => {
    const equity = [10000, 10500, 11000, 11500, 12000];

    mockGetPortfolioHistory.mockResolvedValue({
      equity,
      profit_loss: equity.map(e => e - 10000),
      profit_loss_pct: equity.map(e => ((e - 10000) / 10000) * 100),
      timestamp: equity.map((_, i) => 1706745600 + i * 86400),
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(body.data.metrics.maxDrawdown).toBe(0);
  });

  it('calculates average holding time from activities', async () => {
    // BUY AAPL at T=0, SELL AAPL at T+48h → 48 hour hold
    const buyTime = '2026-02-01T10:00:00Z';
    const sellTime = '2026-02-03T10:00:00Z';

    mockGetPortfolioHistory.mockResolvedValue({
      equity: [10000, 10200],
      profit_loss: [0, 200],
      profit_loss_pct: [0, 2],
      timestamp: [1706745600, 1706832000],
    });

    mockGetAccountActivities.mockResolvedValue([
      { id: '1', symbol: 'AAPL', side: 'buy', qty: '10', price: '150', net_amount: '-1500', transaction_time: buyTime },
      { id: '2', symbol: 'AAPL', side: 'sell', qty: '10', price: '155', net_amount: '1550', transaction_time: sellTime },
    ]);

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    // 48 hours between buy and sell
    expect(body.data.metrics.avgHoldingTime).toBeCloseTo(48, 0);
  });

  it('returns null avgHoldingTime when no matched pairs exist', async () => {
    mockGetPortfolioHistory.mockResolvedValue({
      equity: [10000],
      profit_loss: [0],
      profit_loss_pct: [0],
      timestamp: [1706745600],
    });

    // Only buys, no sells
    mockGetAccountActivities.mockResolvedValue([
      { id: '1', symbol: 'AAPL', side: 'buy', qty: '10', price: '150', transaction_time: '2026-02-01T10:00:00Z' },
    ]);

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(body.data.metrics.avgHoldingTime).toBeNull();
  });

  it('calculates daily P&L win/loss stats', async () => {
    // 3 winning days, 2 losing days
    const profitLoss = [100, 250, 200, 350, 300];

    mockGetPortfolioHistory.mockResolvedValue({
      equity: [10000, 10100, 10250, 10200, 10350, 10300],
      profit_loss: [0, ...profitLoss],
      profit_loss_pct: [0, 1, 2.5, 2, 3.5, 3],
      timestamp: [0, 1, 2, 3, 4, 5].map(i => 1706745600 + i * 86400),
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(body.data.metrics.winningTrades).toBe(3);
    expect(body.data.metrics.losingTrades).toBe(2);
    expect(body.data.metrics.winRate).toBeCloseTo(60, 0);
  });

  it('includes equity curve and daily P&L in response', async () => {
    const equity = [10000, 10100, 10050];
    const timestamps = [1706745600, 1706832000, 1706918400];

    mockGetPortfolioHistory.mockResolvedValue({
      equity,
      profit_loss: [0, 100, 50],
      profit_loss_pct: [0, 1, 0.5],
      timestamp: timestamps,
    });

    const res = await GET(getRequest('http://localhost:3000/api/analysis'));
    const body = await res.json();

    expect(body.data.equityCurve).toHaveLength(3);
    expect(body.data.equityCurve[0].equity).toBe(10000);
    expect(body.data.dailyPnL).toHaveLength(3);
  });

  it('passes period parameter to portfolio history', async () => {
    mockGetPortfolioHistory.mockResolvedValue({
      equity: [10000],
      profit_loss: [0],
      profit_loss_pct: [0],
      timestamp: [1706745600],
    });

    await GET(getRequest('http://localhost:3000/api/analysis?period=3M&timeframe=1H'));

    expect(mockGetPortfolioHistory).toHaveBeenCalledWith({
      period: '3M',
      timeframe: '1H',
    });
  });
});
