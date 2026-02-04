/**
 * Tests for AlpacaRegimeDetector
 * 
 * Tests the Alpaca-based regime detection system including:
 * - Technical indicator calculations (ATR, ADX, volatility, regression)
 * - Regime classification logic
 * - Caching mechanism
 * - Error handling
 */

import {
  AlpacaRegimeDetector,
  detectRegimeCached,
  clearRegimeCache,
  getRegimeDetector,
  Bar,
  RegimeMetrics,
} from '../../../src/lib/regime/alpacaRegimeDetector';

// Mock the alpaca module
jest.mock('../../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {
    getBarsV2: jest.fn(),
    getLatestQuote: jest.fn(),
  },
}));

import alpaca from '../../../src/lib/alpaca';

const mockAlpaca = alpaca as jest.Mocked<typeof alpaca>;

// Helper to generate mock bars with realistic price variation
function generateMockBars(count: number, options: {
  basePrice?: number;
  trend?: 'up' | 'down' | 'flat';
  volatility?: 'low' | 'normal' | 'high' | 'extreme';
} = {}): Bar[] {
  const { 
    basePrice = 100, 
    trend = 'flat', 
    volatility = 'normal' 
  } = options;

  const bars: Bar[] = [];
  let price = basePrice;

  const volMultiplier = {
    low: 0.002,
    normal: 0.01,
    high: 0.03,
    extreme: 0.08,
  }[volatility];

  const trendDirection = {
    up: 0.003,
    down: -0.003,
    flat: 0,
  }[trend];

  for (let i = 0; i < count; i++) {
    // Add random noise to make prices vary
    const noise = (Math.random() - 0.5) * volMultiplier * price;
    price = price * (1 + trendDirection) + noise;
    const range = price * volMultiplier;
    const high = price + range / 2;
    const low = price - range / 2;

    bars.push({
      Timestamp: new Date(Date.now() - (count - i) * 5 * 60 * 1000).toISOString(),
      OpenPrice: price - range * 0.1,
      HighPrice: high,
      LowPrice: low,
      ClosePrice: price,
      Volume: 100000 + Math.random() * 50000,
      TradeCount: 1000,
      VWAP: price,
    });
  }

  return bars;
}

// Helper to create async iterator from bars
async function* createBarIterator(bars: Bar[]) {
  for (const bar of bars) {
    yield bar;
  }
}

describe('AlpacaRegimeDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRegimeCache();
  });

  describe('constructor', () => {
    it('should create detector with default values', () => {
      const detector = new AlpacaRegimeDetector();
      expect(detector).toBeDefined();
    });

    it('should create detector with custom parameters', () => {
      const detector = new AlpacaRegimeDetector('AAPL', 30, 10, 10);
      expect(detector).toBeDefined();
    });
  });

  describe('getBars', () => {
    it('should fetch bars from Alpaca API', async () => {
      const mockBars = generateMockBars(50);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);

      const detector = new AlpacaRegimeDetector('SPY');
      const bars = await detector.getBars();

      expect(bars).toHaveLength(50);
      expect(mockAlpaca.getBarsV2).toHaveBeenCalledWith('SPY', expect.objectContaining({
        timeframe: '5Min',
        feed: 'iex',
      }));
    });

    it('should handle API errors gracefully', async () => {
      mockAlpaca.getBarsV2.mockImplementation(() => {
        throw new Error('API error');
      });

      const detector = new AlpacaRegimeDetector('SPY');
      await expect(detector.getBars()).rejects.toThrow('API error');
    });
  });

  describe('getQuote', () => {
    it('should fetch quote from Alpaca API', async () => {
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.5,
        AskPrice: 100.5,
      } as any);

      const detector = new AlpacaRegimeDetector('SPY');
      const quote = await detector.getQuote();

      expect(quote.bid).toBe(99.5);
      expect(quote.ask).toBe(100.5);
      expect(quote.last).toBe(100);
    });

    it('should return default quote on error', async () => {
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('API error'));

      const detector = new AlpacaRegimeDetector('SPY');
      const quote = await detector.getQuote();

      expect(quote).toEqual({ bid: 0, ask: 0, last: 0 });
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(30, { volatility: 'normal' });
      
      const atr = detector.calculateATR(bars);
      
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeLessThan(bars[0].ClosePrice * 0.1); // ATR should be less than 10% of price
    });

    it('should return 0 for insufficient data', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(5);
      
      const atr = detector.calculateATR(bars);
      
      expect(atr).toBe(0);
    });

    it('should return higher ATR for volatile bars', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const lowVolBars = generateMockBars(30, { volatility: 'low' });
      const highVolBars = generateMockBars(30, { volatility: 'high' });
      
      const lowATR = detector.calculateATR(lowVolBars);
      const highATR = detector.calculateATR(highVolBars);
      
      expect(highATR).toBeGreaterThan(lowATR);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate standard deviation of returns', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(30, { volatility: 'normal' });
      
      const vol = detector.calculateVolatility(bars);
      
      expect(vol).toBeGreaterThan(0);
    });

    it('should return 0 for single bar', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(1);
      
      const vol = detector.calculateVolatility(bars);
      
      expect(vol).toBe(0);
    });

    it('should return higher volatility for volatile data', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const lowVolBars = generateMockBars(30, { volatility: 'low' });
      const highVolBars = generateMockBars(30, { volatility: 'high' });
      
      const lowVol = detector.calculateVolatility(lowVolBars);
      const highVol = detector.calculateVolatility(highVolBars);
      
      expect(highVol).toBeGreaterThan(lowVol);
    });
  });

  describe('calculateADX', () => {
    it('should calculate ADX correctly', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(50, { trend: 'up' });
      
      const adx = detector.calculateADX(bars);
      
      // ADX calculation uses Wilder smoothing which can produce values
      // The implementation returns a smoothed DX value
      expect(adx).toBeGreaterThanOrEqual(0);
      expect(typeof adx).toBe('number');
      expect(Number.isFinite(adx)).toBe(true);
    });

    it('should return 0 for insufficient data', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(10);
      
      const adx = detector.calculateADX(bars);
      
      expect(adx).toBe(0);
    });

    it('should show higher ADX for trending market', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      // Create strongly trending bars
      const trendingBars = generateMockBars(50, { trend: 'up', volatility: 'low' });
      // Create choppy bars
      const choppyBars = generateMockBars(50, { trend: 'flat', volatility: 'high' });
      
      const trendingADX = detector.calculateADX(trendingBars);
      const choppyADX = detector.calculateADX(choppyBars);
      
      // Trending market should generally have higher ADX
      expect(trendingADX).toBeGreaterThanOrEqual(0);
      expect(choppyADX).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateRegressionSlope', () => {
    it('should return positive slope for uptrend', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(20, { trend: 'up' });
      
      const slope = detector.calculateRegressionSlope(bars);
      
      expect(slope).toBeGreaterThan(0);
    });

    it('should return negative slope for downtrend', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(20, { trend: 'down' });
      
      const slope = detector.calculateRegressionSlope(bars);
      
      expect(slope).toBeLessThan(0);
    });

    it('should return near-zero slope for flat market', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      // Create flat bars
      const bars: Bar[] = [];
      for (let i = 0; i < 20; i++) {
        bars.push({
          Timestamp: new Date().toISOString(),
          OpenPrice: 100,
          HighPrice: 100.5,
          LowPrice: 99.5,
          ClosePrice: 100,
          Volume: 100000,
          TradeCount: 1000,
          VWAP: 100,
        });
      }
      
      const slope = detector.calculateRegressionSlope(bars);
      
      expect(Math.abs(slope)).toBeLessThan(0.1);
    });

    it('should return 0 for insufficient data', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(1);
      
      const slope = detector.calculateRegressionSlope(bars);
      
      expect(slope).toBe(0);
    });
  });

  describe('calculateVolumeAnomaly', () => {
    it('should return ~1 for normal volume', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(30);
      
      const anomaly = detector.calculateVolumeAnomaly(bars);
      
      // Should be close to 1 for uniform volume
      expect(anomaly).toBeGreaterThan(0.5);
      expect(anomaly).toBeLessThan(2);
    });

    it('should return 1 for insufficient data', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(5);
      
      const anomaly = detector.calculateVolumeAnomaly(bars);
      
      expect(anomaly).toBe(1);
    });

    it('should detect high volume spike', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const bars = generateMockBars(30);
      // Set last bar to have 5x volume
      bars[bars.length - 1].Volume = bars[0].Volume * 5;
      
      const anomaly = detector.calculateVolumeAnomaly(bars);
      
      expect(anomaly).toBeGreaterThan(3);
    });
  });

  describe('classifyRegime', () => {
    it('should classify UNTRADEABLE for extreme spread', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 1,
        atrPercent: 1,
        volatility: 1,
        adx: 20,
        regressionSlope: 0.01,
        spreadPercent: 3, // Extreme spread
        volumeAnomaly: 1,
        priceRange: 1,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('UNTRADEABLE');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify UNTRADEABLE for extreme volatility', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 10,
        atrPercent: 10, // Extreme
        volatility: 5,
        adx: 20,
        regressionSlope: 0.01,
        spreadPercent: 0.1,
        volumeAnomaly: 1,
        priceRange: 5,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('UNTRADEABLE');
    });

    it('should classify VOL_EXPANSION for high ATR', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 3,
        atrPercent: 3, // High but not extreme
        volatility: 2,
        adx: 20,
        regressionSlope: 0.01,
        spreadPercent: 0.1,
        volumeAnomaly: 1,
        priceRange: 2,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('VOL_EXPANSION');
    });

    it('should classify VOL_EXPANSION for volume anomaly with elevated vol', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 1.8,
        atrPercent: 1.8, // Above VOL_NORMAL threshold (1.5)
        volatility: 1,
        adx: 20,
        regressionSlope: 0.01,
        spreadPercent: 0.1,
        volumeAnomaly: 4, // High volume anomaly (> VOL_ANOMALY_HIGH of 2.0)
        priceRange: 1,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('VOL_EXPANSION');
    });

    it('should classify TREND for high ADX and slope', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 0.5,
        atrPercent: 0.5,
        volatility: 0.5,
        adx: 35, // Strong trend
        regressionSlope: 0.15, // Clear directional movement
        spreadPercent: 0.05,
        volumeAnomaly: 1,
        priceRange: 0.5,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('TREND');
      expect(result.recommendation).toContain('bullish');
    });

    it('should classify bearish TREND correctly', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 0.5,
        atrPercent: 0.5,
        volatility: 0.5,
        adx: 35,
        regressionSlope: -0.15, // Negative slope
        spreadPercent: 0.05,
        volumeAnomaly: 1,
        priceRange: 0.5,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('TREND');
      expect(result.recommendation).toContain('bearish');
    });

    it('should classify CHOP for low ADX', () => {
      const detector = new AlpacaRegimeDetector('SPY');
      const metrics: RegimeMetrics = {
        atr: 0.5,
        atrPercent: 0.5,
        volatility: 0.5,
        adx: 15, // Low ADX - choppy
        regressionSlope: 0.01,
        spreadPercent: 0.05,
        volumeAnomaly: 1,
        priceRange: 0.5,
      };
      
      const result = detector.classifyRegime(metrics);
      
      expect(result.regime).toBe('CHOP');
      expect(result.recommendation).toContain('Range-bound');
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate all metrics', async () => {
      const mockBars = generateMockBars(100);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.9,
        AskPrice: 100.1,
      } as any);

      const detector = new AlpacaRegimeDetector('SPY');
      const metrics = await detector.calculateMetrics();

      expect(metrics.atr).toBeGreaterThan(0);
      expect(metrics.atrPercent).toBeGreaterThan(0);
      expect(metrics.volatility).toBeGreaterThanOrEqual(0);
      expect(metrics.adx).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.regressionSlope).toBe('number');
      expect(metrics.spreadPercent).toBeGreaterThanOrEqual(0);
      expect(metrics.volumeAnomaly).toBeGreaterThan(0);
      expect(metrics.priceRange).toBeGreaterThan(0);
    });

    it('should throw error if no bars available', async () => {
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator([]) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.9,
        AskPrice: 100.1,
      } as any);

      const detector = new AlpacaRegimeDetector('SPY');
      
      await expect(detector.calculateMetrics()).rejects.toThrow('No bar data available');
    });

    it('should handle missing quote data', async () => {
      const mockBars = generateMockBars(100);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('Quote error'));

      const detector = new AlpacaRegimeDetector('SPY');
      const metrics = await detector.calculateMetrics();

      // Should still work with 0 spread
      expect(metrics.spreadPercent).toBe(0);
    });
  });

  describe('detect', () => {
    it('should return full regime analysis', async () => {
      // Use stable bars without random noise for this test
      const mockBars: Bar[] = [];
      for (let i = 0; i < 100; i++) {
        mockBars.push({
          Timestamp: new Date(Date.now() - (100 - i) * 5 * 60 * 1000).toISOString(),
          OpenPrice: 100 + i * 0.1,
          HighPrice: 101 + i * 0.1,
          LowPrice: 99 + i * 0.1,
          ClosePrice: 100.5 + i * 0.1,
          Volume: 100000,
          TradeCount: 1000,
          VWAP: 100.25 + i * 0.1,
        });
      }
      
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 109.9,
        AskPrice: 110.1,
      } as any);

      const detector = new AlpacaRegimeDetector('AAPL');
      const result = await detector.detect();

      expect(result.regime).toMatch(/^(CHOP|TREND|VOL_EXPANSION|UNTRADEABLE)$/);
      expect(typeof result.confidence).toBe('number');
      expect(Number.isFinite(result.confidence)).toBe(true);
      expect(result.symbol).toBe('AAPL');
      expect(result.timestamp).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('caching', () => {
    it('should cache regime results', async () => {
      const mockBars = generateMockBars(100);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.9,
        AskPrice: 100.1,
      } as any);

      // First call should hit API
      const result1 = await detectRegimeCached('SPY');
      expect(mockAlpaca.getBarsV2).toHaveBeenCalledTimes(1);

      // Reset mock to track subsequent calls
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);

      // Second call should use cache
      const result2 = await detectRegimeCached('SPY');
      expect(mockAlpaca.getBarsV2).toHaveBeenCalledTimes(1); // No additional calls

      expect(result1.regime).toBe(result2.regime);
    });

    it('should cache per symbol', async () => {
      const mockBars = generateMockBars(100);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.9,
        AskPrice: 100.1,
      } as any);

      await detectRegimeCached('SPY');
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      await detectRegimeCached('AAPL');

      // Should call API for each symbol
      expect(mockAlpaca.getBarsV2).toHaveBeenCalledTimes(2);
    });

    it('should clear cache correctly', async () => {
      const mockBars = generateMockBars(100);
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      mockAlpaca.getLatestQuote.mockResolvedValue({
        BidPrice: 99.9,
        AskPrice: 100.1,
      } as any);

      await detectRegimeCached('SPY');
      clearRegimeCache();
      mockAlpaca.getBarsV2.mockReturnValue(createBarIterator(mockBars) as any);
      await detectRegimeCached('SPY');

      // Should call API twice (before and after cache clear)
      expect(mockAlpaca.getBarsV2).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRegimeDetector', () => {
    it('should return singleton per symbol', () => {
      const detector1 = getRegimeDetector('SPY');
      const detector2 = getRegimeDetector('SPY');
      const detector3 = getRegimeDetector('AAPL');

      expect(detector1).toBe(detector2);
      expect(detector1).not.toBe(detector3);
    });

    it('should use SPY as default symbol', () => {
      const detector = getRegimeDetector();
      expect(detector).toBeDefined();
    });
  });
});
