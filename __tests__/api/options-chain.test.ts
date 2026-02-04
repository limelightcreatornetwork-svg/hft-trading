/**
 * Tests for OPTIONS /api/options/chain endpoint
 */

import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/options/chain/route';

// Mock dependencies
jest.mock('../../src/lib/alpaca-options', () => ({
  getOptionsContracts: jest.fn(),
  getOptionsSnapshots: jest.fn(),
}));

import { getOptionsContracts, getOptionsSnapshots } from '../../src/lib/alpaca-options';

const mockGetOptionsContracts = getOptionsContracts as jest.Mock;
const mockGetOptionsSnapshots = getOptionsSnapshots as jest.Mock;

describe('GET /api/options/chain', () => {
  const mockContracts = [
    {
      symbol: 'AAPL240119C00150000',
      name: 'AAPL Jan 19 2024 $150 Call',
      expiration_date: '2024-01-19',
      strike_price: '150',
      type: 'call',
      open_interest: '5000',
      close_price: '2.50',
    },
    {
      symbol: 'AAPL240119P00150000',
      name: 'AAPL Jan 19 2024 $150 Put',
      expiration_date: '2024-01-19',
      strike_price: '150',
      type: 'put',
      open_interest: '3000',
      close_price: '1.80',
    },
    {
      symbol: 'AAPL240119C00155000',
      name: 'AAPL Jan 19 2024 $155 Call',
      expiration_date: '2024-01-19',
      strike_price: '155',
      type: 'call',
      open_interest: '2500',
      close_price: '1.20',
    },
  ];

  const mockSnapshots = {
    'AAPL240119C00150000': {
      latestQuote: {
        bid_price: 2.45,
        ask_price: 2.55,
        last_price: 2.50,
      },
      greeks: {
        delta: 0.55,
        gamma: 0.02,
        theta: -0.05,
        vega: 0.15,
        implied_volatility: 0.35,
      },
    },
    'AAPL240119P00150000': {
      latestQuote: {
        bid_price: 1.75,
        ask_price: 1.85,
        last_price: 1.80,
      },
      greeks: {
        delta: -0.45,
        gamma: 0.02,
        theta: -0.04,
        vega: 0.14,
        implied_volatility: 0.33,
      },
    },
    'AAPL240119C00155000': {
      latestQuote: {
        bid_price: 1.15,
        ask_price: 1.25,
        last_price: 1.20,
      },
      greeks: {
        delta: 0.40,
        gamma: 0.025,
        theta: -0.06,
        vega: 0.12,
        implied_volatility: 0.32,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOptionsContracts.mockResolvedValue({
      option_contracts: mockContracts,
      next_page_token: null,
    });
    mockGetOptionsSnapshots.mockResolvedValue(mockSnapshots);
  });

  function createRequest(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);
    return new NextRequest(`http://localhost/api/options/chain?${searchParams.toString()}`);
  }

  describe('Basic Functionality', () => {
    it('should fetch options chain for a symbol', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('AAPL');
      expect(data.data.chain).toHaveLength(3);
      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          underlying_symbol: 'AAPL',
        })
      );
    });

    it('should uppercase the symbol', async () => {
      const req = createRequest({ symbol: 'aapl' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          underlying_symbol: 'AAPL',
        })
      );
    });

    it('should return unique expirations sorted', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.expirations).toEqual(['2024-01-19']);
    });

    it('should return unique strikes sorted', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.strikes).toEqual([150, 155]);
    });
  });

  describe('Filtering', () => {
    it('should filter by expiration', async () => {
      const req = createRequest({ symbol: 'AAPL', expiration: '2024-01-19' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          expiration_date: '2024-01-19',
        })
      );
    });

    it('should filter by type (call)', async () => {
      const req = createRequest({ symbol: 'AAPL', type: 'call' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'call',
        })
      );
    });

    it('should filter by type (put)', async () => {
      const req = createRequest({ symbol: 'AAPL', type: 'put' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'put',
        })
      );
    });

    it('should filter by min strike', async () => {
      const req = createRequest({ symbol: 'AAPL', minStrike: '150' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          strike_price_gte: 150,
        })
      );
    });

    it('should filter by max strike', async () => {
      const req = createRequest({ symbol: 'AAPL', maxStrike: '160' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          strike_price_lte: 160,
        })
      );
    });

    it('should respect limit parameter', async () => {
      const req = createRequest({ symbol: 'AAPL', limit: '100' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });
  });

  describe('Response Formatting', () => {
    it('should format contract data correctly', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      const callContract = data.data.chain.find(
        (c: { contract: { type: string; strike: number } }) => 
          c.contract.type === 'call' && c.contract.strike === 150
      );

      expect(callContract.contract).toEqual({
        symbol: 'AAPL240119C00150000',
        name: 'AAPL Jan 19 2024 $150 Call',
        expiration: '2024-01-19',
        strike: 150,
        type: 'call',
        openInterest: 5000,
      });
    });

    it('should format quote data correctly', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      const callContract = data.data.chain.find(
        (c: { contract: { type: string; strike: number } }) => 
          c.contract.type === 'call' && c.contract.strike === 150
      );

      expect(callContract.quote.bid).toBe(2.45);
      expect(callContract.quote.ask).toBe(2.55);
      expect(callContract.quote.last).toBe(2.50);
      expect(callContract.quote.spread).toBeCloseTo(0.10, 2);
    });

    it('should format greeks correctly', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      const callContract = data.data.chain.find(
        (c: { contract: { type: string; strike: number } }) => 
          c.contract.type === 'call' && c.contract.strike === 150
      );

      expect(callContract.greeks).toEqual({
        delta: 0.55,
        gamma: 0.02,
        theta: -0.05,
        vega: 0.15,
        iv: 0.35,
      });
    });

    it('should include pagination token when present', async () => {
      mockGetOptionsContracts.mockResolvedValue({
        option_contracts: mockContracts,
        next_page_token: 'next-page-123',
      });

      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.nextPageToken).toBe('next-page-123');
    });
  });

  describe('Error Handling', () => {
    it('should require symbol parameter', async () => {
      const req = createRequest({});
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Symbol is required');
    });

    it('should handle contract API errors', async () => {
      mockGetOptionsContracts.mockRejectedValue(new Error('API unavailable'));

      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it('should gracefully handle snapshot API errors', async () => {
      mockGetOptionsSnapshots.mockRejectedValue(new Error('Snapshot unavailable'));

      const req = createRequest({ symbol: 'AAPL' });
      const res = await GET(req);
      const data = await res.json();

      // Should still return contracts without quotes/greeks
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.chain).toHaveLength(3);
      // Quotes and greeks will be null
      data.data.chain.forEach((entry: { quote: null; greeks: null }) => {
        expect(entry.quote).toBeNull();
        expect(entry.greeks).toBeNull();
      });
    });

    it('should handle empty contracts response', async () => {
      mockGetOptionsContracts.mockResolvedValue({
        option_contracts: [],
        next_page_token: null,
      });

      const req = createRequest({ symbol: 'UNKNOWN' });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.chain).toHaveLength(0);
      expect(data.data.count).toBe(0);
    });
  });

  describe('Default Filtering', () => {
    it('should only fetch future expirations by default', async () => {
      const req = createRequest({ symbol: 'AAPL' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          expiration_date_gte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        })
      );
    });

    it('should not set expiration_date_gte when specific expiration provided', async () => {
      const req = createRequest({ symbol: 'AAPL', expiration: '2024-01-19' });
      await GET(req);

      expect(mockGetOptionsContracts).toHaveBeenCalledWith(
        expect.objectContaining({
          expiration_date: '2024-01-19',
          expiration_date_gte: undefined,
        })
      );
    });
  });

  describe('Snapshot Batching', () => {
    it('should batch snapshot requests for large chains', async () => {
      // Create 150 mock contracts to trigger batching
      const manyContracts = Array.from({ length: 150 }, (_, i) => ({
        symbol: `AAPL240119C00${(100 + i).toString().padStart(3, '0')}000`,
        name: `AAPL Contract ${i}`,
        expiration_date: '2024-01-19',
        strike_price: String(100 + i),
        type: 'call',
        open_interest: '100',
        close_price: '1.00',
      }));

      mockGetOptionsContracts.mockResolvedValue({
        option_contracts: manyContracts,
        next_page_token: null,
      });

      const req = createRequest({ symbol: 'AAPL' });
      await GET(req);

      // Should be called twice for 150 contracts (batches of 100)
      expect(mockGetOptionsSnapshots).toHaveBeenCalledTimes(2);
    });
  });
});
