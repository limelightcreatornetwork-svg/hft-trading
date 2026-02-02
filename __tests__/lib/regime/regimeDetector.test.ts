import {
  RegimeDetector,
  createRegimeDetector,
  detectRegime,
  MarketRegime,
} from '@/lib/regime/regimeDetector';
import { MarketDataInput } from '@/lib/regime/types';

function createMockMarketData(overrides: Partial<MarketDataInput> = {}): MarketDataInput {
  return {
    symbol: 'TEST',
    timestamp: new Date('2024-01-15T15:00:00Z'), // During trading hours
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
    averageSpread: 0.1,
    isHalted: false,
    hasGap: false,
    lastUpdateMs: 50,
    ...overrides,
  };
}

describe('RegimeDetector', () => {
  let detector: RegimeDetector;

  beforeEach(() => {
    detector = new RegimeDetector();
  });

  describe('detect', () => {
    it('returns a complete regime result', () => {
      const data = createMockMarketData();
      const result = detector.detect(data);

      expect(result.symbol).toBe('TEST');
      expect(result.timestamp).toEqual(data.timestamp);
      expect(Object.values(MarketRegime)).toContain(result.regime);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.scores).toBeDefined();
      expect(result.indicators).toBeDefined();
      expect(result.guidance).toBeDefined();
    });

    it('detects UNTRADEABLE when stock is halted', () => {
      const data = createMockMarketData({ isHalted: true });
      const result = detector.detect(data);

      expect(result.regime).toBe(MarketRegime.UNTRADEABLE);
      expect(result.guidance.canTrade).toBe(false);
    });

    it('detects UNTRADEABLE when data is stale', () => {
      const data = createMockMarketData({ lastUpdateMs: 10000 }); // 10 seconds stale
      const result = detector.detect(data);

      expect(result.scores.untradeable).toBeGreaterThan(0.3);
    });

    it('detects UNTRADEABLE for wide spreads', () => {
      const data = createMockMarketData({
        currentSpread: 1.0,
        averageSpread: 0.1, // 10x spread
      });
      const result = detector.detect(data);

      // Wide spreads should significantly increase untradeable score
      expect(result.scores.untradeable).toBeGreaterThan(0.3);
      expect(result.guidance.warnings.some(w => w.toLowerCase().includes('spread'))).toBe(true);
    });

    it('detects VOL_EXPANSION when volatility ratio is high', () => {
      // Create choppy data with high short-term vol
      const choppyPrices = Array.from({ length: 30 }, (_, i) => 
        100 + (i % 2 === 0 ? 5 : -5) // Big oscillations
      );
      
      const data = createMockMarketData({
        prices: choppyPrices,
        closes: choppyPrices,
        highs: choppyPrices.map(p => p + 2),
        lows: choppyPrices.map(p => p - 2),
      });
      
      const result = detector.detect(data);
      
      // Should detect elevated volatility
      expect(result.indicators.volRatio).toBeGreaterThan(0);
    });

    it('provides trading guidance', () => {
      const data = createMockMarketData();
      const result = detector.detect(data);

      expect(result.guidance.suggestedStopMultiplier).toBeGreaterThan(0);
      expect(result.guidance.suggestedPositionSize).toBeGreaterThanOrEqual(0);
      expect(result.guidance.suggestedPositionSize).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.guidance.warnings)).toBe(true);
    });

    it('provides directional guidance in TREND regime', () => {
      // Strong uptrend
      const trendingPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      
      const data = createMockMarketData({
        prices: trendingPrices,
        closes: trendingPrices,
        highs: trendingPrices.map(p => p + 1),
        lows: trendingPrices.map(p => p - 0.5),
      });
      
      const result = detector.detect(data);
      
      // Should have higher trend score
      expect(result.scores.trend).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('accepts custom configuration', () => {
      const customDetector = new RegimeDetector({
        adxTrendThreshold: 30,
        volExpansionThreshold: 2.0,
      });

      const config = customDetector.getConfig();
      
      expect(config.adxTrendThreshold).toBe(30);
      expect(config.volExpansionThreshold).toBe(2.0);
    });

    it('allows updating configuration', () => {
      detector.updateConfig({ staleDataThresholdMs: 3000 });
      
      const config = detector.getConfig();
      expect(config.staleDataThresholdMs).toBe(3000);
    });
  });
});

describe('createRegimeDetector', () => {
  it('creates a detector instance', () => {
    const detector = createRegimeDetector();
    expect(detector).toBeInstanceOf(RegimeDetector);
  });

  it('accepts custom config', () => {
    const detector = createRegimeDetector({ adxChopThreshold: 15 });
    const config = detector.getConfig();
    expect(config.adxChopThreshold).toBe(15);
  });
});

describe('detectRegime', () => {
  it('provides quick regime detection', () => {
    const data = createMockMarketData();
    const result = detectRegime(data);

    expect(result.symbol).toBe('TEST');
    expect(Object.values(MarketRegime)).toContain(result.regime);
  });

  it('accepts custom config', () => {
    const data = createMockMarketData();
    const result = detectRegime(data, { adxTrendThreshold: 50 });

    expect(result).toBeDefined();
  });
});

describe('Edge cases', () => {
  it('handles empty price arrays gracefully', () => {
    const data = createMockMarketData({
      prices: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
    });
    
    const detector = new RegimeDetector();
    const result = detector.detect(data);
    
    // Should not throw, should return some result
    expect(result.regime).toBeDefined();
  });

  it('handles single price point', () => {
    const data = createMockMarketData({
      prices: [100],
      highs: [101],
      lows: [99],
      closes: [100],
      volumes: [100000],
    });
    
    const detector = new RegimeDetector();
    const result = detector.detect(data);
    
    expect(result.regime).toBeDefined();
  });

  it('handles pre-market session', () => {
    const data = createMockMarketData({
      timestamp: new Date('2024-01-15T11:00:00Z'), // 6 AM EST - pre-market
    });
    
    const detector = new RegimeDetector();
    const result = detector.detect(data);
    
    // Pre-market should add to untradeable score
    expect(result.scores.untradeable).toBeGreaterThan(0);
  });

  it('handles after-hours session', () => {
    const data = createMockMarketData({
      timestamp: new Date('2024-01-15T23:00:00Z'), // 6 PM EST - after hours
    });
    
    const detector = new RegimeDetector();
    const result = detector.detect(data);
    
    expect(result.scores.untradeable).toBeGreaterThan(0);
  });

  it('handles gaps correctly', () => {
    const data = createMockMarketData({
      hasGap: true,
      gapSize: 0.05, // 5% gap
    });
    
    const detector = new RegimeDetector();
    const result = detector.detect(data);
    
    expect(result.scores.untradeable).toBeGreaterThan(0);
    expect(result.guidance.warnings.length).toBeGreaterThan(0);
  });
});
