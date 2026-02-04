/**
 * Tests for Breakout Strategy
 */

import { BreakoutStrategy } from '../../../src/lib/strategies/breakout-strategy';
import type { StrategyContext } from '../../../src/lib/strategies/types';

function makeContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  const basePrices = Array(25).fill(100);
  return {
    symbol: 'TSLA',
    prices: basePrices,
    highs: basePrices.map(p => p + 1),
    lows: basePrices.map(p => p - 1),
    volumes: Array(25).fill(1000000),
    currentPrice: 100,
    regime: 'TREND',
    regimeConfidence: 0.8,
    ...overrides,
  };
}

describe('BreakoutStrategy', () => {
  const strategy = new BreakoutStrategy();

  it('should have correct metadata', () => {
    expect(strategy.name).toBe('Breakout');
    expect(strategy.type).toBe('breakout');
    expect(strategy.supportedRegimes).toContain('TREND');
    expect(strategy.supportedRegimes).toContain('VOL_EXPANSION');
  });

  it('should return hold when not in supported regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'CHOP' }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Not in TREND or VOL_EXPANSION');
  });

  it('should return hold with insufficient data', () => {
    const signal = strategy.evaluate(makeContext({
      highs: [100, 101],
      lows: [99, 100],
      prices: [100, 101],
    }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Insufficient');
  });

  it('should generate buy signal on upside breakout', () => {
    // 20 bars at 100, then price breaks above
    const prices = Array(21).fill(100);
    const highs = Array(21).fill(101);
    const lows = Array(21).fill(99);
    const currentPrice = 102; // Above the 20-bar high of 101

    const signal = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      currentPrice,
    }));

    expect(signal.action).toBe('buy');
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.reason).toContain('broke');
    expect(signal.reason).toContain('high');
  });

  it('should generate sell signal on downside breakout', () => {
    const prices = Array(21).fill(100);
    const highs = Array(21).fill(101);
    const lows = Array(21).fill(99);
    const currentPrice = 98; // Below the 20-bar low of 99

    const signal = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      currentPrice,
    }));

    expect(signal.action).toBe('sell');
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.reason).toContain('broke');
    expect(signal.reason).toContain('low');
  });

  it('should boost confidence with volume confirmation', () => {
    const prices = Array(21).fill(100);
    const highs = Array(21).fill(101);
    const lows = Array(21).fill(99);
    const currentPrice = 102;

    // With 2x volume
    const highVolumes = Array(20).fill(100000);
    highVolumes.push(250000);

    const withVolume = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      volumes: highVolumes,
      currentPrice,
    }));

    // Without volume confirmation
    const normalVolumes = Array(21).fill(100000);
    const withoutVolume = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      volumes: normalVolumes,
      currentPrice,
    }));

    expect(withVolume.action).toBe('buy');
    expect(withoutVolume.action).toBe('buy');
    expect(withVolume.confidence).toBeGreaterThan(withoutVolume.confidence);
    expect(withVolume.reason).toContain('volume');
  });

  it('should return hold when price is within range', () => {
    const signal = strategy.evaluate(makeContext());
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('No breakout');
  });

  it('should work in VOL_EXPANSION regime', () => {
    const prices = Array(21).fill(100);
    const highs = Array(21).fill(101);
    const lows = Array(21).fill(99);

    const signal = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      currentPrice: 102,
      regime: 'VOL_EXPANSION',
    }));

    expect(signal.action).toBe('buy');
  });

  it('should include ATR-based stop suggestions', () => {
    const prices = Array(21).fill(100);
    const highs = Array(21).fill(101);
    const lows = Array(21).fill(99);

    const signal = strategy.evaluate(makeContext({
      prices,
      highs,
      lows,
      currentPrice: 102,
    }));

    expect(signal.suggestedStopLossPct).toBeDefined();
    expect(signal.suggestedStopLossPct).toBeGreaterThanOrEqual(1);
    expect(signal.suggestedTakeProfitPct).toBeDefined();
    expect(signal.suggestedTakeProfitPct).toBeGreaterThanOrEqual(2);
  });

  it('should return hold in UNTRADEABLE regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'UNTRADEABLE' }));
    expect(signal.action).toBe('hold');
  });
});
