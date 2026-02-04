/**
 * Real-Time Price Service
 *
 * Provides a centralized service for managing real-time price updates
 * from the Alpaca WebSocket stream. Integrates with the existing price
 * fetching system and provides event-based updates.
 */

import {
  AlpacaWebSocket,
  AlpacaTradeMessage,
  AlpacaQuoteMessage,
  AlpacaBarMessage,
  getAlpacaWebSocket,
  type ConnectionState,
} from './alpaca-websocket';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('realtime-prices');

export interface RealTimePrice {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  lastTradePrice?: number;
  lastTradeSize?: number;
  volume?: number;
  timestamp: Date;
  source: 'trade' | 'quote' | 'bar';
}

export interface PriceHistory {
  symbol: string;
  prices: number[];
  timestamps: Date[];
  maxLength: number;
}

type PriceUpdateCallback = (price: RealTimePrice) => void;
type ConnectionCallback = (state: ConnectionState) => void;

class RealTimePriceService {
  private ws: AlpacaWebSocket | null = null;
  private prices: Map<string, RealTimePrice> = new Map();
  private priceHistory: Map<string, PriceHistory> = new Map();
  private priceListeners: Map<string, Set<PriceUpdateCallback>> = new Map();
  private globalListeners: Set<PriceUpdateCallback> = new Set();
  private connectionListeners: Set<ConnectionCallback> = new Set();
  private historyMaxLength: number = 100;
  private initialized: boolean = false;

  /**
   * Initialize the real-time price service
   */
  async initialize(options?: { feed?: 'iex' | 'sip'; historyMaxLength?: number }): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.historyMaxLength = options?.historyMaxLength || 100;

    this.ws = getAlpacaWebSocket({
      feed: options?.feed || 'iex',
      reconnect: true,
      handlers: {
        onTrade: this.handleTrade.bind(this),
        onQuote: this.handleQuote.bind(this),
        onBar: this.handleBar.bind(this),
        onConnect: () => {
          log.info('Connected');
          this.notifyConnectionListeners('connected');
        },
        onDisconnect: (code, reason) => {
          log.info('Disconnected', { code, reason });
          this.notifyConnectionListeners('disconnected');
        },
        onError: (error) => {
          log.error('WebSocket error', { msg: error.msg });
        },
      },
    });

    try {
      await this.ws.connect();
      this.initialized = true;
    } catch (error) {
      log.error('Failed to initialize', serializeError(error));
      throw error;
    }
  }

  /**
   * Check if the service is initialized and connected
   */
  isConnected(): boolean {
    return this.ws?.isConnected() ?? false;
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): ConnectionState {
    return this.ws?.getState() ?? 'disconnected';
  }

  /**
   * Subscribe to price updates for symbols
   */
  subscribe(symbols: string[]): void {
    if (!this.ws) {
      log.warn('Service not initialized');
      return;
    }

    const upperSymbols = symbols.map((s) => s.toUpperCase());

    // Initialize price history for new symbols
    for (const symbol of upperSymbols) {
      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, {
          symbol,
          prices: [],
          timestamps: [],
          maxLength: this.historyMaxLength,
        });
      }
    }

    // Subscribe to both trades and quotes for accurate pricing
    this.ws.subscribeTrades(upperSymbols);
    this.ws.subscribeQuotes(upperSymbols);
  }

  /**
   * Unsubscribe from price updates for symbols
   */
  unsubscribe(symbols: string[]): void {
    if (!this.ws) {
      return;
    }

    const upperSymbols = symbols.map((s) => s.toUpperCase());
    this.ws.unsubscribeTrades(upperSymbols);
    this.ws.unsubscribeQuotes(upperSymbols);

    // Clean up price data
    for (const symbol of upperSymbols) {
      this.prices.delete(symbol);
      this.priceHistory.delete(symbol);
    }
  }

  /**
   * Get the current price for a symbol
   */
  getPrice(symbol: string): RealTimePrice | undefined {
    return this.prices.get(symbol.toUpperCase());
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Map<string, RealTimePrice> {
    return new Map(this.prices);
  }

  /**
   * Get price history for a symbol
   */
  getPriceHistory(symbol: string): PriceHistory | undefined {
    return this.priceHistory.get(symbol.toUpperCase());
  }

  /**
   * Add a listener for price updates on a specific symbol
   */
  addPriceListener(symbol: string, callback: PriceUpdateCallback): () => void {
    const upperSymbol = symbol.toUpperCase();
    if (!this.priceListeners.has(upperSymbol)) {
      this.priceListeners.set(upperSymbol, new Set());
    }
    this.priceListeners.get(upperSymbol)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.priceListeners.get(upperSymbol)?.delete(callback);
    };
  }

  /**
   * Add a listener for all price updates
   */
  addGlobalPriceListener(callback: PriceUpdateCallback): () => void {
    this.globalListeners.add(callback);
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * Add a listener for connection state changes
   */
  addConnectionListener(callback: ConnectionCallback): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Get the list of currently subscribed symbols
   */
  getSubscribedSymbols(): string[] {
    const subs = this.ws?.getSubscriptions();
    if (!subs) return [];
    return [...new Set([...subs.trades, ...subs.quotes])];
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
    }
    this.prices.clear();
    this.priceHistory.clear();
    this.priceListeners.clear();
    this.globalListeners.clear();
    this.connectionListeners.clear();
    this.initialized = false;
  }

  private handleTrade(trade: AlpacaTradeMessage): void {
    const symbol = trade.S;
    const timestamp = new Date(trade.t);

    const existingPrice = this.prices.get(symbol);
    const newPrice: RealTimePrice = {
      symbol,
      price: trade.p,
      bid: existingPrice?.bid,
      ask: existingPrice?.ask,
      bidSize: existingPrice?.bidSize,
      askSize: existingPrice?.askSize,
      lastTradePrice: trade.p,
      lastTradeSize: trade.s,
      volume: (existingPrice?.volume || 0) + trade.s,
      timestamp,
      source: 'trade',
    };

    this.updatePrice(newPrice);
  }

  private handleQuote(quote: AlpacaQuoteMessage): void {
    const symbol = quote.S;
    const timestamp = new Date(quote.t);

    const existingPrice = this.prices.get(symbol);
    const midPrice = (quote.bp + quote.ap) / 2;

    const newPrice: RealTimePrice = {
      symbol,
      price: existingPrice?.lastTradePrice || midPrice,
      bid: quote.bp,
      ask: quote.ap,
      bidSize: quote.bs,
      askSize: quote.as,
      lastTradePrice: existingPrice?.lastTradePrice,
      lastTradeSize: existingPrice?.lastTradeSize,
      volume: existingPrice?.volume,
      timestamp,
      source: 'quote',
    };

    this.updatePrice(newPrice);
  }

  private handleBar(bar: AlpacaBarMessage): void {
    const symbol = bar.S;
    const timestamp = new Date(bar.t);

    const existingPrice = this.prices.get(symbol);
    const newPrice: RealTimePrice = {
      symbol,
      price: bar.c, // Close price
      bid: existingPrice?.bid,
      ask: existingPrice?.ask,
      bidSize: existingPrice?.bidSize,
      askSize: existingPrice?.askSize,
      lastTradePrice: bar.c,
      volume: bar.v,
      timestamp,
      source: 'bar',
    };

    this.updatePrice(newPrice);
  }

  private updatePrice(price: RealTimePrice): void {
    const symbol = price.symbol;
    this.prices.set(symbol, price);

    // Update price history
    const history = this.priceHistory.get(symbol);
    if (history) {
      history.prices.push(price.price);
      history.timestamps.push(price.timestamp);

      // Trim history if needed
      if (history.prices.length > history.maxLength) {
        history.prices.shift();
        history.timestamps.shift();
      }
    }

    // Notify listeners
    this.notifyPriceListeners(price);
  }

  private notifyPriceListeners(price: RealTimePrice): void {
    // Notify symbol-specific listeners
    const listeners = this.priceListeners.get(price.symbol);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(price);
        } catch (error) {
          log.error('Listener error', serializeError(error));
        }
      }
    }

    // Notify global listeners
    for (const callback of this.globalListeners) {
      try {
        callback(price);
      } catch (error) {
        log.error('Global listener error', serializeError(error));
      }
    }
  }

  private notifyConnectionListeners(state: ConnectionState): void {
    for (const callback of this.connectionListeners) {
      try {
        callback(state);
      } catch (error) {
        log.error('Connection listener error', serializeError(error));
      }
    }
  }
}

// Singleton instance
let serviceInstance: RealTimePriceService | null = null;

/**
 * Get the singleton RealTimePriceService instance
 */
export function getRealTimePriceService(): RealTimePriceService {
  if (!serviceInstance) {
    serviceInstance = new RealTimePriceService();
  }
  return serviceInstance;
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetRealTimePriceService(): void {
  if (serviceInstance) {
    serviceInstance.disconnect();
    serviceInstance = null;
  }
}
