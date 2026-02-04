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
const mockIsKillSwitchActive = jest.fn();
const mockActivateKillSwitch = jest.fn();
const mockDeactivateKillSwitch = jest.fn();
jest.mock('../../src/lib/risk-engine', () => ({
  getRiskConfig: mockGetRiskConfig,
  isKillSwitchActive: mockIsKillSwitchActive,
  activateKillSwitch: mockActivateKillSwitch,
  deactivateKillSwitch: mockDeactivateKillSwitch,
}));

const mockGetOrders = jest.fn();
const mockCancelAllOrders = jest.fn();
const mockGetPositions = jest.fn();
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  getOrders: mockGetOrders,
  cancelAllOrders: mockCancelAllOrders,
  getPositions: mockGetPositions,
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
}));

jest.mock('../../src/lib/audit-log', () => ({
  audit: jest.fn(),
}));

// -----------------------------------------------------------------------
// Route imports (after all mocks are declared)
// -----------------------------------------------------------------------

import { GET as killSwitchGET, POST as killSwitchPOST } from '../../src/app/api/kill-switch/route';
import { GET as positionsGET } from '../../src/app/api/positions/route';

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
});
