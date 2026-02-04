'use client';

/**
 * React Hooks for Real-Time Price Updates
 *
 * Provides hooks for subscribing to real-time price updates from the
 * Alpaca WebSocket stream. Handles initialization, subscription management,
 * and cleanup automatically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getRealTimePriceService,
  type RealTimePrice,
  type PriceHistory,
} from '@/lib/realtime-prices';
import type { ConnectionState } from '@/lib/alpaca-websocket';

/**
 * Hook for managing the real-time price service connection
 */
export function useRealTimePriceConnection(options?: {
  feed?: 'iex' | 'sip';
  autoConnect?: boolean;
}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const initializingRef = useRef(false);

  const connect = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    setError(null);

    try {
      const service = getRealTimePriceService();
      await service.initialize({ feed: options?.feed || 'iex' });
      setConnectionState('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setConnectionState('disconnected');
    } finally {
      initializingRef.current = false;
    }
  }, [options?.feed]);

  const disconnect = useCallback(() => {
    const service = getRealTimePriceService();
    service.disconnect();
    setConnectionState('disconnected');
  }, []);

  useEffect(() => {
    const service = getRealTimePriceService();

    // Listen for connection state changes
    const unsubscribe = service.addConnectionListener((state) => {
      setConnectionState(state);
    });

    // Auto-connect if requested
    if (options?.autoConnect !== false) {
      connect();
    }

    return () => {
      unsubscribe();
    };
  }, [connect, options?.autoConnect]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    connect,
    disconnect,
  };
}

/**
 * Hook for subscribing to real-time prices for multiple symbols
 */
export function useRealTimePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Map<string, RealTimePrice>>(new Map());
  const symbolsRef = useRef<string[]>([]);

  useEffect(() => {
    const service = getRealTimePriceService();

    // Check if symbols changed
    const normalizedSymbols = symbols.map((s) => s.toUpperCase()).sort();
    const prevSymbols = symbolsRef.current.sort();
    const symbolsChanged =
      normalizedSymbols.length !== prevSymbols.length ||
      normalizedSymbols.some((s, i) => s !== prevSymbols[i]);

    if (!symbolsChanged) {
      return;
    }

    symbolsRef.current = normalizedSymbols;

    // Subscribe to new symbols
    if (normalizedSymbols.length > 0) {
      service.subscribe(normalizedSymbols);
    }

    // Initialize prices from current state
    const currentPrices = service.getAllPrices();
    const relevantPrices = new Map<string, RealTimePrice>();
    for (const symbol of normalizedSymbols) {
      const price = currentPrices.get(symbol);
      if (price) {
        relevantPrices.set(symbol, price);
      }
    }
    if (relevantPrices.size > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial state from service cache
      setPrices(relevantPrices);
    }

    // Listen for price updates
    const unsubscribes = normalizedSymbols.map((symbol) =>
      service.addPriceListener(symbol, (price) => {
        setPrices((prev) => {
          const next = new Map(prev);
          next.set(price.symbol, price);
          return next;
        });
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [symbols]);

  // Get price for a specific symbol
  const getPrice = useCallback(
    (symbol: string): RealTimePrice | undefined => {
      return prices.get(symbol.toUpperCase());
    },
    [prices]
  );

  return {
    prices,
    getPrice,
  };
}

/**
 * Hook for subscribing to a single symbol's real-time price
 */
export function useRealTimePrice(symbol: string) {
  const [price, setPrice] = useState<RealTimePrice | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!symbol) {
      return;
    }

    const service = getRealTimePriceService();
    const upperSymbol = symbol.toUpperCase();

    // Subscribe to the symbol
    service.subscribe([upperSymbol]);

    // Initialize from current state
    const currentPrice = service.getPrice(upperSymbol);
    if (currentPrice) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial state from service cache
      setPrice(currentPrice);
    }

    const history = service.getPriceHistory(upperSymbol);
    if (history) {
      setPriceHistory(history.prices);
    }

    // Listen for updates
    const unsubscribe = service.addPriceListener(upperSymbol, (newPrice) => {
      setPrice(newPrice);

      // Update history
      const updatedHistory = service.getPriceHistory(upperSymbol);
      if (updatedHistory) {
        setPriceHistory([...updatedHistory.prices]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [symbol]);

  return {
    price,
    priceHistory,
    currentPrice: price?.price ?? null,
    bid: price?.bid ?? null,
    ask: price?.ask ?? null,
    lastTradePrice: price?.lastTradePrice ?? null,
    timestamp: price?.timestamp ?? null,
  };
}

/**
 * Hook for getting price history for a symbol
 */
export function usePriceHistory(symbol: string, maxLength: number = 100) {
  const [history, setHistory] = useState<PriceHistory | null>(null);

  useEffect(() => {
    if (!symbol) {
      return;
    }

    const service = getRealTimePriceService();
    const upperSymbol = symbol.toUpperCase();

    // Subscribe and initialize
    service.subscribe([upperSymbol]);

    const currentHistory = service.getPriceHistory(upperSymbol);
    if (currentHistory) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial state from service cache
      setHistory({ ...currentHistory });
    }

    // Listen for updates
    const unsubscribe = service.addPriceListener(upperSymbol, () => {
      const updatedHistory = service.getPriceHistory(upperSymbol);
      if (updatedHistory) {
        setHistory({
          symbol: updatedHistory.symbol,
          prices: [...updatedHistory.prices],
          timestamps: [...updatedHistory.timestamps],
          maxLength: updatedHistory.maxLength,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [symbol, maxLength]);

  return history;
}

/**
 * Hook for listening to all price updates (useful for debugging or logging)
 */
export function useGlobalPriceUpdates(
  onUpdate: (price: RealTimePrice) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const service = getRealTimePriceService();
    const unsubscribe = service.addGlobalPriceListener(onUpdate);

    return () => {
      unsubscribe();
    };
  }, [onUpdate, enabled]);
}
