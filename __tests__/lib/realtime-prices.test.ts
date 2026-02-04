/**
 * Tests for Real-Time Price Service
 */

// Mock the env module
jest.mock('../../src/lib/env', () => ({
  alpacaConfig: {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    isPaper: true,
    baseUrl: 'https://paper-api.alpaca.markets',
  },
}));

// Mock the WebSocket module
const mockHandlers: Record<string, (...args: unknown[]) => void> = {};
const mockWsInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getState: jest.fn().mockReturnValue('connected'),
  subscribeTrades: jest.fn(),
  subscribeQuotes: jest.fn(),
  subscribeBars: jest.fn(),
  unsubscribeTrades: jest.fn(),
  unsubscribeQuotes: jest.fn(),
  unsubscribeBars: jest.fn(),
  getSubscriptions: jest.fn().mockReturnValue({ trades: [], quotes: [], bars: [] }),
  setHandlers: jest.fn((handlers) => {
    Object.assign(mockHandlers, handlers);
  }),
};

jest.mock('../../src/lib/alpaca-websocket', () => ({
  getAlpacaWebSocket: jest.fn((options) => {
    if (options?.handlers) {
      Object.assign(mockHandlers, options.handlers);
    }
    return mockWsInstance;
  }),
  resetAlpacaWebSocket: jest.fn(),
  AlpacaWebSocket: jest.fn(),
}));

import {
  getRealTimePriceService,
  resetRealTimePriceService,
} from '../../src/lib/realtime-prices';

describe('RealTimePriceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRealTimePriceService();
    Object.keys(mockHandlers).forEach((key) => delete mockHandlers[key]);
  });

  describe('initialize', () => {
    it('should initialize the service', async () => {
      const service = getRealTimePriceService();
      await service.initialize();

      expect(mockWsInstance.connect).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      const service = getRealTimePriceService();
      await service.initialize();
      await service.initialize();

      expect(mockWsInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should accept feed option', async () => {
      const service = getRealTimePriceService();
      await service.initialize({ feed: 'sip' });

      expect(mockWsInstance.connect).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
    });

    it('should subscribe to trades and quotes for symbols', () => {
      const service = getRealTimePriceService();
      service.subscribe(['AAPL', 'MSFT']);

      expect(mockWsInstance.subscribeTrades).toHaveBeenCalledWith(['AAPL', 'MSFT']);
      expect(mockWsInstance.subscribeQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('should uppercase symbols', () => {
      const service = getRealTimePriceService();
      service.subscribe(['aapl', 'msft']);

      expect(mockWsInstance.subscribeTrades).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('should initialize price history for new symbols', () => {
      const service = getRealTimePriceService();
      service.subscribe(['AAPL']);

      const history = service.getPriceHistory('AAPL');
      expect(history).toBeDefined();
      expect(history?.prices).toHaveLength(0);
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
    });

    it('should unsubscribe from symbols', () => {
      const service = getRealTimePriceService();
      service.unsubscribe(['AAPL']);

      expect(mockWsInstance.unsubscribeTrades).toHaveBeenCalledWith(['AAPL']);
      expect(mockWsInstance.unsubscribeQuotes).toHaveBeenCalledWith(['AAPL']);
    });

    it('should clean up price data on unsubscribe', () => {
      const service = getRealTimePriceService();
      service.subscribe(['AAPL']);

      // Simulate a price update
      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      expect(service.getPrice('AAPL')).toBeDefined();

      service.unsubscribe(['AAPL']);

      expect(service.getPrice('AAPL')).toBeUndefined();
    });
  });

  describe('price updates', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
      service.subscribe(['AAPL']);
    });

    it('should update price on trade message', () => {
      const service = getRealTimePriceService();

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        i: 12345,
        x: 'Q',
        p: 150.25,
        s: 100,
        c: ['@'],
        t: '2024-01-15T10:30:00Z',
        z: 'A',
      });

      const price = service.getPrice('AAPL');
      expect(price).toBeDefined();
      expect(price?.price).toBe(150.25);
      expect(price?.lastTradePrice).toBe(150.25);
      expect(price?.lastTradeSize).toBe(100);
      expect(price?.source).toBe('trade');
    });

    it('should update price on quote message', () => {
      const service = getRealTimePriceService();

      mockHandlers.onQuote?.({
        T: 'q',
        S: 'AAPL',
        ax: 'Q',
        ap: 150.30,
        as: 200,
        bx: 'Q',
        bp: 150.25,
        bs: 300,
        c: ['R'],
        t: '2024-01-15T10:30:00Z',
        z: 'A',
      });

      const price = service.getPrice('AAPL');
      expect(price).toBeDefined();
      expect(price?.bid).toBe(150.25);
      expect(price?.ask).toBe(150.30);
      expect(price?.bidSize).toBe(300);
      expect(price?.askSize).toBe(200);
      expect(price?.source).toBe('quote');
    });

    it('should update price on bar message', () => {
      const service = getRealTimePriceService();

      mockHandlers.onBar?.({
        T: 'b',
        S: 'AAPL',
        o: 149.50,
        h: 151.00,
        l: 149.00,
        c: 150.75,
        v: 10000,
        t: '2024-01-15T10:30:00Z',
        n: 500,
        vw: 150.25,
      });

      const price = service.getPrice('AAPL');
      expect(price).toBeDefined();
      expect(price?.price).toBe(150.75);
      expect(price?.volume).toBe(10000);
      expect(price?.source).toBe('bar');
    });

    it('should maintain price history', () => {
      const service = getRealTimePriceService();

      // Simulate multiple trades
      for (let i = 0; i < 5; i++) {
        mockHandlers.onTrade?.({
          T: 't',
          S: 'AAPL',
          i: i,
          x: 'Q',
          p: 150 + i,
          s: 100,
          c: ['@'],
          t: new Date().toISOString(),
          z: 'A',
        });
      }

      const history = service.getPriceHistory('AAPL');
      expect(history?.prices).toHaveLength(5);
      expect(history?.prices).toEqual([150, 151, 152, 153, 154]);
    });

    it('should trim price history when max length exceeded', async () => {
      const _service = getRealTimePriceService();

      // Re-initialize with small history max length
      resetRealTimePriceService();
      const newService = getRealTimePriceService();
      await newService.initialize({ historyMaxLength: 3 });
      newService.subscribe(['AAPL']);

      // Simulate 5 trades
      for (let i = 0; i < 5; i++) {
        mockHandlers.onTrade?.({
          T: 't',
          S: 'AAPL',
          i: i,
          x: 'Q',
          p: 150 + i,
          s: 100,
          c: ['@'],
          t: new Date().toISOString(),
          z: 'A',
        });
      }

      const history = newService.getPriceHistory('AAPL');
      expect(history?.prices).toHaveLength(3);
      expect(history?.prices).toEqual([152, 153, 154]); // Last 3 prices
    });
  });

  describe('listeners', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
      service.subscribe(['AAPL', 'MSFT']);
    });

    it('should notify symbol-specific listeners', () => {
      const service = getRealTimePriceService();
      const callback = jest.fn();

      service.addPriceListener('AAPL', callback);

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          price: 150.0,
        })
      );
    });

    it('should not notify listeners for other symbols', () => {
      const service = getRealTimePriceService();
      const callback = jest.fn();

      service.addPriceListener('AAPL', callback);

      mockHandlers.onTrade?.({
        T: 't',
        S: 'MSFT',
        p: 300.0,
        s: 100,
        t: new Date().toISOString(),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify global listeners for all updates', () => {
      const service = getRealTimePriceService();
      const callback = jest.fn();

      service.addGlobalPriceListener(callback);

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      mockHandlers.onTrade?.({
        T: 't',
        S: 'MSFT',
        p: 300.0,
        s: 100,
        t: new Date().toISOString(),
      });

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const service = getRealTimePriceService();
      const callback = jest.fn();

      const unsubscribe = service.addPriceListener('AAPL', callback);

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 151.0,
        s: 100,
        t: new Date().toISOString(),
      });

      // Should still be 1 since we unsubscribed
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should notify connection listeners', () => {
      const service = getRealTimePriceService();
      const callback = jest.fn();

      service.addConnectionListener(callback);

      // Simulate connection state change
      mockHandlers.onConnect?.();

      expect(callback).toHaveBeenCalledWith('connected');
    });
  });

  describe('getPrice and getAllPrices', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
      service.subscribe(['AAPL', 'MSFT']);
    });

    it('should return undefined for unknown symbol', () => {
      const service = getRealTimePriceService();
      expect(service.getPrice('UNKNOWN')).toBeUndefined();
    });

    it('should return price for known symbol', () => {
      const service = getRealTimePriceService();

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      const price = service.getPrice('AAPL');
      expect(price?.price).toBe(150.0);
    });

    it('should return all prices', () => {
      const service = getRealTimePriceService();

      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      mockHandlers.onTrade?.({
        T: 't',
        S: 'MSFT',
        p: 300.0,
        s: 100,
        t: new Date().toISOString(),
      });

      const allPrices = service.getAllPrices();
      expect(allPrices.size).toBe(2);
      expect(allPrices.get('AAPL')?.price).toBe(150.0);
      expect(allPrices.get('MSFT')?.price).toBe(300.0);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      const service = getRealTimePriceService();
      await service.initialize();
    });

    it('should disconnect and clean up', () => {
      const service = getRealTimePriceService();

      service.subscribe(['AAPL']);
      mockHandlers.onTrade?.({
        T: 't',
        S: 'AAPL',
        p: 150.0,
        s: 100,
        t: new Date().toISOString(),
      });

      service.disconnect();

      expect(mockWsInstance.disconnect).toHaveBeenCalled();
      expect(service.getPrice('AAPL')).toBeUndefined();
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getRealTimePriceService();
      const instance2 = getRealTimePriceService();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getRealTimePriceService();
      resetRealTimePriceService();
      const instance2 = getRealTimePriceService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
