/**
 * Alpaca-Based Regime Detection
 *
 * This module wraps the Alpaca market-data API to provide a high-level,
 * cached regime-detection interface.  It is used by modules that need a
 * simple `detectRegimeCached(symbol)` call without preparing
 * `MarketDataInput` themselves (e.g. confidence scoring, risk engine,
 * the /api/regime route).
 *
 * The pure-computation regime detector lives in ./regimeDetector.ts and
 * operates on pre-built `MarketDataInput`.  This file complements it by
 * handling data fetching, caching, and singleton management.
 */

import alpaca from '../alpaca';
import { REGIME_THRESHOLDS, TA_PERIODS } from '../constants';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('regime');

// ---------------------------------------------------------------------------
// Types – kept for backward compatibility with consumers that import
// `RegimeType`, `RegimeResult` (old shape), `RegimeMetrics`, `Bar` from
// `@/lib/regime`.
// ---------------------------------------------------------------------------

export type RegimeType = 'CHOP' | 'TREND' | 'VOL_EXPANSION' | 'UNTRADEABLE';

export interface AlpacaRegimeResult {
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

// Use centralized thresholds from constants.ts
const THRESHOLDS = REGIME_THRESHOLDS;

// ---------------------------------------------------------------------------
// AlpacaRegimeDetector – fetches data from Alpaca and classifies regime
// ---------------------------------------------------------------------------

export class AlpacaRegimeDetector {
  private symbol: string;
  private lookbackPeriod: number;
  private atrPeriod: number;
  private adxPeriod: number;

  constructor(
    symbol: string = 'SPY',
    lookbackPeriod: number = TA_PERIODS.LOOKBACK,
    atrPeriod: number = TA_PERIODS.ATR,
    adxPeriod: number = TA_PERIODS.ADX
  ) {
    this.symbol = symbol;
    this.lookbackPeriod = lookbackPeriod;
    this.atrPeriod = atrPeriod;
    this.adxPeriod = adxPeriod;
  }

  /**
   * Fetch historical bars from Alpaca
   */
  async getBars(timeframe: string = '5Min', limit: number = TA_PERIODS.BARS_FETCH): Promise<Bar[]> {
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
      log.error('Error fetching bars', serializeError(error));
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
      log.error('Error fetching quote', serializeError(error));
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
  async detect(): Promise<AlpacaRegimeResult> {
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

// ---------------------------------------------------------------------------
// Caching layer – avoids redundant Alpaca API calls when multiple modules
// request regime data in quick succession.
// ---------------------------------------------------------------------------

const REGIME_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL
const regimeResultCache: Map<string, { result: AlpacaRegimeResult; timestamp: number }> = new Map();

/**
 * Get a cached regime result if still valid, otherwise return null
 */
function getCachedResult(symbol: string): AlpacaRegimeResult | null {
  const cached = regimeResultCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < REGIME_CACHE_TTL_MS) {
    return cached.result;
  }
  return null;
}

/**
 * Store a regime result in the cache
 */
function setCachedResult(symbol: string, result: AlpacaRegimeResult): void {
  regimeResultCache.set(symbol, { result, timestamp: Date.now() });
}

/**
 * Detect regime with caching. Avoids redundant Alpaca API calls
 * when multiple confidence scores are calculated in quick succession.
 */
export async function detectRegimeCached(symbol: string): Promise<AlpacaRegimeResult> {
  const cached = getCachedResult(symbol);
  if (cached) return cached;

  const detector = getRegimeDetector(symbol);
  const result = await detector.detect();
  setCachedResult(symbol, result);
  return result;
}

/**
 * Clear the regime result cache (for testing or manual refresh)
 */
export function clearRegimeCache(): void {
  regimeResultCache.clear();
}

// ---------------------------------------------------------------------------
// Singleton management – one AlpacaRegimeDetector per symbol
// ---------------------------------------------------------------------------

const detectorCache: Map<string, AlpacaRegimeDetector> = new Map();

export function getRegimeDetector(symbol: string = 'SPY'): AlpacaRegimeDetector {
  if (!detectorCache.has(symbol)) {
    detectorCache.set(symbol, new AlpacaRegimeDetector(symbol));
  }
  return detectorCache.get(symbol)!;
}
