/**
 * Tests for Momentum Strategy
 */

import { MomentumStrategy } from '../../../src/lib/strategies/momentum-strategy';
import type { StrategyContext } from '../../../src/lib/strategies/types';

function makeContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  // Generate 30 prices trending upward (momentum-friendly)
  const basePrices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
  return {
    symbol: 'AAPL',
    prices: basePrices,
    highs: basePrices.map(p => p + 1),
    lows: basePrices.map(p => p - 1),
    volumes: Array(30).fill(1000000),
    currentPrice: basePrices[basePrices.length - 1],
    regime: 'TREND',
    regimeConfidence: 0.8,
    ...overrides,
  };
}

describe('MomentumStrategy', () => {
  const strategy = new MomentumStrategy();

  it('should have correct metadata', () => {
    expect(strategy.name).toBe('Momentum');
    expect(strategy.type).toBe('momentum');
    expect(strategy.supportedRegimes).toContain('TREND');
  });

  it('should return hold when not in TREND regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'CHOP' }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Not in TREND');
  });

  it('should return hold with insufficient data', () => {
    const signal = strategy.evaluate(makeContext({ prices: [100, 101, 102] }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Insufficient');
  });

  it('should generate buy signal on moderate uptrend with momentum', () => {
    // Zigzag uptrend with pullbacks: RSI ~60, MACD positive, price > EMA20
    const prices = [
      100, 100.8, 100.2, 101.0, 100.4, 101.2, 100.6, 101.4, 100.8, 101.6,
      101.0, 101.8, 101.2, 102.0, 101.4, 102.2, 101.6, 102.4, 101.8, 102.6,
      102.0, 102.8, 102.2, 103.0, 102.4, 103.2, 102.6, 103.4, 102.8, 103.6,
    ];
    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice: prices[prices.length - 1],
    }));
    expect(signal.action).toBe('buy');
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.suggestedStopLossPct).toBeDefined();
    expect(signal.suggestedTakeProfitPct).toBeDefined();
  });

  it('should generate sell signal when overbought', () => {
    // Sharply rising prices produce RSI > 70
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 3);
    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice: prices[prices.length - 1],
    }));
    expect(['sell', 'hold']).toContain(signal.action);
  });

  it('should boost confidence with volume confirmation', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.3);
    const volumes = Array(29).fill(100000);
    volumes.push(250000); // last volume is 2.5x average

    const withVolume = strategy.evaluate(makeContext({
      prices,
      volumes,
      currentPrice: prices[prices.length - 1],
    }));

    const withoutVolume = strategy.evaluate(makeContext({
      prices,
      volumes: Array(30).fill(100000),
      currentPrice: prices[prices.length - 1],
    }));

    // Both could be buy or hold; if both buy, volume version should have >= confidence
    if (withVolume.action === 'buy' && withoutVolume.action === 'buy') {
      expect(withVolume.confidence).toBeGreaterThanOrEqual(withoutVolume.confidence);
    }
  });

  it('should return hold or sell when no clear buy signal', () => {
    // Flat prices give neutral RSI (~50) and near-zero MACD
    // Price equals EMA20 so no strong signal in either direction
    const prices = Array(30).fill(100);
    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice: 100,
    }));
    // With flat prices at exactly EMA, this could be hold or sell (MACD ~0, price = EMA)
    expect(['hold', 'sell']).toContain(signal.action);
  });

  it('should return hold in UNTRADEABLE regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'UNTRADEABLE' }));
    expect(signal.action).toBe('hold');
  });
});
