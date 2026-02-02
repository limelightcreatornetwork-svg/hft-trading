/**
 * Tests for Trading System Constants
 */

import {
  REGIME_THRESHOLDS,
  CONFIDENCE_CONFIG,
  POSITION_SIZING,
  RISK_DEFAULTS,
  DEFAULT_ALLOWED_SYMBOLS,
  TRADE_DEFAULTS,
  MARKET_HOURS,
  VIX_LEVELS,
  RATE_LIMIT,
  TA_PERIODS,
} from '../../src/lib/constants';

describe('Trading System Constants', () => {
  describe('REGIME_THRESHOLDS', () => {
    it('should have logical ADX threshold ordering', () => {
      expect(REGIME_THRESHOLDS.ADX_CHOP).toBeLessThan(REGIME_THRESHOLDS.ADX_TREND);
      expect(REGIME_THRESHOLDS.ADX_TREND).toBeLessThan(REGIME_THRESHOLDS.ADX_STRONG_TREND);
    });

    it('should have logical volatility threshold ordering', () => {
      expect(REGIME_THRESHOLDS.VOL_LOW).toBeLessThan(REGIME_THRESHOLDS.VOL_NORMAL);
      expect(REGIME_THRESHOLDS.VOL_NORMAL).toBeLessThan(REGIME_THRESHOLDS.VOL_HIGH);
      expect(REGIME_THRESHOLDS.VOL_HIGH).toBeLessThan(REGIME_THRESHOLDS.VOL_EXTREME);
    });

    it('should have logical spread threshold ordering', () => {
      expect(REGIME_THRESHOLDS.SPREAD_TIGHT).toBeLessThan(REGIME_THRESHOLDS.SPREAD_WIDE);
      expect(REGIME_THRESHOLDS.SPREAD_WIDE).toBeLessThan(REGIME_THRESHOLDS.SPREAD_EXTREME);
    });

    it('should have logical volume anomaly ordering', () => {
      expect(REGIME_THRESHOLDS.VOL_ANOMALY_LOW).toBeLessThan(REGIME_THRESHOLDS.VOL_ANOMALY_HIGH);
      expect(REGIME_THRESHOLDS.VOL_ANOMALY_HIGH).toBeLessThan(REGIME_THRESHOLDS.VOL_ANOMALY_EXTREME);
    });
  });

  describe('CONFIDENCE_CONFIG', () => {
    it('should have weights that sum to approximately 1.0', () => {
      const totalWeight = 
        CONFIDENCE_CONFIG.WEIGHT_TECHNICAL +
        CONFIDENCE_CONFIG.WEIGHT_RISK_REWARD +
        CONFIDENCE_CONFIG.WEIGHT_MARKET_CONDITIONS +
        CONFIDENCE_CONFIG.WEIGHT_TIME_OF_DAY;
      
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should have score boundaries 1-10', () => {
      expect(CONFIDENCE_CONFIG.SCORE_MIN).toBe(1);
      expect(CONFIDENCE_CONFIG.SCORE_MAX).toBe(10);
    });
  });

  describe('POSITION_SIZING', () => {
    it('should have non-overlapping score ranges', () => {
      expect(POSITION_SIZING.SKIP.max).toBeLessThan(POSITION_SIZING.LOW.min);
      expect(POSITION_SIZING.LOW.max).toBeLessThan(POSITION_SIZING.MEDIUM.min);
      expect(POSITION_SIZING.MEDIUM.max).toBeLessThan(POSITION_SIZING.HIGH.min);
    });

    it('should have increasing position sizes', () => {
      expect(POSITION_SIZING.SKIP.pct).toBe(0);
      expect(POSITION_SIZING.LOW.pct).toBeGreaterThan(POSITION_SIZING.SKIP.pct);
      expect(POSITION_SIZING.MEDIUM.pct).toBeGreaterThan(POSITION_SIZING.LOW.pct);
      expect(POSITION_SIZING.HIGH.pct).toBeGreaterThan(POSITION_SIZING.MEDIUM.pct);
    });

    it('should have reasonable maximum position size', () => {
      expect(POSITION_SIZING.HIGH.pct).toBeLessThanOrEqual(25); // Max 25% of portfolio
    });
  });

  describe('RISK_DEFAULTS', () => {
    it('should have positive limits', () => {
      expect(RISK_DEFAULTS.MAX_POSITION_SIZE).toBeGreaterThan(0);
      expect(RISK_DEFAULTS.MAX_ORDER_SIZE).toBeGreaterThan(0);
      expect(RISK_DEFAULTS.MAX_DAILY_LOSS).toBeGreaterThan(0);
    });

    it('should have order size <= position size', () => {
      expect(RISK_DEFAULTS.MAX_ORDER_SIZE).toBeLessThanOrEqual(RISK_DEFAULTS.MAX_POSITION_SIZE);
    });

    it('should have trading disabled by default', () => {
      expect(RISK_DEFAULTS.TRADING_ENABLED).toBe(false);
    });
  });

  describe('DEFAULT_ALLOWED_SYMBOLS', () => {
    it('should include major tech stocks', () => {
      expect(DEFAULT_ALLOWED_SYMBOLS).toContain('AAPL');
      expect(DEFAULT_ALLOWED_SYMBOLS).toContain('MSFT');
      expect(DEFAULT_ALLOWED_SYMBOLS).toContain('GOOGL');
    });

    it('should include major ETFs', () => {
      expect(DEFAULT_ALLOWED_SYMBOLS).toContain('SPY');
      expect(DEFAULT_ALLOWED_SYMBOLS).toContain('QQQ');
    });

    it('should only contain uppercase symbols', () => {
      DEFAULT_ALLOWED_SYMBOLS.forEach(symbol => {
        expect(symbol).toBe(symbol.toUpperCase());
      });
    });
  });

  describe('TRADE_DEFAULTS', () => {
    it('should have positive time stop', () => {
      expect(TRADE_DEFAULTS.TIME_STOP_HOURS).toBeGreaterThan(0);
    });

    it('should have reasonable TP/SL ratios', () => {
      // TP should generally be >= SL for positive R:R
      expect(TRADE_DEFAULTS.DEFAULT_TP_PCT).toBeGreaterThanOrEqual(TRADE_DEFAULTS.DEFAULT_SL_PCT);
    });

    it('should have TP within min/max bounds', () => {
      expect(TRADE_DEFAULTS.DEFAULT_TP_PCT).toBeGreaterThanOrEqual(TRADE_DEFAULTS.MIN_TP_PCT);
      expect(TRADE_DEFAULTS.DEFAULT_TP_PCT).toBeLessThanOrEqual(TRADE_DEFAULTS.MAX_TP_PCT);
    });

    it('should have SL within min/max bounds', () => {
      expect(TRADE_DEFAULTS.DEFAULT_SL_PCT).toBeGreaterThanOrEqual(TRADE_DEFAULTS.MIN_SL_PCT);
      expect(TRADE_DEFAULTS.DEFAULT_SL_PCT).toBeLessThanOrEqual(TRADE_DEFAULTS.MAX_SL_PCT);
    });
  });

  describe('MARKET_HOURS', () => {
    it('should have valid market open time', () => {
      expect(MARKET_HOURS.OPEN_HOUR).toBe(9);
      expect(MARKET_HOURS.OPEN_MINUTE).toBe(30);
    });

    it('should have valid market close time', () => {
      expect(MARKET_HOURS.CLOSE_HOUR).toBe(16);
      expect(MARKET_HOURS.CLOSE_MINUTE).toBe(0);
    });

    it('should have reasonable avoid periods', () => {
      expect(MARKET_HOURS.OPEN_AVOID_MINUTES).toBeGreaterThan(0);
      expect(MARKET_HOURS.OPEN_AVOID_MINUTES).toBeLessThanOrEqual(30);
      expect(MARKET_HOURS.CLOSE_AVOID_MINUTES).toBeGreaterThan(0);
      expect(MARKET_HOURS.CLOSE_AVOID_MINUTES).toBeLessThanOrEqual(30);
    });
  });

  describe('VIX_LEVELS', () => {
    it('should have increasing VIX thresholds', () => {
      expect(VIX_LEVELS.LOW).toBeLessThan(VIX_LEVELS.NORMAL);
      expect(VIX_LEVELS.NORMAL).toBeLessThan(VIX_LEVELS.ELEVATED);
      expect(VIX_LEVELS.ELEVATED).toBeLessThan(VIX_LEVELS.HIGH);
      expect(VIX_LEVELS.HIGH).toBeLessThan(VIX_LEVELS.EXTREME);
    });
  });

  describe('RATE_LIMIT', () => {
    it('should have reasonable rate limit values', () => {
      expect(RATE_LIMIT.WINDOW_MS).toBeGreaterThan(0);
      expect(RATE_LIMIT.MAX_REQUESTS).toBeGreaterThan(0);
    });

    it('should be at least 1 request per second on average', () => {
      const requestsPerSecond = RATE_LIMIT.MAX_REQUESTS / (RATE_LIMIT.WINDOW_MS / 1000);
      expect(requestsPerSecond).toBeGreaterThanOrEqual(1);
    });
  });

  describe('TA_PERIODS', () => {
    it('should have positive periods', () => {
      expect(TA_PERIODS.ATR).toBeGreaterThan(0);
      expect(TA_PERIODS.ADX).toBeGreaterThan(0);
      expect(TA_PERIODS.LOOKBACK).toBeGreaterThan(0);
      expect(TA_PERIODS.BARS_FETCH).toBeGreaterThan(0);
    });

    it('should fetch enough bars for calculations', () => {
      // Should fetch more bars than the largest period
      expect(TA_PERIODS.BARS_FETCH).toBeGreaterThan(TA_PERIODS.ATR);
      expect(TA_PERIODS.BARS_FETCH).toBeGreaterThan(TA_PERIODS.ADX);
    });
  });
});
