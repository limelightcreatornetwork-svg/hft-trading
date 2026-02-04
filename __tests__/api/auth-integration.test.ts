/**
 * Auth Integration Tests for API Routes
 *
 * Unlike routes.test.ts which bypasses authentication, these tests
 * exercise the REAL auth middleware (withAuth / apiHandler) to verify
 * that endpoints reject unauthenticated requests and accept valid ones.
 *
 * The env module is mocked so api-auth sees a known API key.
 * Downstream dependencies (alpaca, risk-engine, etc.) are mocked.
 */

import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Test API key – env mock must be declared before api-auth loads
// -----------------------------------------------------------------------
const TEST_API_KEY = 'test-hft-secret-key-12345';

jest.mock('../../src/lib/env', () => ({
  getOptionalEnv: (name: string, defaultValue: string) => {
    if (name === 'HFT_API_KEY') return TEST_API_KEY;
    return process.env[name] || defaultValue;
  },
  getRequiredEnv: (name: string) => {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required env: ${name}`);
    return val;
  },
  getBoolEnv: (_name: string, defaultValue: boolean) => defaultValue,
  getNumericEnv: (_name: string, defaultValue: number) => defaultValue,
}));

// -----------------------------------------------------------------------
// Mock downstream dependencies (not api-auth – we test it for real)
// -----------------------------------------------------------------------

const mockGetRiskConfig = jest.fn();
const mockGetRiskHeadroom = jest.fn();
const mockUpdateRiskConfig = jest.fn();
const mockIsKillSwitchActive = jest.fn();
const mockActivateKillSwitch = jest.fn();
const mockDeactivateKillSwitch = jest.fn();
const mockCheckIntent = jest.fn();
jest.mock('../../src/lib/risk-engine', () => ({
  getRiskConfig: mockGetRiskConfig,
  getRiskHeadroom: mockGetRiskHeadroom,
  updateRiskConfig: mockUpdateRiskConfig,
  isKillSwitchActive: mockIsKillSwitchActive,
  activateKillSwitch: mockActivateKillSwitch,
  deactivateKillSwitch: mockDeactivateKillSwitch,
  checkIntent: mockCheckIntent,
}));

const mockGetOrders = jest.fn();
const mockCancelAllOrders = jest.fn();
const mockGetPositions = jest.fn();
const mockSubmitOrder = jest.fn();
const mockCancelOrder = jest.fn();
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  getOrders: mockGetOrders,
  cancelAllOrders: mockCancelAllOrders,
  getPositions: mockGetPositions,
  submitOrder: mockSubmitOrder,
  cancelOrder: mockCancelOrder,
}));

jest.mock('../../src/lib/formatters', () => ({
  formatAlpacaPosition: (p: Record<string, unknown>) => ({
    symbol: p.symbol,
    quantity: parseFloat(String(p.qty || '0')),
    avgEntryPrice: parseFloat(String(p.avg_entry_price || '0')),
    currentPrice: parseFloat(String(p.current_price || '0')),
    marketValue: parseFloat(String(p.market_value || '0')),
    costBasis: parseFloat(String(p.cost_basis || '0')),
    unrealizedPL: parseFloat(String(p.unrealized_pl || '0')),
    unrealizedPLPercent: parseFloat(String(p.unrealized_plpc || '0')),
    unrealizedIntradayPL: parseFloat(String(p.unrealized_intraday_pl || '0')),
  }),
  formatAlpacaOrder: (o: Record<string, unknown>) => ({
    id: o.id,
    clientOrderId: o.client_order_id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    quantity: parseFloat(String(o.qty || '0')),
    filledQuantity: parseFloat(String(o.filled_qty || '0')),
    status: o.status,
    timeInForce: o.time_in_force,
    createdAt: o.created_at,
  }),
}));

const mockCreateManagedPosition = jest.fn();
jest.mock('../../src/lib/trade-manager', () => ({
  createManagedPosition: mockCreateManagedPosition,
}));

const mockCalculateConfidence = jest.fn();
const mockGetSuggestedLevels = jest.fn();
jest.mock('../../src/lib/confidence', () => ({
  calculateConfidence: mockCalculateConfidence,
  getSuggestedLevels: mockGetSuggestedLevels,
}));

const mockLogAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/lib/audit-log', () => ({
  audit: jest.fn(),
  logAudit: mockLogAudit,
}));

// -----------------------------------------------------------------------
// Route imports (after all mocks are declared)
// -----------------------------------------------------------------------

import { GET as killSwitchGET, POST as killSwitchPOST } from '../../src/app/api/kill-switch/route';
import { GET as positionsGET } from '../../src/app/api/positions/route';
import { GET as ordersGET, POST as ordersPOST, DELETE as ordersDELETE } from '../../src/app/api/orders/route';
import { GET as tradeGET, POST as tradePOST } from '../../src/app/api/trade/route';
import { GET as riskGET, PUT as riskPUT } from '../../src/app/api/risk/route';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function unauthenticatedGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function authenticatedGet(url: string, method: 'bearer' | 'x-api-key' = 'bearer'): NextRequest {
  const headers: Record<string, string> = {};
  if (method === 'bearer') {
    headers['Authorization'] = `Bearer ${TEST_API_KEY}`;
  } else {
    headers['X-API-Key'] = TEST_API_KEY;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

function authenticatedPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function unauthenticatedPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function wrongKeyGet(url: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer wrong-key-value' },
  });
}

function authenticatedDelete(url: string): NextRequest {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${TEST_API_KEY}` },
  });
}

function unauthenticatedDelete(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

function authenticatedPut(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function unauthenticatedPut(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('API Authentication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================================
  // Kill Switch – GET
  // =====================================================================
  describe('GET /api/kill-switch', () => {
    beforeEach(() => {
      mockGetRiskConfig.mockResolvedValue({ tradingEnabled: true });
      mockIsKillSwitchActive.mockResolvedValue(false);
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedGet('http://localhost:3000/api/kill-switch');
      const res = await killSwitchGET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong API key', async () => {
      const req = wrongKeyGet('http://localhost:3000/api/kill-switch');
      const res = await killSwitchGET(req);

      expect(res.status).toBe(401);
    });

    it('returns 200 with valid Bearer token', async () => {
      const req = authenticatedGet('http://localhost:3000/api/kill-switch', 'bearer');
      const res = await killSwitchGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        active: false,
        tradingEnabled: true,
        message: 'Kill switch is OFF - trading enabled',
      });
    });

    it('returns 200 with valid X-API-Key header', async () => {
      const req = authenticatedGet('http://localhost:3000/api/kill-switch', 'x-api-key');
      const res = await killSwitchGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('reports kill switch active when state is true', async () => {
      mockIsKillSwitchActive.mockResolvedValue(true);

      const req = authenticatedGet('http://localhost:3000/api/kill-switch');
      const res = await killSwitchGET(req);
      const body = await res.json();

      expect(body.data.active).toBe(true);
      expect(body.data.message).toContain('ACTIVE');
    });

    it('reports kill switch active when trading is disabled', async () => {
      mockGetRiskConfig.mockResolvedValue({ tradingEnabled: false });

      const req = authenticatedGet('http://localhost:3000/api/kill-switch');
      const res = await killSwitchGET(req);
      const body = await res.json();

      expect(body.data.active).toBe(true);
      expect(body.data.tradingEnabled).toBe(false);
    });
  });

  // =====================================================================
  // Kill Switch – POST
  // =====================================================================
  describe('POST /api/kill-switch', () => {
    beforeEach(() => {
      mockGetOrders.mockResolvedValue([]);
      mockCancelAllOrders.mockResolvedValue({ cancelled: 0 });
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedPost('http://localhost:3000/api/kill-switch', {
        action: 'activate',
      });
      const res = await killSwitchPOST(req);

      expect(res.status).toBe(401);
    });

    it('activates kill switch with valid auth', async () => {
      const req = authenticatedPost('http://localhost:3000/api/kill-switch', {
        action: 'activate',
      });
      const res = await killSwitchPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.active).toBe(true);
      expect(body.data.message).toContain('ACTIVATED');
      expect(mockActivateKillSwitch).toHaveBeenCalledTimes(1);
    });

    it('deactivates kill switch with valid auth', async () => {
      const req = authenticatedPost('http://localhost:3000/api/kill-switch', {
        action: 'deactivate',
      });
      const res = await killSwitchPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.active).toBe(false);
      expect(body.data.message).toContain('DEACTIVATED');
      expect(mockDeactivateKillSwitch).toHaveBeenCalledTimes(1);
    });

    it('cancels open orders when activating with cancelOrders=true', async () => {
      mockGetOrders.mockResolvedValue([{ id: 'order-1' }, { id: 'order-2' }]);
      mockCancelAllOrders.mockResolvedValue({ cancelled: 2 });

      const req = authenticatedPost('http://localhost:3000/api/kill-switch', {
        action: 'activate',
        cancelOrders: true,
      });
      const res = await killSwitchPOST(req);
      const body = await res.json();

      expect(body.data.cancelledOrders).toBe(2);
      expect(mockCancelAllOrders).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid action', async () => {
      const req = authenticatedPost('http://localhost:3000/api/kill-switch', {
        action: 'invalid',
      });
      const res = await killSwitchPOST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid action');
    });
  });

  // =====================================================================
  // Positions – GET (uses apiHandler which wraps withAuth)
  // =====================================================================
  describe('GET /api/positions', () => {
    const mockPosition = {
      symbol: 'AAPL',
      qty: '100',
      avg_entry_price: '150.00',
      current_price: '155.00',
      market_value: '15500.00',
      cost_basis: '15000.00',
      unrealized_pl: '500.00',
      unrealized_plpc: '0.0333',
      unrealized_intraday_pl: '200.00',
    };

    beforeEach(() => {
      mockGetPositions.mockResolvedValue([mockPosition]);
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedGet('http://localhost:3000/api/positions');
      const res = await positionsGET(req);

      expect(res.status).toBe(401);
    });

    it('returns positions with valid Bearer auth', async () => {
      const req = authenticatedGet('http://localhost:3000/api/positions', 'bearer');
      const res = await positionsGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(1);
      expect(body.data.positions).toHaveLength(1);
      expect(body.data.positions[0].symbol).toBe('AAPL');
    });

    it('returns positions with valid X-API-Key auth', async () => {
      const req = authenticatedGet('http://localhost:3000/api/positions', 'x-api-key');
      const res = await positionsGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('calculates totals correctly', async () => {
      const secondPosition = {
        symbol: 'MSFT',
        qty: '50',
        avg_entry_price: '400.00',
        current_price: '410.00',
        market_value: '20500.00',
        cost_basis: '20000.00',
        unrealized_pl: '500.00',
        unrealized_plpc: '0.025',
        unrealized_intraday_pl: '100.00',
      };
      mockGetPositions.mockResolvedValue([mockPosition, secondPosition]);

      const req = authenticatedGet('http://localhost:3000/api/positions');
      const res = await positionsGET(req);
      const body = await res.json();

      expect(body.data.count).toBe(2);
      expect(body.data.totals.totalMarketValue).toBe(36000);
      expect(body.data.totals.totalUnrealizedPL).toBe(1000);
    });

    it('handles empty positions', async () => {
      mockGetPositions.mockResolvedValue([]);

      const req = authenticatedGet('http://localhost:3000/api/positions');
      const res = await positionsGET(req);
      const body = await res.json();

      expect(body.data.count).toBe(0);
      expect(body.data.positions).toEqual([]);
      expect(body.data.totals.totalMarketValue).toBe(0);
    });

    it('returns 500 when alpaca call fails (via apiHandler)', async () => {
      mockGetPositions.mockRejectedValue(new Error('Alpaca API down'));

      const req = authenticatedGet('http://localhost:3000/api/positions');
      const res = await positionsGET(req);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Internal server error');
    });
  });

  // =====================================================================
  // Orders – GET / POST / DELETE
  // =====================================================================
  describe('GET /api/orders', () => {
    const mockOrder = {
      id: 'ord-123',
      client_order_id: 'client-456',
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      qty: '10',
      filled_qty: '0',
      status: 'new',
      time_in_force: 'day',
      created_at: '2026-02-04T10:00:00Z',
    };

    beforeEach(() => {
      mockGetOrders.mockResolvedValue([mockOrder]);
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedGet('http://localhost:3000/api/orders');
      const res = await ordersGET(req);

      expect(res.status).toBe(401);
    });

    it('returns open orders with valid auth', async () => {
      const req = authenticatedGet('http://localhost:3000/api/orders');
      const res = await ordersGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(1);
      expect(body.data.orders[0].symbol).toBe('AAPL');
      expect(mockGetOrders).toHaveBeenCalledWith('open');
    });

    it('passes status query parameter through', async () => {
      const req = authenticatedGet('http://localhost:3000/api/orders?status=closed');
      await ordersGET(req);

      expect(mockGetOrders).toHaveBeenCalledWith('closed');
    });

    it('defaults to open status', async () => {
      const req = authenticatedGet('http://localhost:3000/api/orders');
      await ordersGET(req);

      expect(mockGetOrders).toHaveBeenCalledWith('open');
    });
  });

  describe('POST /api/orders', () => {
    const validOrder = {
      symbol: 'AAPL',
      side: 'buy',
      quantity: 10,
      type: 'market',
    };

    const mockOrderResponse = {
      id: 'ord-789',
      client_order_id: 'client-abc',
      symbol: 'AAPL',
      side: 'buy',
      type: 'market',
      qty: '10',
      status: 'accepted',
      submitted_at: '2026-02-04T10:00:00Z',
    };

    beforeEach(() => {
      mockCheckIntent.mockResolvedValue({ approved: true, checks: [] });
      mockSubmitOrder.mockResolvedValue(mockOrderResponse);
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedPost('http://localhost:3000/api/orders', validOrder);
      const res = await ordersPOST(req);

      expect(res.status).toBe(401);
    });

    it('submits market order with valid auth', async () => {
      const req = authenticatedPost('http://localhost:3000/api/orders', validOrder);
      const res = await ordersPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('ord-789');
      expect(body.data.symbol).toBe('AAPL');
      expect(body.data.quantity).toBe(10);
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    });

    it('runs risk checks before submitting', async () => {
      const req = authenticatedPost('http://localhost:3000/api/orders', validOrder);
      await ordersPOST(req);

      expect(mockCheckIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
        })
      );
    });

    it('returns 403 when risk check rejects order', async () => {
      mockCheckIntent.mockResolvedValue({
        approved: false,
        reason: 'Daily loss limit exceeded',
        checks: [{ name: 'daily_loss', passed: false }],
      });

      const req = authenticatedPost('http://localhost:3000/api/orders', validOrder);
      const res = await ordersPOST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toContain('risk engine');
      expect(body.reason).toBe('Daily loss limit exceeded');
      expect(mockSubmitOrder).not.toHaveBeenCalled();
    });

    it('rejects missing symbol', async () => {
      const req = authenticatedPost('http://localhost:3000/api/orders', {
        side: 'buy',
        quantity: 10,
        type: 'market',
      });
      const res = await ordersPOST(req);

      expect(res.status).toBe(400);
    });

    it('rejects invalid side', async () => {
      const req = authenticatedPost('http://localhost:3000/api/orders', {
        symbol: 'AAPL',
        side: 'hold',
        quantity: 10,
        type: 'market',
      });
      const res = await ordersPOST(req);

      expect(res.status).toBe(400);
    });

    it('rejects limit order without limitPrice', async () => {
      const req = authenticatedPost('http://localhost:3000/api/orders', {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        type: 'limit',
      });
      const res = await ordersPOST(req);

      expect(res.status).toBe(400);
    });

    it('accepts limit order with limitPrice', async () => {
      mockSubmitOrder.mockResolvedValue({
        ...mockOrderResponse,
        type: 'limit',
      });

      const req = authenticatedPost('http://localhost:3000/api/orders', {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        type: 'limit',
        limitPrice: 150.00,
      });
      const res = await ordersPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /api/orders', () => {
    it('returns 401 without auth header', async () => {
      const req = unauthenticatedDelete('http://localhost:3000/api/orders?id=ord-123');
      const res = await ordersDELETE(req);

      expect(res.status).toBe(401);
    });

    it('cancels order with valid auth', async () => {
      mockCancelOrder.mockResolvedValue({});

      const req = authenticatedDelete('http://localhost:3000/api/orders?id=ord-123');
      const res = await ordersDELETE(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toContain('ord-123');
      expect(mockCancelOrder).toHaveBeenCalledWith('ord-123');
    });

    it('returns 400 without order ID', async () => {
      const req = authenticatedDelete('http://localhost:3000/api/orders');
      const res = await ordersDELETE(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain('Order ID required');
    });
  });

  // =====================================================================
  // Trade – GET (confidence preview) / POST (place trade)
  // =====================================================================
  describe('GET /api/trade', () => {
    beforeEach(() => {
      mockCalculateConfidence.mockResolvedValue({ score: 7, regime: 'TREND' });
      mockGetSuggestedLevels.mockResolvedValue({
        takeProfit: 3.0,
        stopLoss: 1.5,
        trailingStop: 0.5,
      });
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedGet('http://localhost:3000/api/trade?symbol=AAPL');
      const res = await tradeGET(req);

      expect(res.status).toBe(401);
    });

    it('returns confidence preview with valid auth', async () => {
      const req = authenticatedGet('http://localhost:3000/api/trade?symbol=AAPL&side=buy&entryPrice=150');
      const res = await tradeGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.symbol).toBe('AAPL');
      expect(body.side).toBe('buy');
      expect(body.entryPrice).toBe(150);
      expect(body.confidence.score).toBe(7);
      expect(body.suggestedLevels).toBeDefined();
    });

    it('defaults side to buy and entryPrice to 100', async () => {
      const req = authenticatedGet('http://localhost:3000/api/trade?symbol=TSLA');
      const res = await tradeGET(req);
      const body = await res.json();

      expect(body.side).toBe('buy');
      expect(body.entryPrice).toBe(100);
    });

    it('returns 400 without symbol', async () => {
      const req = authenticatedGet('http://localhost:3000/api/trade');
      const res = await tradeGET(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain('Symbol is required');
    });

    it('uppercases symbol', async () => {
      const req = authenticatedGet('http://localhost:3000/api/trade?symbol=aapl');
      await tradeGET(req);

      expect(mockCalculateConfidence).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL' })
      );
    });
  });

  describe('POST /api/trade', () => {
    const validTrade = {
      symbol: 'NVDA',
      side: 'buy',
      quantity: 5,
      entryPrice: 800,
    };

    beforeEach(() => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: false,
        position: { id: 'pos-1', symbol: 'NVDA', side: 'buy', quantity: 5 },
        confidence: { score: 8 },
      });
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedPost('http://localhost:3000/api/trade', validTrade);
      const res = await tradePOST(req);

      expect(res.status).toBe(401);
    });

    it('places trade with valid auth', async () => {
      const req = authenticatedPost('http://localhost:3000/api/trade', validTrade);
      const res = await tradePOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.skipped).toBe(false);
      expect(body.position.symbol).toBe('NVDA');
      expect(body.confidence.score).toBe(8);
    });

    it('returns skipped result when confidence is low', async () => {
      mockCreateManagedPosition.mockResolvedValue({
        skipped: true,
        reason: 'Confidence too low',
        confidence: { score: 2 },
      });

      const req = authenticatedPost('http://localhost:3000/api/trade', validTrade);
      const res = await tradePOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.skipped).toBe(true);
      expect(body.reason).toBe('Confidence too low');
    });

    it('rejects missing required fields', async () => {
      const req = authenticatedPost('http://localhost:3000/api/trade', {
        symbol: 'AAPL',
        // missing side, quantity, entryPrice
      });
      const res = await tradePOST(req);

      expect(res.status).toBe(400);
    });

    it('uppercases symbol in trade request', async () => {
      const req = authenticatedPost('http://localhost:3000/api/trade', {
        ...validTrade,
        symbol: 'nvda',
      });
      await tradePOST(req);

      expect(mockCreateManagedPosition).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'NVDA' })
      );
    });
  });

  // =====================================================================
  // Risk – GET / PUT
  // =====================================================================
  describe('GET /api/risk', () => {
    const mockConfig = {
      maxPositionSize: 100,
      maxOrderSize: 50,
      maxDailyLoss: 500,
      tradingEnabled: true,
      allowedSymbols: [],
    };

    const mockHeadroom = {
      tradingEnabled: true,
      dailyLossUsed: 100,
      dailyLossRemaining: 400,
      positionsUsed: 3,
      positionsRemaining: 7,
    };

    beforeEach(() => {
      mockGetRiskConfig.mockResolvedValue(mockConfig);
      mockGetRiskHeadroom.mockResolvedValue(mockHeadroom);
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedGet('http://localhost:3000/api/risk');
      const res = await riskGET(req);

      expect(res.status).toBe(401);
    });

    it('returns risk config and headroom with valid auth', async () => {
      const req = authenticatedGet('http://localhost:3000/api/risk');
      const res = await riskGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.config).toEqual(mockConfig);
      expect(body.data.headroom).toEqual(mockHeadroom);
      expect(body.data.status).toBe('ACTIVE');
    });

    it('reports DISABLED status when trading is off', async () => {
      mockGetRiskHeadroom.mockResolvedValue({ ...mockHeadroom, tradingEnabled: false });

      const req = authenticatedGet('http://localhost:3000/api/risk');
      const res = await riskGET(req);
      const body = await res.json();

      expect(body.data.status).toBe('DISABLED');
    });
  });

  describe('PUT /api/risk', () => {
    beforeEach(() => {
      mockUpdateRiskConfig.mockResolvedValue({
        maxPositionSize: 200,
        maxOrderSize: 50,
        maxDailyLoss: 500,
        tradingEnabled: true,
      });
    });

    it('returns 401 without auth header', async () => {
      const req = unauthenticatedPut('http://localhost:3000/api/risk', {
        maxPositionSize: 200,
      });
      const res = await riskPUT(req);

      expect(res.status).toBe(401);
    });

    it('updates risk config with valid auth', async () => {
      const req = authenticatedPut('http://localhost:3000/api/risk', {
        maxPositionSize: 200,
      });
      const res = await riskPUT(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockUpdateRiskConfig).toHaveBeenCalledWith(
        expect.objectContaining({ maxPositionSize: 200 })
      );
    });

    it('logs audit trail on config change', async () => {
      const req = authenticatedPut('http://localhost:3000/api/risk', {
        tradingEnabled: false,
      });
      await riskPUT(req);

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONFIG_CHANGED',
          details: expect.objectContaining({
            configType: 'risk',
          }),
        })
      );
    });

    it('rejects invalid maxPositionSize', async () => {
      const req = authenticatedPut('http://localhost:3000/api/risk', {
        maxPositionSize: -5,
      });
      const res = await riskPUT(req);

      expect(res.status).toBe(400);
    });

    it('rejects non-array allowedSymbols', async () => {
      const req = authenticatedPut('http://localhost:3000/api/risk', {
        allowedSymbols: 'AAPL',
      });
      const res = await riskPUT(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain('array');
    });

    it('rejects non-boolean tradingEnabled', async () => {
      const req = authenticatedPut('http://localhost:3000/api/risk', {
        tradingEnabled: 'yes',
      });
      const res = await riskPUT(req);

      expect(res.status).toBe(400);
    });
  });
});
