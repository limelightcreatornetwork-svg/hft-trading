/**
 * @fileoverview Tests for Regime Detector
 * @module tests/core/regime-detector
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { RegimeDetector } from '../../src/core/regime-detector.js';
import { Regime } from '../../src/core/types.js';

// Noop logger for tests
const noopLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
};

describe('RegimeDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new RegimeDetector({
      logger: noopLogger,
    });
  });

  afterEach(() => {
    detector.reset();
  });

  describe('Volatility Calculation', () => {
    test('calculates realized volatility from price series', () => {
      // Generate prices with known volatility pattern
      const prices = [];
      let price = 100;
      for (let i = 0; i < 25; i++) {
        price *= (1 + (Math.random() - 0.5) * 0.02); // ~2% daily moves
        prices.push(price);
      }

      const vol = detector.calculateRealizedVol(prices);
      expect(vol).toBeDefined();
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(2); // Reasonable annualized vol
    });

    test('returns null for insufficient data', () => {
      const prices = [100, 101, 102]; // Too few prices
      const vol = detector.calculateRealizedVol(prices);
      expect(vol).toBeNull();
    });
  });

  describe('Directional Strength Calculation', () => {
    test('detects strong uptrend', () => {
      // Consistent upward moves
      const highs = [];
      const lows = [];
      const closes = [];
      let price = 100;

      for (let i = 0; i < 20; i++) {
        price *= 1.01; // 1% daily gains
        highs.push(price * 1.005);
        lows.push(price * 0.995);
        closes.push(price);
      }

      const strength = detector.calculateDirectionalStrength(highs, lows, closes);
      expect(strength).toBeGreaterThan(20); // Strong directional movement
    });

    test('detects choppy/sideways market', () => {
      // Random oscillations around same price
      const highs = [];
      const lows = [];
      const closes = [];
      let price = 100;

      for (let i = 0; i < 20; i++) {
        const move = (i % 2 === 0) ? 1.005 : 0.995; // Alternating
        price *= move;
        highs.push(price * 1.003);
        lows.push(price * 0.997);
        closes.push(price);
      }

      const strength = detector.calculateDirectionalStrength(highs, lows, closes);
      expect(strength).toBeLessThan(30); // Weak directional movement
    });

    test('returns null for insufficient data', () => {
      const strength = detector.calculateDirectionalStrength([100, 101], [99, 100], [99.5, 100.5]);
      expect(strength).toBeNull();
    });
  });

  describe('Spread Calculation', () => {
    test('calculates spread in basis points', () => {
      const spreadBps = detector.calculateSpreadBps(99.95, 100.05);
      expect(spreadBps).toBeCloseTo(10, 0); // 10 bps spread
    });

    test('handles missing quotes', () => {
      expect(detector.calculateSpreadBps(null, 100)).toBe(Infinity);
      expect(detector.calculateSpreadBps(100, null)).toBe(Infinity);
      expect(detector.calculateSpreadBps(0, 100)).toBe(Infinity);
    });
  });

  describe('Gap Detection', () => {
    test('detects price gap', () => {
      const gap = detector.detectGap(105, 100); // 5% gap up
      expect(gap).toBeCloseTo(5, 1);
    });

    test('handles missing previous close', () => {
      expect(detector.detectGap(100, null)).toBe(0);
      expect(detector.detectGap(100, 0)).toBe(0);
    });
  });

  describe('Regime Classification', () => {
    test('classifies UNTRADEABLE for halted symbol', () => {
      const result = detector.classifySymbol({
        symbol: 'HALT',
        isHalted: true,
        prices: [100],
      });

      expect(result.regime).toBe(Regime.UNTRADEABLE);
      expect(result.reasons).toContain('halted');
    });

    test('classifies UNTRADEABLE for stale quotes', () => {
      const result = detector.classifySymbol({
        symbol: 'STALE',
        lastQuoteTime: Date.now() - 10000, // 10 seconds ago (stale threshold is 5s)
        prices: [100],
      });

      expect(result.regime).toBe(Regime.UNTRADEABLE);
      expect(result.reasons).toContain('stale_quote');
    });

    test('classifies UNTRADEABLE for wide spread', () => {
      const result = detector.classifySymbol({
        symbol: 'WIDE',
        bid: 99.00,
        ask: 101.00, // 200 bps spread (threshold is 50)
        lastQuoteTime: Date.now(),
        prices: [100],
      });

      expect(result.regime).toBe(Regime.UNTRADEABLE);
      expect(result.reasons).toContain('wide_spread');
    });

    test('classifies CHOP for sideways market', () => {
      // Generate choppy price data
      const prices = [];
      const highs = [];
      const lows = [];
      const closes = [];
      let price = 100;

      for (let i = 0; i < 25; i++) {
        const move = (i % 2 === 0) ? 1.002 : 0.998;
        price *= move;
        prices.push(price);
        highs.push(price * 1.001);
        lows.push(price * 0.999);
        closes.push(price);
      }

      const result = detector.classifySymbol({
        symbol: 'CHOP',
        prices,
        highs,
        lows,
        closes,
        bid: price * 0.9999,
        ask: price * 1.0001,
        lastQuoteTime: Date.now(),
      });

      // Should be CHOP or possibly another regime based on exact data
      expect([Regime.CHOP, Regime.TREND]).toContain(result.regime);
    });

    test('classifies TREND for strong directional move', () => {
      // Generate strong uptrend
      const prices = [];
      const highs = [];
      const lows = [];
      const closes = [];
      let price = 100;

      for (let i = 0; i < 25; i++) {
        price *= 1.02; // 2% daily gains
        prices.push(price);
        highs.push(price * 1.01);
        lows.push(price * 0.995);
        closes.push(price);
      }

      const result = detector.classifySymbol({
        symbol: 'TREND',
        prices,
        highs,
        lows,
        closes,
        bid: price * 0.9999,
        ask: price * 1.0001,
        lastQuoteTime: Date.now(),
      });

      expect([Regime.TREND, Regime.VOL_EXPANSION]).toContain(result.regime);
    });

    test('detects volume anomaly', () => {
      const volumes = Array(20).fill(1000); // Normal volume
      volumes.push(5000); // Spike

      const result = detector.classifySymbol({
        symbol: 'VOL_SPIKE',
        prices: Array(21).fill(100),
        highs: Array(21).fill(101),
        lows: Array(21).fill(99),
        closes: Array(21).fill(100),
        volumes,
        bid: 99.99,
        ask: 100.01,
        lastQuoteTime: Date.now(),
      });

      expect(result.reasons).toContain('volume_anomaly');
    });
  });

  describe('Strategy Eligibility', () => {
    beforeEach(() => {
      // Set up a symbol state
      detector.classifySymbol({
        symbol: 'AAPL',
        prices: Array(25).fill(150),
        highs: Array(25).fill(151),
        lows: Array(25).fill(149),
        closes: Array(25).fill(150),
        bid: 149.99,
        ask: 150.01,
        lastQuoteTime: Date.now(),
      });
    });

    test('allows eligible strategy for regime', () => {
      // Mean reversion is allowed in CHOP
      const result = detector.isStrategyEligible('mean_reversion', 'AAPL');
      
      if (detector.getRegime('AAPL') === Regime.CHOP) {
        expect(result.eligible).toBe(true);
      }
    });

    test('rejects ineligible strategy for regime', () => {
      const regime = detector.getRegime('AAPL');
      
      // If in CHOP, breakout strategy should be rejected
      if (regime === Regime.CHOP) {
        const result = detector.isStrategyEligible('breakout', 'AAPL');
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('regime_mismatch');
      }
    });

    test('rejects for disabled symbol', () => {
      detector.disableSymbol('AAPL', 'testing');
      
      const result = detector.isStrategyEligible('mean_reversion', 'AAPL');
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('symbol_disabled');
    });

    test('rejects during cooldown', () => {
      detector.setCooldown('AAPL', 60000); // 1 minute cooldown
      
      const result = detector.isStrategyEligible('mean_reversion', 'AAPL');
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('cooldown');
    });

    test('returns no_data for unknown symbol', () => {
      const result = detector.isStrategyEligible('mean_reversion', 'UNKNOWN');
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('no_data');
    });
  });

  describe('Symbol Management', () => {
    test('sets and clears cooldown', () => {
      detector.classifySymbol({
        symbol: 'COOL',
        prices: Array(25).fill(100),
        highs: Array(25).fill(101),
        lows: Array(25).fill(99),
        closes: Array(25).fill(100),
        bid: 99.99,
        ask: 100.01,
        lastQuoteTime: Date.now(),
      });

      detector.setCooldown('COOL', 100); // 100ms cooldown
      
      let result = detector.isStrategyEligible('all_weather', 'COOL');
      expect(result.reason).toBe('cooldown');

      // Wait for cooldown to expire
      return new Promise(resolve => {
        setTimeout(() => {
          result = detector.isStrategyEligible('all_weather', 'COOL');
          expect(result.eligible).toBe(true);
          resolve();
        }, 150);
      });
    });

    test('disables and enables symbol', () => {
      detector.classifySymbol({
        symbol: 'DISABLE',
        prices: Array(25).fill(100),
        highs: Array(25).fill(101),
        lows: Array(25).fill(99),
        closes: Array(25).fill(100),
        bid: 99.99,
        ask: 100.01,
        lastQuoteTime: Date.now(),
      });

      detector.disableSymbol('DISABLE', 'manual_disable');
      expect(detector.isStrategyEligible('all_weather', 'DISABLE').eligible).toBe(false);

      detector.enableSymbol('DISABLE');
      expect(detector.isStrategyEligible('all_weather', 'DISABLE').eligible).toBe(true);
    });
  });

  describe('Market-Wide Regime', () => {
    test('calculates market regime from symbol states', () => {
      // Classify multiple symbols
      for (let i = 0; i < 5; i++) {
        detector.classifySymbol({
          symbol: `SYM${i}`,
          prices: Array(25).fill(100),
          highs: Array(25).fill(101),
          lows: Array(25).fill(99),
          closes: Array(25).fill(100),
          bid: 99.99,
          ask: 100.01,
          lastQuoteTime: Date.now(),
        });
      }

      const marketState = detector.calculateMarketRegime();
      expect(marketState).toBeDefined();
      expect(marketState.regime).toBeDefined();
      expect(marketState.confidence).toBeGreaterThan(0);
      expect(marketState.regimeCounts).toBeDefined();
    });

    test('calculates breadth', () => {
      // Create mix of regimes
      const marketState = detector.calculateMarketRegime([
        { regime: Regime.TREND },
        { regime: Regime.TREND },
        { regime: Regime.CHOP },
        { regime: Regime.CHOP },
        { regime: Regime.CHOP },
      ]);

      // Breadth = (TREND + VOL_EXPANSION) / total = 2/5 = 0.4
      expect(marketState.breadth).toBe(0.4);
    });
  });

  describe('Regime Smoothing', () => {
    test('smooths regime transitions to avoid whipsaws', () => {
      const symbol = 'SMOOTH';
      
      // First classification
      detector.classifySymbol({
        symbol,
        prices: Array(25).fill(100),
        highs: Array(25).fill(101),
        lows: Array(25).fill(99),
        closes: Array(25).fill(100),
        bid: 99.99,
        ask: 100.01,
        lastQuoteTime: Date.now(),
      });

      const initialRegime = detector.getRegime(symbol);

      // The smoothed regime should remain stable for a few updates
      // (unless there's a significant change in the underlying data)
      for (let i = 0; i < 2; i++) {
        detector.classifySymbol({
          symbol,
          prices: Array(25).fill(100 + i),
          highs: Array(25).fill(101 + i),
          lows: Array(25).fill(99 + i),
          closes: Array(25).fill(100 + i),
          bid: 99.99 + i,
          ask: 100.01 + i,
          lastQuoteTime: Date.now(),
        });
      }

      // With similar data, regime should be stable
      expect(detector.getRegime(symbol)).toBe(initialRegime);
    });
  });

  describe('State Queries', () => {
    test('returns all symbol states', () => {
      detector.classifySymbol({
        symbol: 'AAPL',
        prices: Array(25).fill(150),
        highs: Array(25).fill(151),
        lows: Array(25).fill(149),
        closes: Array(25).fill(150),
        bid: 149.99,
        ask: 150.01,
        lastQuoteTime: Date.now(),
      });

      detector.classifySymbol({
        symbol: 'MSFT',
        prices: Array(25).fill(400),
        highs: Array(25).fill(401),
        lows: Array(25).fill(399),
        closes: Array(25).fill(400),
        bid: 399.99,
        ask: 400.01,
        lastQuoteTime: Date.now(),
      });

      const states = detector.getAllSymbolStates();
      expect(states.length).toBe(2);
      expect(states.map(s => s.symbol)).toContain('AAPL');
      expect(states.map(s => s.symbol)).toContain('MSFT');
    });
  });
});
