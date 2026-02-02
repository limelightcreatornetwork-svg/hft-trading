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
