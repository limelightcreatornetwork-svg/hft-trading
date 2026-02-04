/**
 * Breakout Strategy
 *
 * Trades in TREND/VOL_EXPANSION regime on N-bar high/low breaks
 * with volume confirmation and ATR-based stops.
 */

import type { TradingStrategy, StrategyContext, StrategySignal } from './types';
import { calculateATR } from '../momentum-scanner';

const LOOKBACK = 20; // N-bar lookback for high/low

export class BreakoutStrategy implements TradingStrategy {
  name = 'Breakout';
  type = 'breakout';
  description = 'N-bar high/low breakout with volume and ATR-based stops';
  supportedRegimes = ['TREND' as const, 'VOL_EXPANSION' as const];

  evaluate(context: StrategyContext): StrategySignal {
    const { prices, highs, lows, volumes, currentPrice, regime } = context;

    if (regime !== 'TREND' && regime !== 'VOL_EXPANSION') {
      return { action: 'hold', confidence: 0, reason: 'Not in TREND or VOL_EXPANSION regime' };
    }

    if (highs.length < LOOKBACK + 1 || lows.length < LOOKBACK + 1) {
      return { action: 'hold', confidence: 0, reason: 'Insufficient price data' };
    }

    // N-bar high/low (excluding current bar)
    const lookbackHighs = highs.slice(-(LOOKBACK + 1), -1);
    const lookbackLows = lows.slice(-(LOOKBACK + 1), -1);
    const nBarHigh = Math.max(...lookbackHighs);
    const nBarLow = Math.min(...lookbackLows);

    // ATR for stop sizing
    const atr = calculateATR(highs, lows, prices, 14);

    // Volume confirmation: current > 2x average
    const avgVolume = volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : 0;
    const recentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const volumeConfirmed = avgVolume > 0 && recentVolume > avgVolume * 2;

    // ATR-based stop as percentage
    const atrStopPct = atr > 0 && currentPrice > 0
      ? (atr * 1.5 / currentPrice) * 100
      : 2;
    const atrTpPct = atrStopPct * 2;

    // Buy breakout: price breaks above N-bar high with volume
    if (currentPrice > nBarHigh) {
      let confidence = 0.4;
      if (volumeConfirmed) confidence += 0.3;
      if (regime === 'VOL_EXPANSION') confidence += 0.1;
      const breakoutPct = nBarHigh > 0
        ? ((currentPrice - nBarHigh) / nBarHigh) * 100
        : 0;
      if (breakoutPct > 0.5) confidence += 0.1;
      if (breakoutPct > 1) confidence += 0.1;

      return {
        action: 'buy',
        confidence: Math.min(confidence, 1),
        reason: `Price broke ${LOOKBACK}-bar high ($${nBarHigh.toFixed(2)})${volumeConfirmed ? ' with 2x volume' : ''}`,
        suggestedStopLossPct: Math.max(atrStopPct, 1),
        suggestedTakeProfitPct: Math.max(atrTpPct, 2),
      };
    }

    // Sell breakout: price breaks below N-bar low with volume
    if (currentPrice < nBarLow) {
      let confidence = 0.4;
      if (volumeConfirmed) confidence += 0.3;
      if (regime === 'VOL_EXPANSION') confidence += 0.1;
      const breakdownPct = nBarLow > 0
        ? ((nBarLow - currentPrice) / nBarLow) * 100
        : 0;
      if (breakdownPct > 0.5) confidence += 0.1;
      if (breakdownPct > 1) confidence += 0.1;

      return {
        action: 'sell',
        confidence: Math.min(confidence, 1),
        reason: `Price broke ${LOOKBACK}-bar low ($${nBarLow.toFixed(2)})${volumeConfirmed ? ' with 2x volume' : ''}`,
        suggestedStopLossPct: Math.max(atrStopPct, 1),
        suggestedTakeProfitPct: Math.max(atrTpPct, 2),
      };
    }

    return { action: 'hold', confidence: 0, reason: 'No breakout signal' };
  }
}
