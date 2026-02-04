/**
 * Momentum Strategy
 *
 * Trades in TREND regime when RSI is 40-70, MACD is positive,
 * price is above EMA20, and volume confirms the move.
 */

import type { TradingStrategy, StrategyContext, StrategySignal } from './types';
import { calculateRSI, calculateMACD, calculateEMA } from '../momentum-scanner';

export class MomentumStrategy implements TradingStrategy {
  name = 'Momentum';
  type = 'momentum';
  description = 'Trend-following strategy using RSI, MACD, and EMA confirmation';
  supportedRegimes = ['TREND' as const];

  evaluate(context: StrategyContext): StrategySignal {
    const { prices, volumes, currentPrice, regime } = context;

    if (regime !== 'TREND') {
      return { action: 'hold', confidence: 0, reason: 'Not in TREND regime' };
    }

    if (prices.length < 26) {
      return { action: 'hold', confidence: 0, reason: 'Insufficient price data' };
    }

    const rsi = calculateRSI(prices);
    const macd = calculateMACD(prices);
    const ema20 = calculateEMA(prices, 20);

    // Volume confirmation: recent volume > 1.2x average
    const avgVolume = volumes.length > 0
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 20)
      : 0;
    const recentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const volumeConfirmed = avgVolume > 0 && recentVolume > avgVolume * 1.2;

    // Buy signal: RSI 40-70, MACD positive, price > EMA20, volume up
    if (rsi >= 40 && rsi <= 70 && macd.macd > 0 && currentPrice > ema20) {
      let confidence = 0.5;
      if (macd.histogram > 0) confidence += 0.15;
      if (volumeConfirmed) confidence += 0.2;
      if (rsi >= 50 && rsi <= 60) confidence += 0.15;

      return {
        action: 'buy',
        confidence: Math.min(confidence, 1),
        reason: `RSI ${rsi.toFixed(1)}, MACD ${macd.macd.toFixed(3)} positive, price above EMA20${volumeConfirmed ? ', volume confirmed' : ''}`,
        suggestedStopLossPct: 2,
        suggestedTakeProfitPct: 4,
      };
    }

    // Sell signal: RSI > 70 (overbought in trend) or MACD turning negative
    if (rsi > 70 || (macd.macd < 0 && currentPrice < ema20)) {
      let confidence = 0.4;
      if (rsi > 75) confidence += 0.2;
      if (macd.histogram < 0) confidence += 0.15;
      if (volumeConfirmed) confidence += 0.15;

      return {
        action: 'sell',
        confidence: Math.min(confidence, 1),
        reason: `RSI ${rsi.toFixed(1)}${rsi > 70 ? ' overbought' : ''}, MACD ${macd.macd.toFixed(3)}`,
        suggestedStopLossPct: 2,
        suggestedTakeProfitPct: 3,
      };
    }

    return { action: 'hold', confidence: 0, reason: 'No momentum signal' };
  }
}
