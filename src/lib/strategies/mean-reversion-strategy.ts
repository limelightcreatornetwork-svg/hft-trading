/**
 * Mean Reversion Strategy
 *
 * Trades in CHOP regime when price deviates from the mean.
 * Uses RSI extremes and Bollinger Band deviation for entries.
 */

import type { TradingStrategy, StrategyContext, StrategySignal } from './types';
import { calculateRSI, calculateSMA } from '../momentum-scanner';

export class MeanReversionStrategy implements TradingStrategy {
  name = 'Mean Reversion';
  type = 'meanReversion';
  description = 'Buy oversold / sell overbought in ranging markets using RSI and Bollinger Bands';
  supportedRegimes = ['CHOP' as const];

  evaluate(context: StrategyContext): StrategySignal {
    const { prices, currentPrice, regime } = context;

    if (regime !== 'CHOP') {
      return { action: 'hold', confidence: 0, reason: 'Not in CHOP regime' };
    }

    if (prices.length < 20) {
      return { action: 'hold', confidence: 0, reason: 'Insufficient price data' };
    }

    const rsi = calculateRSI(prices);
    const sma20 = calculateSMA(prices, 20);

    // Calculate Bollinger Bands (2 std dev)
    const recent20 = prices.slice(-20);
    const variance = recent20.reduce((sum, p) => sum + Math.pow(p - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const upperBand = sma20 + 2 * stdDev;
    const lowerBand = sma20 - 2 * stdDev;

    // Deviation from mean (0 = at SMA, 1 = at band, >1 = beyond band)
    const bandWidth = upperBand - lowerBand;
    const deviation = bandWidth > 0
      ? (currentPrice - sma20) / (bandWidth / 2)
      : 0;

    // Buy signal: RSI < 30 and price near/below lower band
    if (rsi < 30 && deviation < -0.8) {
      let confidence = 0.5;
      if (rsi < 25) confidence += 0.15;
      if (deviation < -1) confidence += 0.2;
      if (currentPrice <= lowerBand) confidence += 0.15;

      return {
        action: 'buy',
        confidence: Math.min(confidence, 1),
        reason: `RSI ${rsi.toFixed(1)} oversold, price ${deviation.toFixed(2)} std devs below mean`,
        suggestedStopLossPct: 1.5,
        suggestedTakeProfitPct: 2.5,
      };
    }

    // Sell signal: RSI > 70 and price near/above upper band
    if (rsi > 70 && deviation > 0.8) {
      let confidence = 0.5;
      if (rsi > 75) confidence += 0.15;
      if (deviation > 1) confidence += 0.2;
      if (currentPrice >= upperBand) confidence += 0.15;

      return {
        action: 'sell',
        confidence: Math.min(confidence, 1),
        reason: `RSI ${rsi.toFixed(1)} overbought, price ${deviation.toFixed(2)} std devs above mean`,
        suggestedStopLossPct: 1.5,
        suggestedTakeProfitPct: 2.5,
      };
    }

    return { action: 'hold', confidence: 0, reason: 'No mean reversion signal' };
  }
}
