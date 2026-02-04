/**
 * Strategy Types
 *
 * Core interfaces for the strategy execution framework.
 */

import type { RegimeType } from '../regime';

export interface StrategyContext {
  symbol: string;
  prices: number[];          // Close prices, most recent last
  highs: number[];
  lows: number[];
  volumes: number[];
  currentPrice: number;
  regime: RegimeType;
  regimeConfidence: number;
}

export interface StrategySignal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;         // 0-1
  reason: string;
  suggestedStopLossPct?: number;
  suggestedTakeProfitPct?: number;
  suggestedQuantity?: number;
}

export interface TradingStrategy {
  name: string;
  type: string;
  description: string;
  supportedRegimes: RegimeType[];
  evaluate(context: StrategyContext): StrategySignal;
}
