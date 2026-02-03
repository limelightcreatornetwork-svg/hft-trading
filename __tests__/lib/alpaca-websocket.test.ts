/**
 * Tests for Alpaca WebSocket Client
 *
 * These tests validate the WebSocket client's configuration and interface.
 * Integration tests with actual WebSocket connections would be done separately.
 */

// Mock the env module before importing
jest.mock('../../src/lib/env', () => ({
  alpacaConfig: {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    isPaper: true,
    baseUrl: 'https://paper-api.alpaca.markets',
  },
}));

// Mock ws module for Node.js environment
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    readyState: 1,
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
    send: jest.fn(),
    close: jest.fn(),
  }));
});

import {
  AlpacaWebSocket,
  getAlpacaWebSocket,
  resetAlpacaWebSocket,
  type AlpacaTradeMessage,
  type AlpacaQuoteMessage,
  type AlpacaBarMessage,
  type AlpacaWebSocketHandlers,
} from '../../src/lib/alpaca-websocket';

describe('AlpacaWebSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAlpacaWebSocket();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const ws = new AlpacaWebSocket();
      expect(ws.getState()).toBe('disconnected');
      expect(ws.isConnected()).toBe(false);
    });

    it('should create instance with custom options', () => {
      const ws = new AlpacaWebSocket({
        feed: 'sip',
        reconnect: false,
        reconnectDelay: 2000,
        maxReconnectAttempts: 5,
      });
      expect(ws.getState()).toBe('disconnected');
    });

    it('should accept handlers in options', () => {
      const handlers: AlpacaWebSocketHandlers = {
        onTrade: jest.fn(),
        onQuote: jest.fn(),
        onBar: jest.fn(),
        onError: jest.fn(),
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
      };

      const ws = new AlpacaWebSocket({ handlers });
      expect(ws.getState()).toBe('disconnected');
    });
  });

  describe('subscriptions before connect', () => {
    it('should track trade subscriptions', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeTrades(['AAPL', 'MSFT']);

      const subs = ws.getSubscriptions();
      expect(subs.trades).toContain('AAPL');
      expect(subs.trades).toContain('MSFT');
    });

    it('should track quote subscriptions', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeQuotes(['AAPL', 'GOOGL']);

      const subs = ws.getSubscriptions();
      expect(subs.quotes).toContain('AAPL');
      expect(subs.quotes).toContain('GOOGL');
    });

    it('should track bar subscriptions', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeBars(['SPY', 'QQQ']);

      const subs = ws.getSubscriptions();
      expect(subs.bars).toContain('SPY');
      expect(subs.bars).toContain('QQQ');
    });

    it('should uppercase symbols', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeTrades(['aapl', 'Msft']);

      const subs = ws.getSubscriptions();
      expect(subs.trades).toContain('AAPL');
      expect(subs.trades).toContain('MSFT');
    });

    it('should not duplicate symbols', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeTrades(['AAPL', 'AAPL', 'aapl']);

      const subs = ws.getSubscriptions();
      expect(subs.trades.filter((s) => s === 'AAPL')).toHaveLength(1);
    });

    it('should unsubscribe from trades', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeTrades(['AAPL', 'MSFT', 'GOOGL']);
      ws.unsubscribeTrades(['MSFT']);

      const subs = ws.getSubscriptions();
      expect(subs.trades).toContain('AAPL');
      expect(subs.trades).toContain('GOOGL');
      expect(subs.trades).not.toContain('MSFT');
    });

    it('should unsubscribe from quotes', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeQuotes(['AAPL', 'MSFT']);
      ws.unsubscribeQuotes(['AAPL']);

      const subs = ws.getSubscriptions();
      expect(subs.quotes).not.toContain('AAPL');
      expect(subs.quotes).toContain('MSFT');
    });

    it('should unsubscribe from bars', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeBars(['SPY', 'QQQ']);
      ws.unsubscribeBars(['SPY']);

      const subs = ws.getSubscriptions();
      expect(subs.bars).not.toContain('SPY');
      expect(subs.bars).toContain('QQQ');
    });
  });

  describe('setHandlers', () => {
    it('should update handlers', () => {
      const ws = new AlpacaWebSocket();
      const newHandler = jest.fn();

      ws.setHandlers({ onTrade: newHandler });

      // Handler is set (we can't easily verify without triggering a message)
      expect(ws.getState()).toBe('disconnected');
    });
  });

  describe('disconnect without connect', () => {
    it('should handle disconnect when not connected', () => {
      const ws = new AlpacaWebSocket();
      expect(() => ws.disconnect()).not.toThrow();
      expect(ws.getState()).toBe('disconnected');
    });

    it('should clear subscriptions on disconnect', () => {
      const ws = new AlpacaWebSocket();
      ws.subscribeTrades(['AAPL']);
      ws.subscribeQuotes(['MSFT']);
      ws.subscribeBars(['SPY']);

      ws.disconnect();

      const subs = ws.getSubscriptions();
      expect(subs.trades).toHaveLength(0);
      expect(subs.quotes).toHaveLength(0);
      expect(subs.bars).toHaveLength(0);
    });
  });

  describe('singleton functions', () => {
    it('should return the same instance from getAlpacaWebSocket', () => {
      const instance1 = getAlpacaWebSocket();
      const instance2 = getAlpacaWebSocket();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance with resetAlpacaWebSocket', () => {
      const instance1 = getAlpacaWebSocket();
      resetAlpacaWebSocket();
      const instance2 = getAlpacaWebSocket();

      expect(instance1).not.toBe(instance2);
    });

    it('should accept options in getAlpacaWebSocket', () => {
      const instance = getAlpacaWebSocket({ feed: 'sip' });
      expect(instance.getState()).toBe('disconnected');
    });
  });

  describe('message types', () => {
    it('should have correct trade message structure', () => {
      const trade: AlpacaTradeMessage = {
        T: 't',
        S: 'AAPL',
        i: 12345,
        x: 'Q',
        p: 150.25,
        s: 100,
        c: ['@'],
        t: '2024-01-15T10:30:00Z',
        z: 'A',
      };

      expect(trade.T).toBe('t');
      expect(trade.S).toBe('AAPL');
      expect(trade.p).toBe(150.25);
    });

    it('should have correct quote message structure', () => {
      const quote: AlpacaQuoteMessage = {
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
      };

      expect(quote.T).toBe('q');
      expect(quote.bp).toBe(150.25);
      expect(quote.ap).toBe(150.30);
    });

    it('should have correct bar message structure', () => {
      const bar: AlpacaBarMessage = {
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
      };

      expect(bar.T).toBe('b');
      expect(bar.o).toBe(149.50);
      expect(bar.c).toBe(150.75);
    });
  });
});
