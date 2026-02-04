/**
 * Tests for OPTIONS /api/options/positions/close endpoint
 */

import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/options/positions/close/route';

// Mock dependencies
jest.mock('../../src/lib/alpaca-options', () => ({
  closeOptionsPosition: jest.fn(),
  parseOptionSymbol: jest.fn(),
  getClosingSide: jest.fn(),
}));

jest.mock('../../src/lib/api-auth', () => ({
  withAuth: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

jest.mock('../../src/lib/audit-log', () => ({
  audit: {
    orderSubmitted: jest.fn(),
  },
}));

import { closeOptionsPosition, parseOptionSymbol, getClosingSide } from '../../src/lib/alpaca-options';

const mockCloseOptionsPosition = closeOptionsPosition as jest.Mock;
const mockParseOptionSymbol = parseOptionSymbol as jest.Mock;
const mockGetClosingSide = getClosingSide as jest.Mock;

describe('POST /api/options/positions/close', () => {
  const validSymbol = 'AAPL240119C00150000';
  const parsedSymbol = {
    rootSymbol: 'AAPL',
    expirationDate: '2024-01-19',
    type: 'call',
    strikePrice: 150,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParseOptionSymbol.mockReturnValue(parsedSymbol);
    mockGetClosingSide.mockReturnValue('sell');
    mockCloseOptionsPosition.mockResolvedValue({
      id: 'order-123',
      symbol: validSymbol,
      status: 'pending_new',
    });
  });

  function createRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/options/positions/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('should close a long position successfully', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 2,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.order).toBeDefined();
    expect(data.data.closingSide).toBe('sell');
    expect(mockCloseOptionsPosition).toHaveBeenCalledWith({
      symbol: validSymbol,
      quantity: 2,
      currentSide: 'long',
      orderType: 'market',
      limitPrice: undefined,
    });
  });

  it('should close a short position with buy order', async () => {
    mockGetClosingSide.mockReturnValue('buy');
    
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'short',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.closingSide).toBe('buy');
  });

  it('should support limit orders', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
      orderType: 'limit',
      limitPrice: 2.50,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockCloseOptionsPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: 'limit',
        limitPrice: 2.50,
      })
    );
  });

  it('should reject missing symbol', async () => {
    const req = createRequest({
      quantity: 1,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('symbol');
  });

  it('should reject invalid symbol format', async () => {
    mockParseOptionSymbol.mockReturnValue(null);

    const req = createRequest({
      symbol: 'INVALID',
      quantity: 1,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid option symbol');
  });

  it('should reject missing quantity', async () => {
    const req = createRequest({
      symbol: validSymbol,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('quantity');
  });

  it('should reject non-integer quantity', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1.5,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject negative quantity', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: -1,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject invalid currentSide', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'invalid',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('currentSide');
  });

  it('should reject missing currentSide', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject invalid orderType', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
      orderType: 'stop',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('orderType');
  });

  it('should reject limit order without price', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
      orderType: 'limit',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Limit price');
  });

  it('should reject limit order with zero price', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
      orderType: 'limit',
      limitPrice: 0,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should handle close position API error', async () => {
    mockCloseOptionsPosition.mockRejectedValue(new Error('Broker unavailable'));

    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Broker unavailable');
  });

  it('should return parsed option details', async () => {
    const req = createRequest({
      symbol: validSymbol,
      quantity: 1,
      currentSide: 'long',
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
});
