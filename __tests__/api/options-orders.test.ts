/**
 * Tests for OPTIONS /api/options/orders endpoint
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '../../src/app/api/options/orders/route';

// Mock dependencies
jest.mock('../../src/lib/alpaca-options', () => ({
  submitOptionsOrder: jest.fn(),
  parseOptionSymbol: jest.fn(),
  canSellCoveredCall: jest.fn(),
  canSellCashSecuredPut: jest.fn(),
  closeOptionsPosition: jest.fn(),
  getClosingSide: jest.fn(),
}));

jest.mock('../../src/lib/alpaca', () => ({
  getPositions: jest.fn(),
  getAccount: jest.fn(),
}));

jest.mock('../../src/lib/api-auth', () => ({
  withAuth: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

jest.mock('../../src/lib/audit-log', () => ({
  audit: {
    orderSubmitted: jest.fn(),
  },
}));

import { submitOptionsOrder, parseOptionSymbol, canSellCoveredCall, canSellCashSecuredPut } from '../../src/lib/alpaca-options';
import { getPositions, getAccount } from '../../src/lib/alpaca';

const mockSubmitOptionsOrder = submitOptionsOrder as jest.Mock;
const mockParseOptionSymbol = parseOptionSymbol as jest.Mock;
const mockCanSellCoveredCall = canSellCoveredCall as jest.Mock;
const mockCanSellCashSecuredPut = canSellCashSecuredPut as jest.Mock;
const mockGetPositions = getPositions as jest.Mock;
const mockGetAccount = getAccount as jest.Mock;

describe('POST /api/options/orders', () => {
  const validCallSymbol = 'AAPL240119C00150000';
  const validPutSymbol = 'AAPL240119P00150000';
  const parsedCall = {
    rootSymbol: 'AAPL',
    expirationDate: '2024-01-19',
    type: 'call',
    strikePrice: 150,
  };
  const parsedPut = {
    rootSymbol: 'AAPL',
    expirationDate: '2024-01-19',
    type: 'put',
    strikePrice: 150,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParseOptionSymbol.mockImplementation((symbol: string) => {
      if (symbol === validCallSymbol) return parsedCall;
      if (symbol === validPutSymbol) return parsedPut;
      return null;
    });
    mockSubmitOptionsOrder.mockResolvedValue({
      id: 'order-123',
      symbol: validCallSymbol,
      status: 'pending_new',
      qty: '1',
      side: 'buy',
    });
    mockGetPositions.mockResolvedValue([{ symbol: 'AAPL', qty: '200' }]);
    mockGetAccount.mockResolvedValue({ buying_power: '50000' });
    mockCanSellCoveredCall.mockReturnValue({ allowed: true, availableShares: 200 });
    mockCanSellCashSecuredPut.mockReturnValue({ allowed: true, requiredCash: 15000 });
  });

  function createRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/options/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('Buy Orders', () => {
    it('should submit a buy order successfully', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 2,
        type: 'limit',
        limitPrice: 2.50,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.order).toBeDefined();
      expect(mockSubmitOptionsOrder).toHaveBeenCalledWith({
        symbol: validCallSymbol,
        qty: 2,
        side: 'buy',
        type: 'limit',
        time_in_force: 'day',
        limit_price: 2.50,
      });
    });

    it('should handle buy without Level 1 validation', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.00,
      });

      await POST(req);

      // Buy orders don't require Level 1 validation
      expect(mockGetPositions).not.toHaveBeenCalled();
      expect(mockGetAccount).not.toHaveBeenCalled();
    });
  });

  describe('Covered Call Validation', () => {
    it('should validate covered call (sell call)', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 3.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockCanSellCoveredCall).toHaveBeenCalled();
    });

    it('should reject uncovered call', async () => {
      mockCanSellCoveredCall.mockReturnValue({
        allowed: false,
        reason: 'Insufficient shares. Need 100, have 0',
        availableShares: 0,
      });

      const req = createRequest({
        symbol: validCallSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 3.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Covered call');
    });
  });

  describe('Cash-Secured Put Validation', () => {
    it('should validate cash-secured put', async () => {
      const req = createRequest({
        symbol: validPutSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 2.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockCanSellCashSecuredPut).toHaveBeenCalled();
    });

    it('should reject cash-secured put without buying power', async () => {
      mockCanSellCashSecuredPut.mockReturnValue({
        allowed: false,
        reason: 'Insufficient buying power',
        requiredCash: 15000,
      });

      const req = createRequest({
        symbol: validPutSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 2.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Cash-secured put');
    });
  });

  describe('Skip Validation', () => {
    it('should skip validation when skipValidation is true', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 3.00,
        skipValidation: true,
      });

      await POST(req);

      expect(mockGetPositions).not.toHaveBeenCalled();
      expect(mockCanSellCoveredCall).not.toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should reject missing symbol', async () => {
      const req = createRequest({
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('symbol');
    });

    it('should reject invalid symbol format', async () => {
      const req = createRequest({
        symbol: 'INVALID',
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid option symbol');
    });

    it('should reject invalid side', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'invalid',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject missing quantity', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        type: 'limit',
        limitPrice: 1.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject negative quantity', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: -1,
        type: 'limit',
        limitPrice: 1.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject limit order without price', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Limit price');
    });
  });

  describe('Response Data', () => {
    it('should return parsed option details', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.50,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.parsed).toEqual({
        underlying: 'AAPL',
        expiration: '2024-01-19',
        type: 'call',
        strike: 150,
      });
    });

    it('should return strategy name for covered call', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 3.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.strategy).toBe('covered_call');
    });

    it('should return strategy name for cash-secured put', async () => {
      const req = createRequest({
        symbol: validPutSymbol,
        side: 'sell',
        quantity: 1,
        type: 'limit',
        limitPrice: 2.00,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.strategy).toBe('cash_secured_put');
    });

    it('should return strategy name for buy option', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.50,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.strategy).toBe('buy_option');
    });

    it('should use custom strategy if provided', async () => {
      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.50,
        strategy: 'bull_call_spread',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.strategy).toBe('bull_call_spread');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSubmitOptionsOrder.mockRejectedValue(new Error('Broker unavailable'));

      const req = createRequest({
        symbol: validCallSymbol,
        side: 'buy',
        quantity: 1,
        type: 'limit',
        limitPrice: 1.50,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });
});

describe('GET /api/options/orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseOptionSymbol.mockImplementation((symbol: string) => {
      if (symbol.match(/^[A-Z]+\d{6}[CP]\d{8}$/)) {
        return {
          rootSymbol: symbol.slice(0, -15),
          expirationDate: '2024-01-19',
          type: symbol.includes('C') ? 'call' : 'put',
          strikePrice: 150,
        };
      }
      return null;
    });
  });

  // Mock fetch for this test
  const originalFetch = global.fetch;
  
  beforeAll(() => {
    global.fetch = jest.fn();
  });
  
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should fetch open options orders', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'order-1',
          client_order_id: 'client-1',
          symbol: 'AAPL240119C00150000',
          qty: '2',
          filled_qty: '0',
          type: 'limit',
          side: 'buy',
          limit_price: '2.50',
          filled_avg_price: null,
          status: 'open',
          created_at: '2024-01-15T10:00:00Z',
          submitted_at: '2024-01-15T10:00:00Z',
          filled_at: null,
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/options/orders?status=open');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.orders).toHaveLength(1);
    expect(data.data.orders[0].symbol).toBe('AAPL240119C00150000');
  });

  it('should filter out non-option orders', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'order-1',
          client_order_id: 'client-1',
          symbol: 'AAPL240119C00150000', // Option
          qty: '1',
          filled_qty: '0',
          type: 'limit',
          side: 'buy',
          limit_price: '1.00',
          filled_avg_price: null,
          status: 'open',
          created_at: '2024-01-15T10:00:00Z',
          submitted_at: '2024-01-15T10:00:00Z',
          filled_at: null,
        },
        {
          id: 'order-2',
          client_order_id: 'client-2',
          symbol: 'AAPL', // Stock, should be filtered
          qty: '100',
          filled_qty: '0',
          type: 'limit',
          side: 'buy',
          limit_price: '150.00',
          filled_avg_price: null,
          status: 'open',
          created_at: '2024-01-15T10:00:00Z',
          submitted_at: '2024-01-15T10:00:00Z',
          filled_at: null,
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/options/orders');
    const res = await GET(req);
    const data = await res.json();

    expect(data.data.orders).toHaveLength(1);
    expect(data.data.orders[0].symbol).toBe('AAPL240119C00150000');
  });

  it('should format order response correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'order-1',
          client_order_id: 'client-1',
          symbol: 'AAPL240119C00150000',
          qty: '2',
          filled_qty: '1',
          type: 'limit',
          side: 'buy',
          limit_price: '2.50',
          filled_avg_price: '2.45',
          status: 'partially_filled',
          created_at: '2024-01-15T10:00:00Z',
          submitted_at: '2024-01-15T10:00:01Z',
          filled_at: null,
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/options/orders');
    const res = await GET(req);
    const data = await res.json();

    const order = data.data.orders[0];
    expect(order.id).toBe('order-1');
    expect(order.quantity).toBe(2);
    expect(order.filledQuantity).toBe(1);
    expect(order.limitPrice).toBe(2.50);
    expect(order.filledAvgPrice).toBe(2.45);
    expect(order.underlying).toBeDefined();
  });

  it('should handle API errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      statusText: 'Service Unavailable',
    });

    const req = new NextRequest('http://localhost/api/options/orders');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
