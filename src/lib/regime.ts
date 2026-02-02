/**
 * Market Regime Detection System
 * 
 * Classifies market conditions into 4 regimes:
 * - CHOP: Range-bound, mean-reverting (fade breakouts)
 * - TREND: Strong directional move (ride momentum)  
 * - VOL_EXPANSION: Volatility spike (reduce size, widen stops)
 * - UNTRADEABLE: Extreme conditions (stay flat)
 */

import alpaca from './alpaca';

export type RegimeType = 'CHOP' | 'TREND' | 'VOL_EXPANSION' | 'UNTRADEABLE';

export interface RegimeResult {
  regime: RegimeType;
  confidence: number; // 0-1
  timestamp: string;
  symbol: string;
  metrics: RegimeMetrics;
  recommendation: string;
}

export interface RegimeMetrics {
  atr: number;
  atrPercent: number;
  volatility: number;           // Standard deviation
  adx: number;                  // Average Directional Index
  regressionSlope: number;      // Linear regression slope (normalized)
  spreadPercent: number;        // Bid-ask spread as % of price
  volumeAnomaly: number;        // Current vol / rolling avg vol
  priceRange: number;           // High-low range as % of close
}

export interface Bar {
  Timestamp: string;
  OpenPrice: number;
  HighPrice: number;
  LowPrice: number;
  ClosePrice: number;
  Volume: number;
  TradeCount: number;
  VWAP: number;
}

// Regime thresholds - tuned for typical equity behavior
const THRESHOLDS = {
  // ADX thresholds
  ADX_TREND: 25,           // Above = trending
  ADX_STRONG_TREND: 40,    // Above = strong trend
  ADX_CHOP: 20,            // Below = choppy
  
  // ATR volatility thresholds (as % of price)
  VOL_LOW: 0.5,            // Below = low volatility
  VOL_NORMAL: 1.5,         // Normal range
  VOL_HIGH: 2.5,           // Above = high volatility
  VOL_EXTREME: 4.0,        // Above = extreme volatility
  
  // Spread thresholds (as % of price)
  SPREAD_TIGHT: 0.02,      // Below = tight spread
  SPREAD_WIDE: 0.10,       // Above = wide spread
  SPREAD_EXTREME: 0.25,    // Above = untradeable
  
  // Volume anomaly thresholds
  VOL_ANOMALY_LOW: 0.5,    // Below = unusually low volume
  VOL_ANOMALY_HIGH: 2.0,   // Above = unusually high volume
  VOL_ANOMALY_EXTREME: 4.0,// Above = extreme volume spike
};

export class RegimeDetector {
  private symbol: string;
  private lookbackPeriod: number;
  private atrPeriod: number;
  private adxPeriod: number;

  constructor(
    symbol: string = 'SPY',
    lookbackPeriod: number = 20,
    atrPeriod: number = 14,
    adxPeriod: number = 14
  ) {
    this.symbol = symbol;
    this.lookbackPeriod = lookbackPeriod;
    this.atrPeriod = atrPeriod;
    this.adxPeriod = adxPeriod;
  }

  /**
   * Fetch historical bars from Alpaca
   */
  async getBars(timeframe: string = '5Min', limit: number = 100): Promise<Bar[]> {
    try {
      const bars = await alpaca.getBarsV2(
        this.symbol,
        {
          timeframe,
          limit,
          feed: 'iex',
        }
      );
      
      const barArray: Bar[] = [];
      for await (const bar of bars) {
        barArray.push({
          Timestamp: bar.Timestamp,
          OpenPrice: bar.OpenPrice,
          HighPrice: bar.HighPrice,
          LowPrice: bar.LowPrice,
          ClosePrice: bar.ClosePrice,
          Volume: bar.Volume,
          TradeCount: bar.TradeCount,
          VWAP: bar.VWAP,
        });
      }
      return barArray;
    } catch (error) {
      console.error('Error fetching bars:', error);
      throw error;
    }
  }

  /**
   * Get latest quote for spread calculation
   */
  async getQuote(): Promise<{ bid: number; ask: number; last: number }> {
    try {
      const quote = await alpaca.getLatestQuote(this.symbol);
      return {
        bid: quote.BidPrice ?? 0,
        ask: quote.AskPrice ?? 0,
        last: (quote.BidPrice + quote.AskPrice) / 2 || quote.AskPrice || 0,
      };
    } catch (error) {
      console.error('Error fetching quote:', error);
      return { bid: 0, ask: 0, last: 0 };
    }
  }

  /**
   * Calculate Average True Range (ATR)
   */
  calculateATR(bars: Bar[]): number {
    if (bars.length < this.atrPeriod + 1) return 0;

    const trueRanges: number[] = [];
    
    for (let i = 1; i < bars.length; i++) {
      const high = bars[i].HighPrice;
      const low = bars[i].LowPrice;
      const prevClose = bars[i - 1].ClosePrice;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Calculate ATR as EMA of true ranges
    let atr = trueRanges.slice(0, this.atrPeriod).reduce((a, b) => a + b, 0) / this.atrPeriod;
    const multiplier = 2 / (this.atrPeriod + 1);
    
    for (let i = this.atrPeriod; i < trueRanges.length; i++) {
      atr = (trueRanges[i] - atr) * multiplier + atr;
    }

    return atr;
  }

  /**
   * Calculate standard deviation of returns
   */
  calculateVolatility(bars: Bar[]): number {
    if (bars.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const ret = (bars[i].ClosePrice - bars[i - 1].ClosePrice) / bars[i - 1].ClosePrice;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Convert to percentage
  }

  /**
   * Calculate ADX (Average Directional Index)
   */
  calculateADX(bars: Bar[]): number {
    if (bars.length < this.adxPeriod * 2) return 0;

    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];

    for (let i = 1; i < bars.length; i++) {
      const high = bars[i].HighPrice;
      const low = bars[i].LowPrice;
      const prevHigh = bars[i - 1].HighPrice;
      const prevLow = bars[i - 1].LowPrice;
      const prevClose = bars[i - 1].ClosePrice;

      // True Range
      tr.push(Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      ));

      // Directional Movement
      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
      } else {
        plusDM.push(0);
      }

      if (downMove > upMove && downMove > 0) {
        minusDM.push(downMove);
      } else {
        minusDM.push(0);
      }
    }

    // Smooth with Wilder's method
    const smoothTR = this.wilderSmooth(tr, this.adxPeriod);
    const smoothPlusDM = this.wilderSmooth(plusDM, this.adxPeriod);
    const smoothMinusDM = this.wilderSmooth(minusDM, this.adxPeriod);

    // Calculate DI+ and DI-
    const diPlus: number[] = [];
    const diMinus: number[] = [];
    const dx: number[] = [];

    for (let i = 0; i < smoothTR.length; i++) {
      if (smoothTR[i] === 0) {
        diPlus.push(0);
        diMinus.push(0);
        dx.push(0);
        continue;
      }
      
      const diP = (smoothPlusDM[i] / smoothTR[i]) * 100;
      const diM = (smoothMinusDM[i] / smoothTR[i]) * 100;
      diPlus.push(diP);
      diMinus.push(diM);

      const diSum = diP + diM;
      if (diSum === 0) {
        dx.push(0);
      } else {
        dx.push(Math.abs(diP - diM) / diSum * 100);
      }
    }

    // ADX is smoothed DX
    const adxValues = this.wilderSmooth(dx.slice(-this.adxPeriod * 2), this.adxPeriod);
    return adxValues[adxValues.length - 1] || 0;
  }

  /**
   * Wilder's smoothing method
   */
  private wilderSmooth(data: number[], period: number): number[] {
    if (data.length < period) return [];
    
    const result: number[] = [];
    let sum = data.slice(0, period).reduce((a, b) => a + b, 0);
    result.push(sum);

    for (let i = period; i < data.length; i++) {
      sum = sum - (sum / period) + data[i];
      result.push(sum);
    }

    return result;
  }

  /**
   * Calculate linear regression slope (normalized)
   */
  calculateRegressionSlope(bars: Bar[]): number {
    if (bars.length < 2) return 0;

    const n = bars.length;
    const prices = bars.map(b => b.ClosePrice);
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Normalize by average price to get percentage slope per bar
    const avgPrice = sumY / n;
    return (slope / avgPrice) * 100;
  }

  /**
   * Calculate volume anomaly (current volume vs rolling average)
   */
  calculateVolumeAnomaly(bars: Bar[]): number {
    if (bars.length < this.lookbackPeriod + 1) return 1;

    const currentVolume = bars[bars.length - 1].Volume;
    const avgVolume = bars
      .slice(-this.lookbackPeriod - 1, -1)
      .reduce((sum, b) => sum + b.Volume, 0) / this.lookbackPeriod;

    if (avgVolume === 0) return 1;
    return currentVolume / avgVolume;
  }

  /**
   * Calculate all metrics
   */
  async calculateMetrics(): Promise<RegimeMetrics> {
    const [bars, quote] = await Promise.all([
      this.getBars('5Min', 100),
      this.getQuote(),
    ]);

    if (bars.length === 0) {
      throw new Error('No bar data available');
    }

    const lastPrice = bars[bars.length - 1].ClosePrice;
    const atr = this.calculateATR(bars);
    
    // Calculate spread as percentage
    let spreadPercent = 0;
    if (quote.bid > 0 && quote.ask > 0) {
      const midPrice = (quote.bid + quote.ask) / 2;
      spreadPercent = ((quote.ask - quote.bid) / midPrice) * 100;
    }

    // Price range (high-low as % of close for last bar)
    const lastBar = bars[bars.length - 1];
    const priceRange = ((lastBar.HighPrice - lastBar.LowPrice) / lastBar.ClosePrice) * 100;

    return {
      atr,
      atrPercent: (atr / lastPrice) * 100,
      volatility: this.calculateVolatility(bars),
      adx: this.calculateADX(bars),
      regressionSlope: this.calculateRegressionSlope(bars.slice(-this.lookbackPeriod)),
      spreadPercent,
      volumeAnomaly: this.calculateVolumeAnomaly(bars),
      priceRange,
    };
  }

  /**
   * Classify regime based on metrics
   */
  classifyRegime(metrics: RegimeMetrics): { regime: RegimeType; confidence: number; recommendation: string } {
    // Check for UNTRADEABLE conditions first
    if (
      metrics.spreadPercent > THRESHOLDS.SPREAD_EXTREME ||
      metrics.atrPercent > THRESHOLDS.VOL_EXTREME ||
      metrics.volumeAnomaly > THRESHOLDS.VOL_ANOMALY_EXTREME
    ) {
      return {
        regime: 'UNTRADEABLE',
        confidence: 0.9,
        recommendation: 'Stay flat. Extreme market conditions detected. Wait for normalization.',
      };
    }

    // Check for VOL_EXPANSION
    if (
      metrics.atrPercent > THRESHOLDS.VOL_HIGH ||
      (metrics.volumeAnomaly > THRESHOLDS.VOL_ANOMALY_HIGH && metrics.atrPercent > THRESHOLDS.VOL_NORMAL)
    ) {
      const confidence = Math.min(
        0.9,
        0.5 + (metrics.atrPercent - THRESHOLDS.VOL_NORMAL) / (THRESHOLDS.VOL_EXTREME - THRESHOLDS.VOL_NORMAL) * 0.4
      );
      return {
        regime: 'VOL_EXPANSION',
        confidence,
        recommendation: 'Reduce position size by 50%. Widen stops. Volatility spike detected.',
      };
    }

    // Check for TREND
    if (metrics.adx > THRESHOLDS.ADX_TREND && Math.abs(metrics.regressionSlope) > 0.05) {
      const confidence = Math.min(
        0.95,
        0.5 + (metrics.adx - THRESHOLDS.ADX_TREND) / (THRESHOLDS.ADX_STRONG_TREND - THRESHOLDS.ADX_TREND) * 0.3 +
        Math.min(0.15, Math.abs(metrics.regressionSlope) * 2)
      );
      const direction = metrics.regressionSlope > 0 ? 'bullish' : 'bearish';
      return {
        regime: 'TREND',
        confidence,
        recommendation: `Strong ${direction} trend detected. Ride momentum with trailing stops.`,
      };
    }

    // Default to CHOP
    const choppiness = 1 - (metrics.adx / THRESHOLDS.ADX_TREND);
    const confidence = Math.min(0.85, 0.5 + choppiness * 0.35);
    return {
      regime: 'CHOP',
      confidence,
      recommendation: 'Range-bound market. Fade breakouts, mean-revert at extremes.',
    };
  }

  /**
   * Main detection method - returns full regime analysis
   */
  async detect(): Promise<RegimeResult> {
    const metrics = await this.calculateMetrics();
    const { regime, confidence, recommendation } = this.classifyRegime(metrics);

    return {
      regime,
      confidence,
      timestamp: new Date().toISOString(),
      symbol: this.symbol,
      metrics,
      recommendation,
    };
  }
}

// Singleton for common symbols
const detectorCache: Map<string, RegimeDetector> = new Map();

export function getRegimeDetector(symbol: string = 'SPY'): RegimeDetector {
  if (!detectorCache.has(symbol)) {
    detectorCache.set(symbol, new RegimeDetector(symbol));
  }
  return detectorCache.get(symbol)!;
}

export default RegimeDetector;
