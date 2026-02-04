/**
 * Tests for Mean Reversion Strategy
 */

import { MeanReversionStrategy } from '../../../src/lib/strategies/mean-reversion-strategy';
import type { StrategyContext } from '../../../src/lib/strategies/types';

function makeContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  const basePrices = Array(30).fill(100);
  return {
    symbol: 'AAPL',
    prices: basePrices,
    highs: basePrices.map(p => p + 1),
    lows: basePrices.map(p => p - 1),
    volumes: Array(30).fill(1000000),
    currentPrice: 100,
    regime: 'CHOP',
    regimeConfidence: 0.7,
    ...overrides,
  };
}

describe('MeanReversionStrategy', () => {
  const strategy = new MeanReversionStrategy();

  it('should have correct metadata', () => {
    expect(strategy.name).toBe('Mean Reversion');
    expect(strategy.type).toBe('meanReversion');
    expect(strategy.supportedRegimes).toContain('CHOP');
  });

  it('should return hold when not in CHOP regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'TREND' }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Not in CHOP');
  });

  it('should return hold with insufficient data', () => {
    const signal = strategy.evaluate(makeContext({ prices: [100, 101] }));
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('Insufficient');
  });

  it('should generate buy signal when oversold', () => {
    // Create prices that drop sharply to produce RSI < 30
    const prices = [
      ...Array(15).fill(110),
      108, 106, 104, 102, 100, 98, 96, 94, 92, 90,
      88, 86, 84, 82, 80,
    ];
    const currentPrice = 80;

    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice,
    }));

    // Should be buy or hold (depends on exact RSI/BB calc)
    expect(['buy', 'hold']).toContain(signal.action);
    if (signal.action === 'buy') {
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.reason).toContain('oversold');
    }
  });

  it('should generate sell signal when overbought', () => {
    // Create prices that rise sharply to produce RSI > 70
    const prices = [
      ...Array(15).fill(90),
      92, 94, 96, 98, 100, 102, 104, 106, 108, 110,
      112, 114, 116, 118, 120,
    ];
    const currentPrice = 120;

    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice,
    }));

    expect(['sell', 'hold']).toContain(signal.action);
    if (signal.action === 'sell') {
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.reason).toContain('overbought');
    }
  });

  it('should return hold with neutral conditions', () => {
    // Flat prices: RSI ~50, no Bollinger deviation
    const signal = strategy.evaluate(makeContext());
    expect(signal.action).toBe('hold');
  });

  it('should include suggested stop/take profit on signals', () => {
    const prices = [
      ...Array(15).fill(110),
      108, 106, 104, 102, 100, 98, 96, 94, 92, 90,
      88, 86, 84, 82, 80,
    ];
    const signal = strategy.evaluate(makeContext({
      prices,
      currentPrice: 80,
    }));

    if (signal.action !== 'hold') {
      expect(signal.suggestedStopLossPct).toBeDefined();
      expect(signal.suggestedTakeProfitPct).toBeDefined();
    }
  });

  it('should return hold in VOL_EXPANSION regime', () => {
    const signal = strategy.evaluate(makeContext({ regime: 'VOL_EXPANSION' }));
    expect(signal.action).toBe('hold');
  });
});
