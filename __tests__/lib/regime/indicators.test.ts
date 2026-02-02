import {
  calculateReturns,
  calculateRealizedVol,
  calculateATR,
  calculateADX,
  calculateZScore,
  calculateSMA,
  getMarketSession,
  computeIndicators,
} from '@/lib/regime/indicators';
import { MarketSession, MarketDataInput } from '@/lib/regime/types';

describe('Regime Indicators', () => {
  describe('calculateReturns', () => {
    it('calculates returns correctly', () => {
      const prices = [100, 102, 101, 105];
      const returns = calculateReturns(prices);
      
      expect(returns).toHaveLength(3);
      expect(returns[0]).toBeCloseTo(0.02, 4);  // 100 -> 102
      expect(returns[1]).toBeCloseTo(-0.0098, 4); // 102 -> 101
      expect(returns[2]).toBeCloseTo(0.0396, 4); // 101 -> 105
    });

    it('handles empty array', () => {
      expect(calculateReturns([])).toEqual([]);
    });

    it('handles single price', () => {
      expect(calculateReturns([100])).toEqual([]);
    });
  });

  describe('calculateRealizedVol', () => {
    it('calculates volatility for trending prices', () => {
      // Consistently rising prices = low vol
      const prices = [100, 101, 102, 103, 104, 105];
      const vol = calculateRealizedVol(prices, 5);
      
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(0.05);
    });

    it('calculates volatility for choppy prices', () => {
      // Oscillating prices = higher vol
      const prices = [100, 105, 95, 110, 90, 115];
      const vol = calculateRealizedVol(prices, 5);
      
      expect(vol).toBeGreaterThan(0.05);
    });

    it('returns 0 for insufficient data', () => {
      const vol = calculateRealizedVol([100, 101], 5);
      expect(vol).toBe(0);
    });
  });

  describe('calculateATR', () => {
    it('calculates ATR correctly', () => {
      const highs = [102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116];
      const lows = [98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
      const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
      
      const atr = calculateATR(highs, lows, closes, 14);
      
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeLessThan(10);
    });

    it('returns 0 for insufficient data', () => {
      const atr = calculateATR([102], [98], [100], 14);
      expect(atr).toBe(0);
    });
  });

  describe('calculateADX', () => {
    it('calculates ADX for trending market', () => {
      // Strong uptrend
      const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const lows = Array.from({ length: 30 }, (_, i) => 98 + i * 2);
      const closes = Array.from({ length: 30 }, (_, i) => 99 + i * 2);
      
      const { adx, plusDI, minusDI } = calculateADX(highs, lows, closes, 14);
      
      expect(adx).toBeGreaterThan(0);
      expect(plusDI).toBeGreaterThan(minusDI); // Bullish
    });

    it('calculates ADX for choppy market', () => {
      // Oscillating market
      const highs = Array.from({ length: 30 }, (_, i) => 102 + (i % 2) * 2);
      const lows = Array.from({ length: 30 }, (_, i) => 98 + (i % 2) * 2);
      const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2) * 2);
      
      const { adx } = calculateADX(highs, lows, closes, 14);
      
      // Choppy market should have lower ADX
      expect(adx).toBeDefined();
    });
  });

  describe('calculateZScore', () => {
    it('calculates z-score correctly', () => {
      const values = [10, 12, 11, 13, 12, 11, 10, 12, 11, 12];
      const zscore = calculateZScore(15, values);
      
      expect(zscore).toBeGreaterThan(2); // 15 is significantly above mean ~11.4
    });

    it('returns 0 for empty array', () => {
      expect(calculateZScore(10, [])).toBe(0);
    });

    it('returns 0 when stddev is 0', () => {
      expect(calculateZScore(10, [5, 5, 5, 5])).toBe(0);
    });
  });

  describe('calculateSMA', () => {
    it('calculates simple moving average', () => {
      const values = [10, 20, 30, 40, 50];
      const sma = calculateSMA(values, 3);
      
      expect(sma).toBe(40); // (30 + 40 + 50) / 3
    });

    it('handles period larger than array', () => {
      const values = [10, 20];
      const sma = calculateSMA(values, 5);
      
      expect(sma).toBe(15); // Uses all available values
    });
  });

  describe('getMarketSession', () => {
    it('identifies pre-market', () => {
      const date = new Date('2024-01-15T11:00:00Z'); // 6 AM EST
      expect(getMarketSession(date)).toBe(MarketSession.PRE_MARKET);
    });

    it('identifies market open', () => {
      const date = new Date('2024-01-15T14:31:00Z'); // 9:31 AM EST
      expect(getMarketSession(date)).toBe(MarketSession.OPEN_AUCTION);
    });

    it('identifies morning session', () => {
      const date = new Date('2024-01-15T15:00:00Z'); // 10 AM EST
      expect(getMarketSession(date)).toBe(MarketSession.MORNING_SESSION);
    });

    it('identifies midday', () => {
      const date = new Date('2024-01-15T18:00:00Z'); // 1 PM EST
      expect(getMarketSession(date)).toBe(MarketSession.MIDDAY);
    });

    it('identifies afternoon session', () => {
      const date = new Date('2024-01-15T20:00:00Z'); // 3 PM EST
      expect(getMarketSession(date)).toBe(MarketSession.AFTERNOON_SESSION);
    });

    it('identifies close auction', () => {
      const date = new Date('2024-01-15T20:55:00Z'); // 3:55 PM EST
      expect(getMarketSession(date)).toBe(MarketSession.CLOSE_AUCTION);
    });

    it('identifies after hours', () => {
      const date = new Date('2024-01-15T22:00:00Z'); // 5 PM EST
      expect(getMarketSession(date)).toBe(MarketSession.AFTER_HOURS);
    });
  });

  describe('computeIndicators', () => {
    it('computes all indicators from market data', () => {
      const data: MarketDataInput = {
        symbol: 'TEST',
        timestamp: new Date('2024-01-15T15:00:00Z'),
        prices: Array.from({ length: 30 }, (_, i) => 100 + i * 0.1),
        highs: Array.from({ length: 30 }, (_, i) => 101 + i * 0.1),
        lows: Array.from({ length: 30 }, (_, i) => 99 + i * 0.1),
        closes: Array.from({ length: 30 }, (_, i) => 100 + i * 0.1),
        volumes: Array.from({ length: 30 }, () => 100000),
        bid: 102.9,
        ask: 103.0,
        bidSize: 100,
        askSize: 100,
        currentSpread: 0.1,
        averageSpread: 0.08,
        isHalted: false,
        hasGap: false,
        lastUpdateMs: 50,
      };

      const indicators = computeIndicators(data);

      expect(indicators.realizedVolShort).toBeGreaterThanOrEqual(0);
      expect(indicators.realizedVolLong).toBeGreaterThanOrEqual(0);
      expect(indicators.volRatio).toBeGreaterThan(0);
      expect(indicators.atr).toBeGreaterThanOrEqual(0);
      expect(indicators.adx).toBeGreaterThanOrEqual(0);
      expect(indicators.spreadRatio).toBeCloseTo(1.25, 2);
      expect(indicators.volumeRatio).toBe(1);
      expect(indicators.session).toBe(MarketSession.MORNING_SESSION);
    });
  });
});
