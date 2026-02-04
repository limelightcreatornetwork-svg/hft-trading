/**
 * Integration Tests for API Routes
 *
 * Tests the main API route handlers by importing them directly
 * and calling with mock Request objects. Dependencies (prisma,
 * alpaca, trade-manager, risk-engine, regime, confidence) are
 * mocked following the conventions in the existing test suite.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks – declared before any route imports so module resolution picks them up
// ---------------------------------------------------------------------------

// Auth middleware – bypass authentication for route tests
jest.mock('../../src/lib/api-auth', () => ({
  withAuth: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
  authenticateRequest: jest.fn().mockReturnValue({ authenticated: true, clientId: 'test-client' }),
}));

// Prisma
const mockPrisma = {
  $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
};
jest.mock('../../src/lib/db', () => ({
  prisma: mockPrisma,
}));

// Alpaca client
const mockGetAccount = jest.fn();
const mockGetPositions = jest.fn();
const mockGetOrders = jest.fn();
const mockCancelAllOrders = jest.fn();
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  getAccount: mockGetAccount,
  getPositions: mockGetPositions,
  getOrders: mockGetOrders,
  cancelAllOrders: mockCancelAllOrders,
}));

// Trade manager
const mockCreateManagedPosition = jest.fn();
const mockGetActiveManagedPositions = jest.fn();
const mockGetPositionHistory = jest.fn();
const mockManualClosePosition = jest.fn();
const mockGetTradingStats = jest.fn();
const mockGetAllAlerts = jest.fn();
const mockGetPendingAlerts = jest.fn();
const mockDismissAlert = jest.fn();
jest.mock('../../src/lib/trade-manager', () => ({
  createManagedPosition: mockCreateManagedPosition,
  getActiveManagedPositions: mockGetActiveManagedPositions,
  getPositionHistory: mockGetPositionHistory,
  manualClosePosition: mockManualClosePosition,
  getTradingStats: mockGetTradingStats,
  getAllAlerts: mockGetAllAlerts,
  getPendingAlerts: mockGetPendingAlerts,
  dismissAlert: mockDismissAlert,
}));

// Confidence
const mockCalculateConfidence = jest.fn();
const mockGetSuggestedLevels = jest.fn();
jest.mock('../../src/lib/confidence', () => ({
  calculateConfidence: mockCalculateConfidence,
  getSuggestedLevels: mockGetSuggestedLevels,
}));

// Risk engine
const mockGetRiskConfig = jest.fn();
const mockGetRiskHeadroom = jest.fn();
const mockUpdateRiskConfig = jest.fn();
const mockActivateKillSwitch = jest.fn();
const mockDeactivateKillSwitch = jest.fn();
const mockIsKillSwitchActive = jest.fn();
jest.mock('../../src/lib/risk-engine', () => ({
  getRiskConfig: mockGetRiskConfig,
  getRiskHeadroom: mockGetRiskHeadroom,
  updateRiskConfig: mockUpdateRiskConfig,
  activateKillSwitch: mockActivateKillSwitch,
  deactivateKillSwitch: mockDeactivateKillSwitch,
  isKillSwitchActive: mockIsKillSwitchActive,
}));

// Audit log
jest.mock('../../src/lib/audit-log', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

// Validation – use real implementation
jest.mock('../../src/lib/validation', () => {
  const actual = jest.requireActual('../../src/lib/validation');
  return actual;
});

// Regime detector
const mockDetect = jest.fn();
jest.mock('../../src/lib/regime', () => ({
  __esModule: true,
  getRegimeDetector: jest.fn(() => ({ detect: mockDetect })),
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { POST as tradePost, GET as tradeGet } from '../../src/app/api/trade/route';
import { GET as positionsGet } from '../../src/app/api/positions/route';
import { GET as managedGet, POST as managedPost } from '../../src/app/api/positions/managed/route';
import { GET as riskGet, PUT as riskPut } from '../../src/app/api/risk/route';
import { GET as killSwitchGet, POST as killSwitchPost } from '../../src/app/api/kill-switch/route';
import { GET as alertsGet, POST as alertsPost } from '../../src/app/api/alerts/route';
import { GET as healthGet } from '../../src/app/api/health/route';
import { GET as regimeGet, POST as regimePost } from '../../src/app/api/regime/route';
import { GET as accountGet } from '../../src/app/api/account/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRequest(url: string, body?: unknown): NextRequest {
  if (body !== undefined) {
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest(url);
}

function putRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    DATABASE_URL: 'postgres://localhost/test',
    ALPACA_API_KEY: 'test-key',
    ALPACA_API_SECRET: 'test-secret',
    NODE_ENV: 'test',
  };
});

afterEach(() => {
  process.env = originalEnv;
});

// ===========================================================================
// 1. POST /api/trade
// ===========================================================================

describe('API: /api/trade', () => {
  describe('POST', () => {
    const validBody = {
      symbol: 'AAPL',
      side: 'buy',
      quantity: 10,
      entryPrice: 150,
    };

    it('should return 200 with position when trade succeeds', async () => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: false,
        position: { id: 'pos-1', symbol: 'AAPL', side: 'buy', quantity: 10 },
        confidence: { score: 0.85 },
      });

      const request = jsonRequest('http://localhost:3000/api/trade', validBody);
      const response = await tradePost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(false);
      expect(data.position).toBeDefined();
      expect(data.confidence).toBeDefined();
    });

    it('should return 200 with skipped flag for low confidence', async () => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: true,
        reason: 'Confidence below threshold',
        confidence: { score: 0.3 },
      });

      const request = jsonRequest('http://localhost:3000/api/trade', validBody);
      const response = await tradePost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Confidence below threshold');
    });

    it('should uppercase the symbol', async () => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: false,
        position: { id: 'pos-1', symbol: 'AAPL' },
        confidence: { score: 0.8 },
      });

      const request = jsonRequest('http://localhost:3000/api/trade', {
        ...validBody,
        symbol: 'aapl',
      });
      await tradePost(request);

      expect(mockCreateManagedPosition).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL' })
      );
    });

    it('should return 400 when symbol is missing', async () => {
      const request = jsonRequest('http://localhost:3000/api/trade', {
        side: 'buy',
        quantity: 10,
        entryPrice: 150,
      });
      const response = await tradePost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/symbol/i);
    });

    it('should return 400 when side is invalid', async () => {
      const request = jsonRequest('http://localhost:3000/api/trade', {
        ...validBody,
        side: 'hold',
      });
      const response = await tradePost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/side/i);
    });

    it('should return 400 when quantity is zero', async () => {
      const request = jsonRequest('http://localhost:3000/api/trade', {
        ...validBody,
        quantity: 0,
      });
      const response = await tradePost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/quantity/i);
    });

    it('should return 400 when entryPrice is negative', async () => {
      const request = jsonRequest('http://localhost:3000/api/trade', {
        ...validBody,
        entryPrice: -10,
      });
      const response = await tradePost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/entryPrice/i);
    });

    it('should return 500 when trade-manager throws', async () => {
      mockCreateManagedPosition.mockRejectedValue(new Error('Broker error'));

      const request = jsonRequest('http://localhost:3000/api/trade', validBody);
      const response = await tradePost(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Failed to create trade');
    });

    it('should pass optional TP/SL/trailing/time params', async () => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: false,
        position: { id: 'pos-2' },
        confidence: { score: 0.9 },
      });

      const body = {
        ...validBody,
        takeProfitPct: 3,
        stopLossPct: 1.5,
        timeStopHours: 2,
        trailingStopPct: 0.5,
      };

      const request = jsonRequest('http://localhost:3000/api/trade', body);
      await tradePost(request);

      expect(mockCreateManagedPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          takeProfitPct: 3,
          stopLossPct: 1.5,
          timeStopHours: 2,
          trailingStopPct: 0.5,
        })
      );
    });
  });

  describe('GET (confidence preview)', () => {
    it('should return confidence for a symbol', async () => {
      mockCalculateConfidence.mockResolvedValue({ score: 0.82, factors: {} });
      mockGetSuggestedLevels.mockResolvedValue({
        takeProfit: 155,
        stopLoss: 145,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/trade?symbol=AAPL&side=buy&entryPrice=150'
      );
      const response = await tradeGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.symbol).toBe('AAPL');
      expect(data.confidence).toBeDefined();
      expect(data.suggestedLevels).toBeDefined();
    });

    it('should return 400 when symbol is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/trade');
      const response = await tradeGet(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid side', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/trade?symbol=AAPL&side=hold'
      );
      const response = await tradeGet(request);

      expect(response.status).toBe(400);
    });

    it('should default to side=buy and entryPrice=100 when not provided', async () => {
      mockCalculateConfidence.mockResolvedValue({ score: 0.5 });
      mockGetSuggestedLevels.mockResolvedValue({});

      const request = new NextRequest(
        'http://localhost:3000/api/trade?symbol=SPY'
      );
      const response = await tradeGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.side).toBe('buy');
      expect(data.entryPrice).toBe(100);
    });

    it('should return 500 when confidence calculation fails', async () => {
      mockCalculateConfidence.mockRejectedValue(new Error('Data unavailable'));

      const request = new NextRequest(
        'http://localhost:3000/api/trade?symbol=AAPL'
      );
      const response = await tradeGet(request);

      expect(response.status).toBe(500);
    });
  });
});

// ===========================================================================
// 2. GET /api/positions
// ===========================================================================

describe('API: /api/positions', () => {
  const mockAlpacaPositions = [
    {
      asset_id: 'asset-1',
      symbol: 'AAPL',
      exchange: 'NASDAQ',
      asset_class: 'us_equity',
      qty: '100',
      side: 'long',
      avg_entry_price: '150.00',
      current_price: '155.00',
      market_value: '15500.00',
      cost_basis: '15000.00',
      unrealized_pl: '500.00',
      unrealized_plpc: '0.0333',
      unrealized_intraday_pl: '100.00',
      unrealized_intraday_plpc: '0.0065',
      lastday_price: '154.00',
      change_today: '0.0065',
    },
    {
      asset_id: 'asset-2',
      symbol: 'MSFT',
      exchange: 'NASDAQ',
      asset_class: 'us_equity',
      qty: '50',
      side: 'long',
      avg_entry_price: '400.00',
      current_price: '410.00',
      market_value: '20500.00',
      cost_basis: '20000.00',
      unrealized_pl: '500.00',
      unrealized_plpc: '0.025',
      unrealized_intraday_pl: '200.00',
      unrealized_intraday_plpc: '0.0098',
      lastday_price: '408.00',
      change_today: '0.0049',
    },
  ];

  it('should return 200 with formatted positions and totals', async () => {
    mockGetPositions.mockResolvedValue(mockAlpacaPositions);

    const request = new NextRequest('http://localhost:3000/api/positions');
    const response = await positionsGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.positions).toHaveLength(2);
    expect(data.data.count).toBe(2);
    expect(data.data.totals).toBeDefined();
    expect(data.data.totals.totalMarketValue).toBe(36000);
  });

  it('should correctly format position fields', async () => {
    mockGetPositions.mockResolvedValue([mockAlpacaPositions[0]]);

    const request = new NextRequest('http://localhost:3000/api/positions');
    const response = await positionsGet(request);
    const data = await response.json();

    const pos = data.data.positions[0];
    expect(pos.symbol).toBe('AAPL');
    expect(pos.quantity).toBe(100);
    expect(pos.avgEntryPrice).toBe(150);
    expect(pos.currentPrice).toBe(155);
    expect(pos.unrealizedPLPercent).toBeCloseTo(3.33, 1);
  });

  it('should return empty array when no positions', async () => {
    mockGetPositions.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/positions');
    const response = await positionsGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.positions).toEqual([]);
    expect(data.data.count).toBe(0);
  });

  it('should return 500 when alpaca fails', async () => {
    mockGetPositions.mockRejectedValue(new Error('Alpaca timeout'));

    const request = new NextRequest('http://localhost:3000/api/positions');
    const response = await positionsGet(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});

// ===========================================================================
// 3. GET/POST /api/positions/managed
// ===========================================================================

describe('API: /api/positions/managed', () => {
  const mockActivePositions = [
    { id: 'mp-1', symbol: 'AAPL', side: 'buy', quantity: 10, status: 'active' },
    { id: 'mp-2', symbol: 'MSFT', side: 'buy', quantity: 5, status: 'active' },
  ];

  const mockClosedPositions = [
    { id: 'mp-3', symbol: 'TSLA', side: 'sell', quantity: 20, status: 'closed' },
  ];

  describe('GET', () => {
    it('should return active positions by default', async () => {
      mockGetActiveManagedPositions.mockResolvedValue(mockActivePositions);

      const request = new NextRequest('http://localhost:3000/api/positions/managed');
      const response = await managedGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.positions).toHaveLength(2);
      expect(data.count).toBe(2);
      expect(data.status).toBe('active');
      expect(mockGetActiveManagedPositions).toHaveBeenCalled();
    });

    it('should return closed positions when status=closed', async () => {
      mockGetPositionHistory.mockResolvedValue(mockClosedPositions);

      const request = new NextRequest(
        'http://localhost:3000/api/positions/managed?status=closed&limit=10'
      );
      const response = await managedGet(request);
      const data = await response.json();

      expect(data.positions).toHaveLength(1);
      expect(data.status).toBe('closed');
      expect(mockGetPositionHistory).toHaveBeenCalledWith(10);
    });

    it('should return all positions when status=all', async () => {
      mockGetActiveManagedPositions.mockResolvedValue(mockActivePositions);
      mockGetPositionHistory.mockResolvedValue(mockClosedPositions);

      const request = new NextRequest(
        'http://localhost:3000/api/positions/managed?status=all'
      );
      const response = await managedGet(request);
      const data = await response.json();

      expect(data.positions).toHaveLength(3);
      expect(data.count).toBe(3);
      expect(data.status).toBe('all');
    });

    it('should include stats when stats=true', async () => {
      mockGetActiveManagedPositions.mockResolvedValue([]);
      mockGetTradingStats.mockResolvedValue({
        totalTrades: 50,
        winRate: 0.6,
        avgPL: 120,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/positions/managed?stats=true'
      );
      const response = await managedGet(request);
      const data = await response.json();

      expect(data.stats).toBeDefined();
      expect(data.stats.totalTrades).toBe(50);
    });

    it('should not include stats by default', async () => {
      mockGetActiveManagedPositions.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost:3000/api/positions/managed'
      );
      const response = await managedGet(request);
      const data = await response.json();

      expect(data.stats).toBeUndefined();
      expect(mockGetTradingStats).not.toHaveBeenCalled();
    });

    it('should return 500 when trade-manager throws', async () => {
      mockGetActiveManagedPositions.mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/positions/managed');
      const response = await managedGet(request);

      expect(response.status).toBe(500);
    });
  });

  describe('POST (close position)', () => {
    it('should close a position successfully', async () => {
      mockManualClosePosition.mockResolvedValue(undefined);

      const request = jsonRequest('http://localhost:3000/api/positions/managed', {
        positionId: 'mp-1',
        closePrice: 160,
      });
      const response = await managedPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('closed');
      expect(mockManualClosePosition).toHaveBeenCalledWith('mp-1', 160);
    });

    it('should return 400 when positionId is missing', async () => {
      const request = jsonRequest('http://localhost:3000/api/positions/managed', {
        closePrice: 160,
      });
      const response = await managedPost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Position ID');
    });

    it('should return 400 when closePrice is invalid', async () => {
      const request = jsonRequest('http://localhost:3000/api/positions/managed', {
        positionId: 'mp-1',
        closePrice: -5,
      });
      const response = await managedPost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Close price');
    });

    it('should return 400 when closePrice is zero', async () => {
      const request = jsonRequest('http://localhost:3000/api/positions/managed', {
        positionId: 'mp-1',
        closePrice: 0,
      });
      const response = await managedPost(request);

      expect(response.status).toBe(400);
    });

    it('should return 500 when manualClosePosition throws', async () => {
      mockManualClosePosition.mockRejectedValue(new Error('Position not found'));

      const request = jsonRequest('http://localhost:3000/api/positions/managed', {
        positionId: 'mp-999',
        closePrice: 160,
      });
      const response = await managedPost(request);

      expect(response.status).toBe(500);
    });
  });
});

// ===========================================================================
// 4. GET/PUT /api/risk
// ===========================================================================

describe('API: /api/risk', () => {
  const mockConfig = {
    maxPositionSize: 1000,
    maxOrderSize: 100,
    maxDailyLoss: 1000,
    allowedSymbols: ['AAPL', 'MSFT'],
    tradingEnabled: true,
  };

  const mockHeadroom = {
    tradingEnabled: true,
    remainingDailyLoss: 800,
    maxPositionSize: 1000,
  };

  describe('GET', () => {
    it('should return risk config with headroom', async () => {
      mockGetRiskConfig.mockResolvedValue(mockConfig);
      mockGetRiskHeadroom.mockResolvedValue(mockHeadroom);

      const response = await riskGet(getRequest('http://localhost:3000/api/risk'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.config).toEqual(mockConfig);
      expect(data.data.headroom).toEqual(mockHeadroom);
      expect(data.data.status).toBe('ACTIVE');
    });

    it('should show DISABLED status when trading is off', async () => {
      mockGetRiskConfig.mockResolvedValue(mockConfig);
      mockGetRiskHeadroom.mockResolvedValue({
        ...mockHeadroom,
        tradingEnabled: false,
      });

      const response = await riskGet(getRequest('http://localhost:3000/api/risk'));
      const data = await response.json();

      expect(data.data.status).toBe('DISABLED');
    });

    it('should return 500 when risk engine fails', async () => {
      mockGetRiskConfig.mockRejectedValue(new Error('DB unavailable'));

      const response = await riskGet(getRequest('http://localhost:3000/api/risk'));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('PUT', () => {
    it('should update risk config successfully', async () => {
      mockUpdateRiskConfig.mockResolvedValue({
        ...mockConfig,
        maxPositionSize: 2000,
      });

      const request = putRequest('http://localhost:3000/api/risk', {
        maxPositionSize: 2000,
      });
      const response = await riskPut(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.config.maxPositionSize).toBe(2000);
    });

    it('should update tradingEnabled flag', async () => {
      mockUpdateRiskConfig.mockResolvedValue({
        ...mockConfig,
        tradingEnabled: false,
      });

      const request = putRequest('http://localhost:3000/api/risk', {
        tradingEnabled: false,
      });
      const response = await riskPut(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 for non-positive maxPositionSize', async () => {
      const request = putRequest('http://localhost:3000/api/risk', {
        maxPositionSize: -100,
      });
      const response = await riskPut(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 400 for non-array allowedSymbols', async () => {
      const request = putRequest('http://localhost:3000/api/risk', {
        allowedSymbols: 'AAPL',
      });
      const response = await riskPut(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('allowedSymbols');
    });

    it('should return 400 for non-boolean tradingEnabled', async () => {
      const request = putRequest('http://localhost:3000/api/risk', {
        tradingEnabled: 'yes',
      });
      const response = await riskPut(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('tradingEnabled');
    });

    it('should return 500 when updateRiskConfig throws', async () => {
      mockUpdateRiskConfig.mockRejectedValue(new Error('Write failed'));

      const request = putRequest('http://localhost:3000/api/risk', {
        maxPositionSize: 2000,
      });
      const response = await riskPut(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});

// ===========================================================================
// 5. GET/POST /api/kill-switch
// ===========================================================================

describe('API: /api/kill-switch', () => {
  describe('GET', () => {
    it('should return inactive status when kill switch is off', async () => {
      mockIsKillSwitchActive.mockReturnValue(false);
      mockGetRiskConfig.mockResolvedValue({ tradingEnabled: true });

      const response = await killSwitchGet(getRequest('http://localhost:3000/api/kill-switch'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.active).toBe(false);
      expect(data.data.tradingEnabled).toBe(true);
    });

    it('should return active when kill switch is on', async () => {
      mockIsKillSwitchActive.mockReturnValue(true);
      mockGetRiskConfig.mockResolvedValue({ tradingEnabled: true });

      const response = await killSwitchGet(getRequest('http://localhost:3000/api/kill-switch'));
      const data = await response.json();

      expect(data.data.active).toBe(true);
      expect(data.data.message).toContain('ACTIVE');
    });

    it('should return active when trading is disabled in config', async () => {
      mockIsKillSwitchActive.mockReturnValue(false);
      mockGetRiskConfig.mockResolvedValue({ tradingEnabled: false });

      const response = await killSwitchGet(getRequest('http://localhost:3000/api/kill-switch'));
      const data = await response.json();

      expect(data.data.active).toBe(true);
    });

    it('should return 500 on error', async () => {
      mockGetRiskConfig.mockRejectedValue(new Error('Config error'));

      const response = await killSwitchGet(getRequest('http://localhost:3000/api/kill-switch'));

      expect(response.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('should activate kill switch and cancel orders', async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);
      mockGetOrders.mockResolvedValue([{ id: 'o-1' }, { id: 'o-2' }]);
      mockCancelAllOrders.mockResolvedValue({ cancelled: 2 });

      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'activate',
      });
      const response = await killSwitchPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.active).toBe(true);
      expect(data.data.cancelledOrders).toBe(2);
      expect(mockActivateKillSwitch).toHaveBeenCalled();
      expect(mockCancelAllOrders).toHaveBeenCalled();
    });

    it('should activate without cancelling when cancelOrders=false', async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);

      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'activate',
        cancelOrders: false,
      });
      const response = await killSwitchPost(request);
      const data = await response.json();

      expect(data.data.active).toBe(true);
      expect(data.data.cancelledOrders).toBe(0);
      expect(mockCancelAllOrders).not.toHaveBeenCalled();
    });

    it('should activate even if order cancellation fails', async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);
      mockGetOrders.mockResolvedValue([{ id: 'o-1' }]);
      mockCancelAllOrders.mockRejectedValue(new Error('Cancel failed'));

      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'activate',
      });
      const response = await killSwitchPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.active).toBe(true);
    });

    it('should deactivate kill switch', async () => {
      mockDeactivateKillSwitch.mockResolvedValue(undefined);

      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'deactivate',
      });
      const response = await killSwitchPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.active).toBe(false);
      expect(data.data.message).toContain('DEACTIVATED');
      expect(mockDeactivateKillSwitch).toHaveBeenCalled();
    });

    it('should return 400 for invalid action', async () => {
      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'toggle',
      });
      const response = await killSwitchPost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid action');
    });

    it('should return 400 when action is missing', async () => {
      const request = jsonRequest('http://localhost:3000/api/kill-switch', {});
      const response = await killSwitchPost(request);

      expect(response.status).toBe(400);
    });

    it('should return 500 when activateKillSwitch throws', async () => {
      mockActivateKillSwitch.mockRejectedValue(new Error('Engine failure'));

      const request = jsonRequest('http://localhost:3000/api/kill-switch', {
        action: 'activate',
      });
      const response = await killSwitchPost(request);

      expect(response.status).toBe(500);
    });
  });
});

// ===========================================================================
// 6. GET/POST /api/alerts
// ===========================================================================

describe('API: /api/alerts', () => {
  const mockAlerts = [
    { id: 'a-1', type: 'STOP_LOSS', symbol: 'AAPL', triggered: false },
    { id: 'a-2', type: 'TAKE_PROFIT', symbol: 'MSFT', triggered: true },
  ];

  describe('GET', () => {
    it('should return all alerts by default', async () => {
      mockGetAllAlerts.mockResolvedValue(mockAlerts);

      const request = new NextRequest('http://localhost:3000/api/alerts');
      const response = await alertsGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.alerts).toHaveLength(2);
      expect(data.data.count).toBe(2);
      expect(data.data.pendingOnly).toBe(false);
      expect(mockGetAllAlerts).toHaveBeenCalledWith(50);
    });

    it('should return pending alerts when pending=true', async () => {
      const pending = [mockAlerts[0]];
      mockGetPendingAlerts.mockResolvedValue(pending);

      const request = new NextRequest(
        'http://localhost:3000/api/alerts?pending=true'
      );
      const response = await alertsGet(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.alerts).toHaveLength(1);
      expect(data.data.pendingOnly).toBe(true);
      expect(mockGetPendingAlerts).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      mockGetAllAlerts.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost:3000/api/alerts?limit=10'
      );
      await alertsGet(request);

      expect(mockGetAllAlerts).toHaveBeenCalledWith(10);
    });

    it('should return 500 when fetching alerts fails', async () => {
      mockGetAllAlerts.mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/alerts');
      const response = await alertsGet(request);

      expect(response.status).toBe(500);
    });
  });

  describe('POST (dismiss alert)', () => {
    it('should dismiss an alert successfully', async () => {
      mockDismissAlert.mockResolvedValue(undefined);

      const request = jsonRequest('http://localhost:3000/api/alerts', {
        alertId: 'a-1',
      });
      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('dismissed');
      expect(mockDismissAlert).toHaveBeenCalledWith('a-1');
    });

    it('should return 400 when alertId is missing', async () => {
      const request = jsonRequest('http://localhost:3000/api/alerts', {});
      const response = await alertsPost(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Alert ID');
    });

    it('should return 400 when alertId is not a string', async () => {
      const request = jsonRequest('http://localhost:3000/api/alerts', {
        alertId: 123,
      });
      const response = await alertsPost(request);

      expect(response.status).toBe(400);
    });

    it('should return 500 when dismissAlert throws', async () => {
      mockDismissAlert.mockRejectedValue(new Error('Not found'));

      const request = jsonRequest('http://localhost:3000/api/alerts', {
        alertId: 'a-999',
      });
      const response = await alertsPost(request);

      expect(response.status).toBe(500);
    });
  });
});

// ===========================================================================
// 7. GET /api/health
// ===========================================================================

describe('API: /api/health', () => {
  it('should return healthy when all checks pass', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

    const response = await healthGet(getRequest('http://localhost:3000/api/health?detail=true'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.checks).toBeDefined();
    expect(data.data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.data.timestamp).toBeDefined();
  });

  it('should include database check', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

    const response = await healthGet(getRequest('http://localhost:3000/api/health?detail=true'));
    const data = await response.json();

    const dbCheck = data.data.checks.find((c: { name: string }) => c.name === 'database');
    expect(dbCheck).toBeDefined();
    expect(dbCheck.status).toBe('pass');
  });

  it('should return unhealthy when database fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    const response = await healthGet(getRequest('http://localhost:3000/api/health?detail=true'));
    const data = await response.json();

    expect(data.data.status).toBe('unhealthy');
    expect(response.status).toBe(503);

    const dbCheck = data.data.checks.find((c: { name: string }) => c.name === 'database');
    expect(dbCheck.status).toBe('fail');
  });

  it('should return unhealthy when alpaca credentials are missing', async () => {
    delete process.env.ALPACA_API_KEY;

    const response = await healthGet(getRequest('http://localhost:3000/api/health?detail=true'));
    const data = await response.json();

    expect(data.data.status).toBe('unhealthy');

    const alpacaCheck = data.data.checks.find(
      (c: { name: string }) => c.name === 'alpaca_config'
    );
    expect(alpacaCheck.status).toBe('fail');
  });

  it('should include version and environment', async () => {
    const response = await healthGet(getRequest('http://localhost:3000/api/health?detail=true'));
    const data = await response.json();

    expect(data.data.version).toBeDefined();
    expect(data.data.environment).toBe('test');
  });
});

// ===========================================================================
// 8. GET/POST /api/regime
// ===========================================================================

describe('API: /api/regime', () => {
  const mockRegimeResult = {
    regime: 'TREND',
    confidence: 0.85,
    timestamp: new Date().toISOString(),
    symbol: 'SPY',
    metrics: {
      atr: 5.2,
      atrPercent: 1.1,
      volatility: 0.02,
      adx: 35,
      regressionSlope: 0.5,
      spreadPercent: 0.02,
      volumeAnomaly: 1.1,
      priceRange: 1.5,
    },
    recommendation: 'Ride momentum',
  };

  describe('GET', () => {
    it('should detect regime for default symbol SPY', async () => {
      mockDetect.mockResolvedValue(mockRegimeResult);

      const request = new NextRequest('http://localhost:3000/api/regime');
      const response = await regimeGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.regime).toBe('TREND');
      expect(data.confidence).toBe(0.85);
      expect(data.symbol).toBe('SPY');
    });

    it('should detect regime for a specific symbol', async () => {
      const aapl = { ...mockRegimeResult, symbol: 'AAPL', regime: 'CHOP' };
      mockDetect.mockResolvedValue(aapl);

      const request = new NextRequest(
        'http://localhost:3000/api/regime?symbol=AAPL'
      );
      const response = await regimeGet(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.regime).toBe('CHOP');
    });

    it('should return history when history=true', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/regime?history=true&symbol=SPY'
      );
      const response = await regimeGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.history).toBeDefined();
      expect(Array.isArray(data.history)).toBe(true);
    });

    it('should return 500 when detection fails', async () => {
      mockDetect.mockRejectedValue(new Error('No market data'));

      const request = new NextRequest('http://localhost:3000/api/regime');
      const response = await regimeGet(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST (batch detection)', () => {
    it('should detect regime for multiple symbols', async () => {
      mockDetect.mockResolvedValue(mockRegimeResult);

      const request = jsonRequest('http://localhost:3000/api/regime', {
        symbols: ['SPY', 'QQQ', 'AAPL'],
      });
      const response = await regimePost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(3);
    });

    it('should default to SPY when no symbols provided', async () => {
      mockDetect.mockResolvedValue(mockRegimeResult);

      const request = jsonRequest('http://localhost:3000/api/regime', {});
      const response = await regimePost(request);
      const data = await response.json();

      expect(data.results).toHaveLength(1);
    });

    it('should include error for individual symbol failures', async () => {
      mockDetect
        .mockResolvedValueOnce(mockRegimeResult)
        .mockRejectedValueOnce(new Error('No data for XYZ'));

      const request = jsonRequest('http://localhost:3000/api/regime', {
        symbols: ['SPY', 'XYZ'],
      });
      const response = await regimePost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(2);
      // First succeeds, second has error
      expect(data.results[0].regime).toBeDefined();
      expect(data.results[1].error).toBeDefined();
    });

    it('should return 500 on unexpected failure', async () => {
      // jsonRequest with invalid JSON-like payload – simulate a throw from request.json()
      const request = new NextRequest('http://localhost:3000/api/regime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const response = await regimePost(request);

      expect(response.status).toBe(500);
    });
  });
});

// ===========================================================================
// 9. GET /api/account
// ===========================================================================

describe('API: /api/account', () => {
  const mockAlpacaAccount = {
    id: 'acct-123',
    status: 'ACTIVE',
    currency: 'USD',
    buying_power: '100000.00',
    cash: '50000.00',
    portfolio_value: '150000.00',
    equity: '150000.00',
    last_equity: '149000.00',
    long_market_value: '100000.00',
    short_market_value: '0.00',
    initial_margin: '50000.00',
    maintenance_margin: '25000.00',
    daytrade_count: 2,
    pattern_day_trader: false,
  };

  it('should return formatted account data', async () => {
    mockGetAccount.mockResolvedValue(mockAlpacaAccount);

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('acct-123');
    expect(data.data.status).toBe('ACTIVE');
    expect(data.data.buyingPower).toBe(100000);
    expect(data.data.equity).toBe(150000);
  });

  it('should compute daily P&L correctly', async () => {
    mockGetAccount.mockResolvedValue(mockAlpacaAccount);

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));
    const data = await response.json();

    // equity=150000, last_equity=149000 -> dailyPL = 1000
    expect(data.data.dailyPL).toBe(1000);
    // 1000 / 149000 * 100 ≈ 0.6711
    expect(data.data.dailyPLPercent).toBeCloseTo(0.6711, 2);
  });

  it('should handle zero last_equity without division by zero', async () => {
    mockGetAccount.mockResolvedValue({
      ...mockAlpacaAccount,
      equity: '100.00',
      last_equity: '0.00',
    });

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));
    const data = await response.json();

    expect(data.data.dailyPLPercent).toBe(0);
  });

  it('should parse all numeric fields from strings', async () => {
    mockGetAccount.mockResolvedValue(mockAlpacaAccount);

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));
    const data = await response.json();

    expect(typeof data.data.buyingPower).toBe('number');
    expect(typeof data.data.cash).toBe('number');
    expect(typeof data.data.portfolioValue).toBe('number');
    expect(typeof data.data.longMarketValue).toBe('number');
    expect(typeof data.data.shortMarketValue).toBe('number');
    expect(typeof data.data.initialMargin).toBe('number');
    expect(typeof data.data.maintenanceMargin).toBe('number');
  });

  it('should return 500 when alpaca fails', async () => {
    mockGetAccount.mockRejectedValue(new Error('Unauthorized'));

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('should include patternDayTrader and daytradeCount', async () => {
    mockGetAccount.mockResolvedValue(mockAlpacaAccount);

    const response = await accountGet(getRequest('http://localhost:3000/api/account'));
    const data = await response.json();

    expect(data.data.daytradeCount).toBe(2);
    expect(data.data.patternDayTrader).toBe(false);
  });
});
