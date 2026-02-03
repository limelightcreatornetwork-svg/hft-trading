/**
 * Alpaca WebSocket Client for Real-Time Market Data
 *
 * Provides real-time trade and quote streaming from Alpaca's market data API.
 * Supports automatic reconnection, subscription management, and event handling.
 */

import { alpacaConfig } from './env';

// WebSocket URLs
const WS_URL_IEX = 'wss://stream.data.alpaca.markets/v2/iex';
const WS_URL_SIP = 'wss://stream.data.alpaca.markets/v2/sip';

// Message types from Alpaca
export interface AlpacaTradeMessage {
  T: 't'; // Type: trade
  S: string; // Symbol
  i: number; // Trade ID
  x: string; // Exchange
  p: number; // Price
  s: number; // Size
  c: string[]; // Conditions
  t: string; // Timestamp
  z: string; // Tape
}

export interface AlpacaQuoteMessage {
  T: 'q'; // Type: quote
  S: string; // Symbol
  ax: string; // Ask exchange
  ap: number; // Ask price
  as: number; // Ask size
  bx: string; // Bid exchange
  bp: number; // Bid price
  bs: number; // Bid size
  c: string[]; // Conditions
  t: string; // Timestamp
  z: string; // Tape
}

export interface AlpacaBarMessage {
  T: 'b'; // Type: bar
  S: string; // Symbol
  o: number; // Open
  h: number; // High
  l: number; // Low
  c: number; // Close
  v: number; // Volume
  t: string; // Timestamp
  n: number; // Trade count
  vw: number; // VWAP
}

export interface AlpacaErrorMessage {
  T: 'error';
  code: number;
  msg: string;
}

export interface AlpacaSuccessMessage {
  T: 'success';
  msg: string;
}

export interface AlpacaSubscriptionMessage {
  T: 'subscription';
  trades: string[];
  quotes: string[];
  bars: string[];
}

export type AlpacaMessage =
  | AlpacaTradeMessage
  | AlpacaQuoteMessage
  | AlpacaBarMessage
  | AlpacaErrorMessage
  | AlpacaSuccessMessage
  | AlpacaSubscriptionMessage;

// Event handlers
export interface AlpacaWebSocketHandlers {
  onTrade?: (trade: AlpacaTradeMessage) => void;
  onQuote?: (quote: AlpacaQuoteMessage) => void;
  onBar?: (bar: AlpacaBarMessage) => void;
  onError?: (error: AlpacaErrorMessage) => void;
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
  onSubscriptionUpdate?: (subscriptions: AlpacaSubscriptionMessage) => void;
}

export interface AlpacaWebSocketOptions {
  feed?: 'iex' | 'sip';
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  handlers?: AlpacaWebSocketHandlers;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

export class AlpacaWebSocket {
  private ws: WebSocket | null = null;
  private options: Required<AlpacaWebSocketOptions>;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private subscribedTrades: Set<string> = new Set();
  private subscribedQuotes: Set<string> = new Set();
  private subscribedBars: Set<string> = new Set();
  private connectionState: ConnectionState = 'disconnected';
  private handlers: AlpacaWebSocketHandlers;

  constructor(options: AlpacaWebSocketOptions = {}) {
    this.options = {
      feed: options.feed || 'iex',
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      handlers: options.handlers || {},
    };
    this.handlers = this.options.handlers;
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if the connection is ready to send messages
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Connect to the Alpaca WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.connectionState = 'connecting';
      const url = this.options.feed === 'sip' ? WS_URL_SIP : WS_URL_IEX;

      try {
        // Use native WebSocket in browser, or ws package in Node.js
        if (typeof window !== 'undefined') {
          this.ws = new WebSocket(url);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const WebSocketNode = require('ws');
          this.ws = new WebSocketNode(url) as WebSocket;
        }
      } catch (error) {
        this.connectionState = 'disconnected';
        reject(error);
        return;
      }

      let resolved = false;

      this.ws.onopen = () => {
        console.log('[AlpacaWS] Connected to', url);
        this.connectionState = 'authenticating';
        this.authenticate();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data, () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });
      };

      this.ws.onerror = (error: Event) => {
        console.error('[AlpacaWS] WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection error'));
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log('[AlpacaWS] Connection closed:', event.code, event.reason);
        this.connectionState = 'disconnected';
        this.clearHeartbeat();

        this.handlers.onDisconnect?.(event.code, event.reason);

        if (!resolved) {
          resolved = true;
          reject(new Error(`Connection closed: ${event.reason}`));
        }

        if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.options.reconnect = false;
    this.clearReconnectTimeout();
    this.clearHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connectionState = 'disconnected';
    this.subscribedTrades.clear();
    this.subscribedQuotes.clear();
    this.subscribedBars.clear();
  }

  /**
   * Subscribe to trade updates for symbols
   */
  subscribeTrades(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedTrades.add(s.toUpperCase()));
    this.sendSubscription();
  }

  /**
   * Subscribe to quote updates for symbols
   */
  subscribeQuotes(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedQuotes.add(s.toUpperCase()));
    this.sendSubscription();
  }

  /**
   * Subscribe to bar (OHLCV) updates for symbols
   */
  subscribeBars(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedBars.add(s.toUpperCase()));
    this.sendSubscription();
  }

  /**
   * Unsubscribe from trade updates for symbols
   */
  unsubscribeTrades(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedTrades.delete(s.toUpperCase()));
    this.sendUnsubscription('trades', symbols);
  }

  /**
   * Unsubscribe from quote updates for symbols
   */
  unsubscribeQuotes(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedQuotes.delete(s.toUpperCase()));
    this.sendUnsubscription('quotes', symbols);
  }

  /**
   * Unsubscribe from bar updates for symbols
   */
  unsubscribeBars(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedBars.delete(s.toUpperCase()));
    this.sendUnsubscription('bars', symbols);
  }

  /**
   * Get currently subscribed symbols
   */
  getSubscriptions(): { trades: string[]; quotes: string[]; bars: string[] } {
    return {
      trades: Array.from(this.subscribedTrades),
      quotes: Array.from(this.subscribedQuotes),
      bars: Array.from(this.subscribedBars),
    };
  }

  /**
   * Update event handlers
   */
  setHandlers(handlers: AlpacaWebSocketHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  private authenticate(): void {
    const authMessage = {
      action: 'auth',
      key: alpacaConfig.apiKey,
      secret: alpacaConfig.apiSecret,
    };
    this.send(authMessage);
  }

  private sendSubscription(): void {
    if (!this.isConnected()) {
      return;
    }

    const message = {
      action: 'subscribe',
      trades: Array.from(this.subscribedTrades),
      quotes: Array.from(this.subscribedQuotes),
      bars: Array.from(this.subscribedBars),
    };
    this.send(message);
  }

  private sendUnsubscription(
    type: 'trades' | 'quotes' | 'bars',
    symbols: string[]
  ): void {
    if (!this.isConnected()) {
      return;
    }

    const message = {
      action: 'unsubscribe',
      [type]: symbols.map((s) => s.toUpperCase()),
    };
    this.send(message);
  }

  private send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: string | Buffer, onAuthenticated?: () => void): void {
    try {
      const messages: AlpacaMessage[] = JSON.parse(data.toString());

      for (const message of messages) {
        switch (message.T) {
          case 'success':
            if (message.msg === 'connected') {
              console.log('[AlpacaWS] Server acknowledged connection');
            } else if (message.msg === 'authenticated') {
              console.log('[AlpacaWS] Authentication successful');
              this.connectionState = 'connected';
              this.reconnectAttempts = 0;
              this.startHeartbeat();
              this.handlers.onConnect?.();
              onAuthenticated?.();

              // Re-subscribe to all symbols after reconnect
              if (
                this.subscribedTrades.size > 0 ||
                this.subscribedQuotes.size > 0 ||
                this.subscribedBars.size > 0
              ) {
                this.sendSubscription();
              }
            }
            break;

          case 'error':
            console.error('[AlpacaWS] Error:', message.code, message.msg);
            this.handlers.onError?.(message);
            break;

          case 'subscription':
            console.log('[AlpacaWS] Subscription update:', message);
            this.handlers.onSubscriptionUpdate?.(message);
            break;

          case 't':
            this.handlers.onTrade?.(message);
            break;

          case 'q':
            this.handlers.onQuote?.(message);
            break;

          case 'b':
            this.handlers.onBar?.(message);
            break;
        }
      }
    } catch (error) {
      console.error('[AlpacaWS] Failed to parse message:', error);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(
      `[AlpacaWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.options.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        console.error('[AlpacaWS] Reconnection failed:', error);
      }
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();

    // Alpaca doesn't require ping/pong, but we can monitor connection health
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.warn('[AlpacaWS] Connection appears dead, reconnecting...');
        this.ws.close();
      }
    }, 30000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Singleton instance for easy access
let defaultInstance: AlpacaWebSocket | null = null;

/**
 * Get or create the default WebSocket instance
 */
export function getAlpacaWebSocket(options?: AlpacaWebSocketOptions): AlpacaWebSocket {
  if (!defaultInstance) {
    defaultInstance = new AlpacaWebSocket(options);
  }
  return defaultInstance;
}

/**
 * Reset the default WebSocket instance (useful for testing)
 */
export function resetAlpacaWebSocket(): void {
  if (defaultInstance) {
    defaultInstance.disconnect();
    defaultInstance = null;
  }
}
