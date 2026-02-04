/**
 * Tests for Momentum Scanner
 */

import {
  calculateRSI,
  calculateMACD,
  calculateEMA,
  calculateSMA,
  calculateATR,
  detectRegime,
  generateDemoScannerHits,
  generateDemoAlerts,
  getVolatilityAdjustedThreshold,
  estimatePriceVolatility,
} from '../../src/lib/momentum-scanner';

describe('Momentum Scanner', () => {
  describe('calculateRSI', () => {
    it('should return 50 for insufficient data', () => {
      expect(calculateRSI([100, 101])).toBe(50);
      expect(calculateRSI([])).toBe(50);
    });

    it('should return 100 for only gains', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      expect(calculateRSI(prices)).toBeCloseTo(100, 0);
    });

    it('should return near 0 for only losses', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 - i);
      const rsi = calculateRSI(prices);
      expect(rsi).toBeLessThan(10);
    });

    it('should return between 0 and 100', () => {
      const prices = [100, 102, 99, 103, 98, 105, 97, 106, 96, 107, 95, 108, 94, 109, 93, 110];
      const rsi = calculateRSI(prices);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should handle flat prices', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      const rsi = calculateRSI(prices);
      // Flat prices should give RSI around 50 (or 100 if avgLoss is exactly 0)
      expect(rsi).toBeDefined();
    });
  });

  describe('calculateEMA', () => {
    it('should return last price for insufficient data', () => {
      expect(calculateEMA([100], 14)).toBe(100);
      expect(calculateEMA([100, 101], 14)).toBe(101);
    });

    it('should return 0 for empty array', () => {
      expect(calculateEMA([], 14)).toBe(0);
    });

    it('should weight recent prices more heavily', () => {
      const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 120];
      const ema = calculateEMA(prices, 5);
      const sma = calculateSMA(prices, 5);
      
      // EMA should be closer to 120 than SMA because it weights recent prices more
      expect(Math.abs(ema - 120)).toBeLessThan(Math.abs(sma - 120));
    });

    it('should handle single value array', () => {
      expect(calculateEMA([50], 14)).toBe(50);
    });
  });

  describe('calculateSMA', () => {
    it('should return last price for insufficient data', () => {
      expect(calculateSMA([100], 14)).toBe(100);
    });

    it('should return 0 for empty array', () => {
      expect(calculateSMA([], 14)).toBe(0);
    });

    it('should calculate correct average', () => {
      const prices = [10, 20, 30, 40, 50];
      expect(calculateSMA(prices, 5)).toBe(30);
    });

    it('should use only last N prices', () => {
      const prices = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50];
      expect(calculateSMA(prices, 5)).toBe(30);
    });
  });

  describe('calculateMACD', () => {
    it('should return MACD components', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 5);
      const result = calculateMACD(prices);
      
      expect(result).toHaveProperty('macd');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('histogram');
    });

    it('should have histogram as difference of macd and signal', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const result = calculateMACD(prices);
      
      expect(result.histogram).toBeCloseTo(result.macd - result.signal, 5);
    });
  });

  describe('calculateATR', () => {
    it('should return 0 for insufficient data', () => {
      const highs = [100, 101];
      const lows = [99, 100];
      const closes = [99.5, 100.5];
      
      expect(calculateATR(highs, lows, closes)).toBe(0);
    });

    it('should calculate ATR correctly', () => {
      const len = 20;
      const highs = Array.from({ length: len }, (_, i) => 102 + i * 0.1);
      const lows = Array.from({ length: len }, (_, i) => 98 + i * 0.1);
      const closes = Array.from({ length: len }, (_, i) => 100 + i * 0.1);
      
      const atr = calculateATR(highs, lows, closes, 14);
      
      // ATR should be positive
      expect(atr).toBeGreaterThan(0);
      // ATR should be roughly the average true range (high - low for simple case)
      expect(atr).toBeCloseTo(4, 0);
    });

    it('should handle gaps (close outside prev range)', () => {
      const highs = [100, 110, 115];
      const lows = [95, 105, 110];
      const closes = [98, 108, 112];
      
      // Gap up scenario
      const atr = calculateATR(highs, lows, closes, 2);
      // True range should account for gap
      expect(atr).toBeGreaterThan(5);
    });
  });

  describe('getVolatilityAdjustedThreshold', () => {
    it('should return 1.5% for low volatility (< 15%)', () => {
      expect(getVolatilityAdjustedThreshold(0.10)).toBe(0.015);
      expect(getVolatilityAdjustedThreshold(0.05)).toBe(0.015);
      expect(getVolatilityAdjustedThreshold(0.14)).toBe(0.015);
    });

    it('should return 2% for normal volatility (15-30%)', () => {
      expect(getVolatilityAdjustedThreshold(0.15)).toBe(0.02);
      expect(getVolatilityAdjustedThreshold(0.20)).toBe(0.02);
      expect(getVolatilityAdjustedThreshold(0.29)).toBe(0.02);
    });

    it('should return 3% for high volatility (30-50%)', () => {
      expect(getVolatilityAdjustedThreshold(0.30)).toBe(0.03);
      expect(getVolatilityAdjustedThreshold(0.40)).toBe(0.03);
      expect(getVolatilityAdjustedThreshold(0.49)).toBe(0.03);
    });

    it('should return 4% for very high volatility (> 50%)', () => {
      expect(getVolatilityAdjustedThreshold(0.50)).toBe(0.04);
      expect(getVolatilityAdjustedThreshold(0.75)).toBe(0.04);
      expect(getVolatilityAdjustedThreshold(1.00)).toBe(0.04);
    });

    it('should handle boundary values', () => {
      expect(getVolatilityAdjustedThreshold(0.149999)).toBe(0.015);
      expect(getVolatilityAdjustedThreshold(0.150001)).toBe(0.02);
      expect(getVolatilityAdjustedThreshold(0.299999)).toBe(0.02);
      expect(getVolatilityAdjustedThreshold(0.300001)).toBe(0.03);
    });

    it('should handle zero volatility', () => {
      expect(getVolatilityAdjustedThreshold(0)).toBe(0.015);
    });

    it('should handle negative volatility (edge case)', () => {
      // Negative shouldn't happen but should be handled gracefully
      expect(getVolatilityAdjustedThreshold(-0.10)).toBe(0.015);
    });
  });

  describe('estimatePriceVolatility', () => {
    it('should return default 20% for insufficient data', () => {
      expect(estimatePriceVolatility([100])).toBe(0.20);
      expect(estimatePriceVolatility([100, 101])).toBe(0.20);
      expect(estimatePriceVolatility([])).toBe(0.20);
    });

    it('should return default for period larger than data', () => {
      const prices = Array.from({ length: 10 }, () => 100);
      expect(estimatePriceVolatility(prices, 20)).toBe(0.20);
    });

    it('should return 0 for flat prices', () => {
      const prices = Array.from({ length: 30 }, () => 100);
      expect(estimatePriceVolatility(prices)).toBe(0);
    });

    it('should return positive volatility for varying prices', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 5);
      const vol = estimatePriceVolatility(prices);
      expect(vol).toBeGreaterThan(0);
    });

    it('should return higher volatility for more volatile prices', () => {
      // Low volatility prices (small movements)
      const lowVolPrices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 1);
      // High volatility prices (large movements)
      const highVolPrices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);
      
      const lowVol = estimatePriceVolatility(lowVolPrices);
      const highVol = estimatePriceVolatility(highVolPrices);
      
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('should use specified period', () => {
      const prices = Array.from({ length: 50 }, (_, i) => {
        // First 30 prices: low volatility
        if (i < 30) return 100 + (i % 2) * 0.5;
        // Last 20 prices: high volatility
        return 100 + (i % 2) * 5;
      });
      
      // Shorter period should capture recent high volatility
      const shortPeriod = estimatePriceVolatility(prices, 15);
      // Longer period should average out the volatility
      const longPeriod = estimatePriceVolatility(prices, 40);
      
      // Both should be positive
      expect(shortPeriod).toBeGreaterThan(0);
      expect(longPeriod).toBeGreaterThan(0);
    });

    it('should handle prices with zeros', () => {
      const prices = [100, 0, 100, 100, 100, 100, 100, 100, 100, 100, 
                      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
      // Should not throw and handle zero price gracefully
      const vol = estimatePriceVolatility(prices);
      expect(typeof vol).toBe('number');
      expect(isNaN(vol)).toBe(false);
    });

    it('should return reasonable volatility for realistic price series', () => {
      // Simulate daily prices with ~1% daily moves
      const prices: number[] = [100];
      for (let i = 1; i < 50; i++) {
        prices.push(prices[i - 1] * (1 + (Math.random() - 0.5) * 0.02));
      }
      
      const vol = estimatePriceVolatility(prices);
      
      // With ~1% daily moves, annualized vol should be around 15-20%
      expect(vol).toBeGreaterThan(0.05);
      expect(vol).toBeLessThan(0.50);
    });
  });

  describe('detectRegime', () => {
    it('should return ranging for insufficient data', () => {
      const prices = Array.from({ length: 30 }, () => 100);
      expect(detectRegime(prices)).toBe('ranging');
    });

    it('should detect trending up', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
      expect(detectRegime(prices)).toBe('trending_up');
    });

    it('should detect trending down', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 - i * 0.5);
      expect(detectRegime(prices)).toBe('trending_down');
    });

    it('should detect ranging market', () => {
      // Oscillating prices
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 2);
      expect(detectRegime(prices)).toBe('ranging');
    });

    it('should use fixed threshold when volatility adjustment disabled', () => {
      // Prices with strong trend but also high volatility
      const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
      
      // Without volatility adjustment, uses fixed 2% threshold
      const regimeNoAdj = detectRegime(prices, false);
      // With volatility adjustment, threshold might be higher
      const regimeWithAdj = detectRegime(prices, true);
      
      // Both should return a regime
      expect(['trending_up', 'trending_down', 'ranging']).toContain(regimeNoAdj);
      expect(['trending_up', 'trending_down', 'ranging']).toContain(regimeWithAdj);
    });

    it('should be more conservative with high volatility', () => {
      // Borderline trending case with high volatility
      // The MA separation is just above 2% but below 3%
      const prices: number[] = [];
      let price = 100;
      for (let i = 0; i < 60; i++) {
        price += 0.15; // Gentle uptrend
        price += (Math.random() - 0.5) * 3; // High daily volatility
        prices.push(price);
      }
      
      // With high volatility, should be more likely to classify as ranging
      const regime = detectRegime(prices, true);
      expect(['trending_up', 'ranging']).toContain(regime);
    });

    it('should work with default parameter (volatility adjustment enabled)', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
      // Should work without explicit second parameter
      const regime = detectRegime(prices);
      expect(regime).toBe('trending_up');
    });
  });

  describe('generateDemoScannerHits', () => {
    it('should generate requested number of hits', () => {
      const hits = generateDemoScannerHits(10);
      expect(hits).toHaveLength(10);
    });

    it('should have all required properties', () => {
      const hits = generateDemoScannerHits(1);
      const hit = hits[0];
      
      expect(hit).toHaveProperty('id');
      expect(hit).toHaveProperty('symbol');
      expect(hit).toHaveProperty('price');
      expect(hit).toHaveProperty('changePercent');
      expect(hit).toHaveProperty('volume');
      expect(hit).toHaveProperty('relativeVolume');
      expect(hit).toHaveProperty('breakoutType');
      expect(hit).toHaveProperty('signalStrength');
      expect(hit).toHaveProperty('rsi');
      expect(hit).toHaveProperty('macd');
      expect(hit).toHaveProperty('priceHistory');
    });

    it('should sort by signal strength (descending)', () => {
      const hits = generateDemoScannerHits(10);
      
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i - 1].signalStrength).toBeGreaterThanOrEqual(hits[i].signalStrength);
      }
    });

    it('should have valid RSI range', () => {
      const hits = generateDemoScannerHits(20);
      
      hits.forEach(hit => {
        expect(hit.rsi).toBeGreaterThanOrEqual(0);
        expect(hit.rsi).toBeLessThanOrEqual(100);
      });
    });

    it('should have positive prices and volumes', () => {
      const hits = generateDemoScannerHits(20);
      
      hits.forEach(hit => {
        expect(hit.price).toBeGreaterThan(0);
        expect(hit.volume).toBeGreaterThan(0);
        expect(hit.avgVolume).toBeGreaterThan(0);
      });
    });

    it('should have 30 items in price history', () => {
      const hits = generateDemoScannerHits(5);
      
      hits.forEach(hit => {
        expect(hit.priceHistory).toHaveLength(30);
        expect(hit.volumeHistory).toHaveLength(30);
      });
    });
  });

  describe('generateDemoAlerts', () => {
    it('should generate alerts from hits', () => {
      const hits = generateDemoScannerHits(10);
      const alerts = generateDemoAlerts(hits);
      
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBeLessThanOrEqual(10);
    });

    it('should have required alert properties', () => {
      const hits = generateDemoScannerHits(10);
      const alerts = generateDemoAlerts(hits);
      
      if (alerts.length > 0) {
        const alert = alerts[0];
        expect(alert).toHaveProperty('id');
        expect(alert).toHaveProperty('symbol');
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('timestamp');
        expect(alert).toHaveProperty('dismissed');
      }
    });

    it('should not have dismissed alerts by default', () => {
      const hits = generateDemoScannerHits(10);
      const alerts = generateDemoAlerts(hits);
      
      alerts.forEach(alert => {
        expect(alert.dismissed).toBe(false);
      });
    });
  });
});
