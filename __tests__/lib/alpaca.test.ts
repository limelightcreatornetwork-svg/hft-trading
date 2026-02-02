/**
 * Tests for Alpaca API Client
 */

// Mock the env module before importing alpaca
jest.mock('../../src/lib/env', () => ({
  alpacaConfig: {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    isPaper: true,
    baseUrl: 'https://paper-api.alpaca.markets',
  },
}));

// Mock Alpaca SDK
const mockAlpaca = {
  getAccount: jest.fn(),
  getPositions: jest.fn(),
  getOrders: jest.fn(),
  createOrder: jest.fn(),
  cancelOrder: jest.fn(),
  cancelAllOrders: jest.fn(),
  getLatestQuote: jest.fn(),
  getClock: jest.fn(),
};

jest.mock('@alpacahq/alpaca-trade-api', () => {
  return jest.fn().mockImplementation(() => mockAlpaca);
});

import {
  getAccount,
  getPositions,
  getOrders,
  submitOrder,
  cancelOrder,
  cancelAllOrders,
  getLatestQuote,
  isMarketOpen,
  AlpacaAccount,
  AlpacaPosition,
  AlpacaOrder,
} from '../../src/lib/alpaca';

describe('Alpaca API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAccount', () => {
    const mockAccount: AlpacaAccount = {
      id: 'account-123',
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
      daytrade_count: 0,
      pattern_day_trader: false,
    };

    it('should return account information', async () => {
      mockAlpaca.getAccount.mockResolvedValue(mockAccount);

      const result = await getAccount();

      expect(result).toEqual(mockAccount);
      expect(mockAlpaca.getAccount).toHaveBeenCalledTimes(1);
    });

    it('should throw error when API fails', async () => {
      const error = new Error('API error');
      mockAlpaca.getAccount.mockRejectedValue(error);

      await expect(getAccount()).rejects.toThrow('API error');
    });
  });

  describe('getPositions', () => {
    const mockPositions: AlpacaPosition[] = [
      {
        asset_id: 'asset-1',
        symbol: 'AAPL',
        exchange: 'NASDAQ',
        asset_class: 'us_equity',
        qty: '100',
        avg_entry_price: '150.00',
        side: 'long',
        market_value: '15500.00',
        cost_basis: '15000.00',
        unrealized_pl: '500.00',
        unrealized_plpc: '0.0333',
        unrealized_intraday_pl: '100.00',
        unrealized_intraday_plpc: '0.0065',
        current_price: '155.00',
        lastday_price: '154.00',
        change_today: '0.0065',
      },
    ];

    it('should return all positions', async () => {
      mockAlpaca.getPositions.mockResolvedValue(mockPositions);

      const result = await getPositions();

      expect(result).toEqual(mockPositions);
      expect(mockAlpaca.getPositions).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no positions', async () => {
      mockAlpaca.getPositions.mockResolvedValue([]);

      const result = await getPositions();

      expect(result).toEqual([]);
    });

    it('should throw error when API fails', async () => {
      mockAlpaca.getPositions.mockRejectedValue(new Error('Network error'));

      await expect(getPositions()).rejects.toThrow('Network error');
    });
  });

  describe('getOrders', () => {
    const mockOrders: AlpacaOrder[] = [
      {
        id: 'order-1',
        client_order_id: 'client-order-1',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        submitted_at: '2024-01-15T10:00:00Z',
        filled_at: null,
        expired_at: null,
        canceled_at: null,
        failed_at: null,
        asset_id: 'asset-1',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        qty: '10',
        filled_qty: '0',
        type: 'limit',
        side: 'buy',
        time_in_force: 'day',
        limit_price: '150.00',
        stop_price: null,
        filled_avg_price: null,
        status: 'new',
        extended_hours: false,
        legs: null,
        trail_price: null,
        trail_percent: null,
      },
    ];

    it('should return open orders by default', async () => {
      mockAlpaca.getOrders.mockResolvedValue(mockOrders);

      const result = await getOrders();

      expect(result).toEqual(mockOrders);
      expect(mockAlpaca.getOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open', limit: 100 })
      );
    });

    it('should return closed orders when specified', async () => {
      mockAlpaca.getOrders.mockResolvedValue([]);

      await getOrders('closed');

      expect(mockAlpaca.getOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'closed' })
      );
    });

    it('should return all orders when specified', async () => {
      mockAlpaca.getOrders.mockResolvedValue(mockOrders);

      await getOrders('all');

      expect(mockAlpaca.getOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'all' })
      );
    });

    it('should throw error when API fails', async () => {
      mockAlpaca.getOrders.mockRejectedValue(new Error('Unauthorized'));

      await expect(getOrders()).rejects.toThrow('Unauthorized');
    });
  });

  describe('submitOrder', () => {
    const mockSubmittedOrder: AlpacaOrder = {
      id: 'order-new',
      client_order_id: 'my-order',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      submitted_at: '2024-01-15T10:00:00Z',
      filled_at: null,
      expired_at: null,
      canceled_at: null,
      failed_at: null,
      asset_id: 'asset-1',
      symbol: 'AAPL',
      asset_class: 'us_equity',
      qty: '10',
      filled_qty: '0',
      type: 'market',
      side: 'buy',
      time_in_force: 'day',
      limit_price: null,
      stop_price: null,
      filled_avg_price: null,
      status: 'accepted',
      extended_hours: false,
      legs: null,
      trail_price: null,
      trail_percent: null,
    };

    it('should submit a market order', async () => {
      mockAlpaca.createOrder.mockResolvedValue(mockSubmittedOrder);

      const result = await submitOrder({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      });

      expect(result).toEqual(mockSubmittedOrder);
      expect(mockAlpaca.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        limit_price: undefined,
        stop_price: undefined,
        extended_hours: undefined,
        client_order_id: undefined,
      });
    });

    it('should submit a limit order with price', async () => {
      mockAlpaca.createOrder.mockResolvedValue({
        ...mockSubmittedOrder,
        type: 'limit',
        limit_price: '150.00',
      });

      await submitOrder({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'limit',
        time_in_force: 'gtc',
        limit_price: 150.0,
      });

      expect(mockAlpaca.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'limit',
          limit_price: 150.0,
          time_in_force: 'gtc',
        })
      );
    });

    it('should submit sell order', async () => {
      mockAlpaca.createOrder.mockResolvedValue({
        ...mockSubmittedOrder,
        side: 'sell',
      });

      await submitOrder({
        symbol: 'AAPL',
        qty: 10,
        side: 'sell',
        type: 'market',
        time_in_force: 'day',
      });

      expect(mockAlpaca.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'sell' })
      );
    });

    it('should pass client order ID when provided', async () => {
      mockAlpaca.createOrder.mockResolvedValue(mockSubmittedOrder);

      await submitOrder({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        client_order_id: 'my-unique-id',
      });

      expect(mockAlpaca.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ client_order_id: 'my-unique-id' })
      );
    });

    it('should throw error when order rejected', async () => {
      mockAlpaca.createOrder.mockRejectedValue(new Error('Insufficient buying power'));

      await expect(
        submitOrder({
          symbol: 'AAPL',
          qty: 10000,
          side: 'buy',
          type: 'market',
          time_in_force: 'day',
        })
      ).rejects.toThrow('Insufficient buying power');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order successfully', async () => {
      mockAlpaca.cancelOrder.mockResolvedValue(undefined);

      const result = await cancelOrder('order-123');

      expect(result).toBe(true);
      expect(mockAlpaca.cancelOrder).toHaveBeenCalledWith('order-123');
    });

    it('should throw error when cancellation fails', async () => {
      mockAlpaca.cancelOrder.mockRejectedValue(new Error('Order not found'));

      await expect(cancelOrder('invalid-order')).rejects.toThrow('Order not found');
    });
  });

  describe('cancelAllOrders', () => {
    it('should cancel all orders and return count', async () => {
      mockAlpaca.cancelAllOrders.mockResolvedValue([
        { id: 'order-1' },
        { id: 'order-2' },
        { id: 'order-3' },
      ]);

      const result = await cancelAllOrders();

      expect(result).toEqual({ cancelled: 3 });
    });

    it('should return 0 when no orders to cancel', async () => {
      mockAlpaca.cancelAllOrders.mockResolvedValue([]);

      const result = await cancelAllOrders();

      expect(result).toEqual({ cancelled: 0 });
    });

    it('should handle non-array response', async () => {
      mockAlpaca.cancelAllOrders.mockResolvedValue(undefined);

      const result = await cancelAllOrders();

      expect(result).toEqual({ cancelled: 0 });
    });

    it('should throw error when API fails', async () => {
      mockAlpaca.cancelAllOrders.mockRejectedValue(new Error('Service unavailable'));

      await expect(cancelAllOrders()).rejects.toThrow('Service unavailable');
    });
  });

  describe('getLatestQuote', () => {
    it('should return quote with bid, ask, last prices', async () => {
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 149.95,
        AskPrice: 150.05,
      });

      const result = await getLatestQuote('AAPL');

      expect(result).toEqual({
        bid: 149.95,
        ask: 150.05,
        last: 150.05,
      });
      expect(mockAlpaca.getLatestQuote).toHaveBeenCalledWith('AAPL');
    });

    it('should handle string prices by parsing them', async () => {
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: '149.95',
        AskPrice: '150.05',
      });

      const result = await getLatestQuote('AAPL');

      expect(result).toEqual({
        bid: 149.95,
        ask: 150.05,
        last: 150.05,
      });
    });

    it('should handle null/undefined prices as 0', async () => {
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: null,
        AskPrice: undefined,
      });

      const result = await getLatestQuote('AAPL');

      expect(result).toEqual({
        bid: 0,
        ask: 0,
        last: 0,
      });
    });

    it('should throw error when symbol not found', async () => {
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('Symbol not found'));

      await expect(getLatestQuote('INVALID')).rejects.toThrow('Symbol not found');
    });
  });

  describe('isMarketOpen', () => {
    it('should return true when market is open', async () => {
      mockAlpaca.getClock.mockResolvedValue({ is_open: true });

      const result = await isMarketOpen();

      expect(result).toBe(true);
    });

    it('should return false when market is closed', async () => {
      mockAlpaca.getClock.mockResolvedValue({ is_open: false });

      const result = await isMarketOpen();

      expect(result).toBe(false);
    });

    it('should return false when API fails', async () => {
      mockAlpaca.getClock.mockRejectedValue(new Error('API error'));

      const result = await isMarketOpen();

      expect(result).toBe(false);
    });
  });
});
