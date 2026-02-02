/**
 * Regime Detection Indicators
 * 
 * Helper functions for calculating volatility, ADX, and other indicators
 * used in regime classification.
 */

import { MarketDataInput, MarketSession, RegimeIndicators } from './types';

/**
 * Calculate returns from price series
 */
export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

/**
 * Calculate realized volatility (standard deviation of returns)
 */
export function calculateRealizedVol(prices: number[], period: number): number {
  if (prices.length < period + 1) {
    return 0;
  }
  
  const recentPrices = prices.slice(-period - 1);
  const returns = calculateReturns(recentPrices);
  
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate True Range for a single bar
 */
export function calculateTrueRange(high: number, low: number, prevClose: number): number {
  const hl = high - low;
  const hpc = Math.abs(high - prevClose);
  const lpc = Math.abs(low - prevClose);
  
  return Math.max(hl, hpc, lpc);
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1) {
    return 0;
  }
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const tr = calculateTrueRange(highs[i], lows[i], closes[i - 1]);
    trueRanges.push(tr);
  }
  
  // Use simple moving average for initial ATR
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
}

/**
 * Calculate Directional Movement components (+DM, -DM)
 */
export function calculateDirectionalMovement(
  highs: number[],
  lows: number[]
): { plusDM: number[]; minusDM: number[] } {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  return { plusDM, minusDM };
}

/**
 * Smoothed Moving Average (Wilder's smoothing)
 */
export function smoothedAverage(values: number[], period: number): number {
  if (values.length < period) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  
  // First value is simple average
  let smoothed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Apply Wilder's smoothing
  for (let i = period; i < values.length; i++) {
    smoothed = (smoothed * (period - 1) + values[i]) / period;
  }
  
  return smoothed;
}

/**
 * Calculate Average Directional Index (ADX) and DI components
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { adx: number; plusDI: number; minusDI: number } {
  if (highs.length < period + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }
  
  const { plusDM, minusDM } = calculateDirectionalMovement(highs, lows);
  
  // Calculate True Ranges
  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trueRanges.push(calculateTrueRange(highs[i], lows[i], closes[i - 1]));
  }
  
  // Smooth the values
  const smoothedTR = smoothedAverage(trueRanges, period);
  const smoothedPlusDM = smoothedAverage(plusDM, period);
  const smoothedMinusDM = smoothedAverage(minusDM, period);
  
  // Calculate +DI and -DI
  const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
  
  // Calculate DX
  const diSum = plusDI + minusDI;
  const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
  
  // For proper ADX, we'd need to smooth DX over the period
  // Simplified: use current DX as approximation
  const adx = dx;
  
  return { adx, plusDI, minusDI };
}

/**
 * Calculate Z-score for a value given historical values
 */
export function calculateZScore(value: number, historicalValues: number[]): number {
  if (historicalValues.length === 0) return 0;
  
  const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
  const variance = historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  return (value - mean) / stdDev;
}

/**
 * Calculate simple moving average
 */
export function calculateSMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Determine current market session based on time
 * Assumes Eastern Time for US equities
 */
export function getMarketSession(timestamp: Date): MarketSession {
  // Convert to Eastern time (simplified - production should use proper timezone lib)
  const hours = timestamp.getUTCHours() - 5; // EST offset (not accounting for DST)
  const minutes = timestamp.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const preMarketStart = 4 * 60;      // 4:00 AM
  const marketOpen = 9 * 60 + 30;      // 9:30 AM
  const openAuctionEnd = 9 * 60 + 35;  // 9:35 AM
  const morningEnd = 11 * 60 + 30;     // 11:30 AM
  const afternoonStart = 14 * 60;      // 2:00 PM
  const closeAuctionStart = 15 * 60 + 50; // 3:50 PM
  const marketClose = 16 * 60;         // 4:00 PM
  const afterHoursEnd = 20 * 60;       // 8:00 PM
  
  if (totalMinutes < preMarketStart || totalMinutes >= afterHoursEnd) {
    return MarketSession.CLOSED;
  } else if (totalMinutes < marketOpen) {
    return MarketSession.PRE_MARKET;
  } else if (totalMinutes < openAuctionEnd) {
    return MarketSession.OPEN_AUCTION;
  } else if (totalMinutes < morningEnd) {
    return MarketSession.MORNING_SESSION;
  } else if (totalMinutes < afternoonStart) {
    return MarketSession.MIDDAY;
  } else if (totalMinutes < closeAuctionStart) {
    return MarketSession.AFTERNOON_SESSION;
  } else if (totalMinutes < marketClose) {
    return MarketSession.CLOSE_AUCTION;
  } else {
    return MarketSession.AFTER_HOURS;
  }
}

/**
 * Calculate minutes since market open
 */
export function getMinutesSinceOpen(timestamp: Date): number {
  const hours = timestamp.getUTCHours() - 5;
  const minutes = timestamp.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 30;
  
  return Math.max(0, totalMinutes - marketOpenMinutes);
}

/**
 * Calculate minutes until market close
 */
export function getMinutesToClose(timestamp: Date): number {
  const hours = timestamp.getUTCHours() - 5;
  const minutes = timestamp.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketCloseMinutes = 16 * 60;
  
  return Math.max(0, marketCloseMinutes - totalMinutes);
}

/**
 * Compute all regime indicators from market data
 */
export function computeIndicators(data: MarketDataInput): RegimeIndicators {
  // Volatility indicators
  const realizedVolShort = calculateRealizedVol(data.closes, 5);
  const realizedVolLong = calculateRealizedVol(data.closes, 20);
  const volRatio = realizedVolLong > 0 ? realizedVolShort / realizedVolLong : 1;
  const atr = calculateATR(data.highs, data.lows, data.closes, 14);
  
  // Directional indicators
  const { adx, plusDI, minusDI } = calculateADX(data.highs, data.lows, data.closes, 14);
  
  // Spread analysis
  const spreadRatio = data.averageSpread > 0 ? data.currentSpread / data.averageSpread : 1;
  const spreadZScore = 0; // Would need historical spread data for proper z-score
  
  // Volume analysis
  const currentVolume = data.volumes.length > 0 ? data.volumes[data.volumes.length - 1] : 0;
  const avgVolume = calculateSMA(data.volumes, 20);
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const volumeZScore = calculateZScore(currentVolume, data.volumes.slice(-20));
  
  // Session info
  const session = getMarketSession(data.timestamp);
  const minutesSinceOpen = getMinutesSinceOpen(data.timestamp);
  const minutesToClose = getMinutesToClose(data.timestamp);
  
  return {
    realizedVolShort,
    realizedVolLong,
    volRatio,
    atr,
    adx,
    plusDI,
    minusDI,
    spreadRatio,
    spreadZScore,
    volumeRatio,
    volumeZScore,
    session,
    minutesSinceOpen,
    minutesToClose,
  };
}
