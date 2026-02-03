'use client';

/**
 * Real-Time Price Provider Component
 *
 * Provides a React context for managing the real-time price WebSocket connection.
 * Wrap your application (or the parts that need real-time prices) with this provider.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getRealTimePriceService,
  type RealTimePrice,
} from '@/lib/realtime-prices';
import type { ConnectionState } from '@/lib/alpaca-websocket';

interface RealTimePriceContextValue {
  connectionState: ConnectionState;
  isConnected: boolean;
  error: string | null;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  getPrice: (symbol: string) => RealTimePrice | undefined;
  getAllPrices: () => Map<string, RealTimePrice>;
  getPriceHistory: (symbol: string) => number[];
}

const RealTimePriceContext = createContext<RealTimePriceContextValue | null>(null);

interface RealTimePriceProviderProps {
  children: React.ReactNode;
  feed?: 'iex' | 'sip';
  autoConnect?: boolean;
}

export function RealTimePriceProvider({
  children,
  feed = 'iex',
  autoConnect = true,
}: RealTimePriceProviderProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [, setUpdateTrigger] = useState(0);

  // Initialize the service
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    const service = getRealTimePriceService();

    const initService = async () => {
      try {
        await service.initialize({ feed });
        setConnectionState('connected');
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        setConnectionState('disconnected');
      }
    };

    // Listen for connection state changes
    const unsubscribeConnection = service.addConnectionListener((state) => {
      setConnectionState(state);
    });

    // Listen for all price updates to trigger re-renders when needed
    const unsubscribeGlobal = service.addGlobalPriceListener(() => {
      // Trigger a re-render for components using getAllPrices
      setUpdateTrigger((prev) => prev + 1);
    });

    initService();

    return () => {
      unsubscribeConnection();
      unsubscribeGlobal();
    };
  }, [autoConnect, feed]);

  const subscribe = useCallback((symbols: string[]) => {
    const service = getRealTimePriceService();
    service.subscribe(symbols);
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    const service = getRealTimePriceService();
    service.unsubscribe(symbols);
  }, []);

  const getPrice = useCallback((symbol: string): RealTimePrice | undefined => {
    const service = getRealTimePriceService();
    return service.getPrice(symbol);
  }, []);

  const getAllPrices = useCallback((): Map<string, RealTimePrice> => {
    const service = getRealTimePriceService();
    return service.getAllPrices();
  }, []);

  const getPriceHistory = useCallback((symbol: string): number[] => {
    const service = getRealTimePriceService();
    const history = service.getPriceHistory(symbol);
    return history?.prices || [];
  }, []);

  const value: RealTimePriceContextValue = {
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    subscribe,
    unsubscribe,
    getPrice,
    getAllPrices,
    getPriceHistory,
  };

  return (
    <RealTimePriceContext.Provider value={value}>
      {children}
    </RealTimePriceContext.Provider>
  );
}

/**
 * Hook to access the real-time price context
 */
export function useRealTimePriceContext(): RealTimePriceContextValue {
  const context = useContext(RealTimePriceContext);
  if (!context) {
    throw new Error(
      'useRealTimePriceContext must be used within a RealTimePriceProvider'
    );
  }
  return context;
}

/**
 * Connection status indicator component
 */
export function RealTimeConnectionStatus({ showLabel = true }: { showLabel?: boolean }) {
  const { connectionState, error } = useRealTimePriceContext();

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
      case 'authenticating':
        return 'bg-yellow-500 animate-pulse';
      case 'disconnected':
        return error ? 'bg-red-500' : 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Live';
      case 'connecting':
        return 'Connecting...';
      case 'authenticating':
        return 'Authenticating...';
      case 'disconnected':
        return error ? 'Error' : 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {getStatusText()}
        </span>
      )}
    </div>
  );
}
