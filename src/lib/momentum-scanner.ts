// Momentum Scanner Types and Utilities

export interface ScannerHit {
  id: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  relativeVolume: number;
  avgVolume: number;
  breakoutType: 'bullish' | 'bearish';
  signalStrength: number; // 0-100
  timestamp: Date;
  
  // Technical indicators
  rsi: number;
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdCrossover: 'bullish' | 'bearish' | 'none';
  sma20: number;
  sma50: number;
  sma200: number;
  maCrossover: 'golden' | 'death' | 'none';
  
  // Breakout data
  recentHigh: number;
  recentLow: number;
  breakoutLevel: number;
  distanceFromBreakout: number;
  
  // Regime filter
  regime: 'trending_up' | 'trending_down' | 'ranging';
  atr: number;
  volatility: number;
  
  // Profit tracking
  profitFactor: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  historicalSignals: number;
  
  // Mini chart data (last 30 periods)
  priceHistory: number[];
  volumeHistory: number[];
}

export interface ScannerConfig {
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  rsiOversold: number;
  rsiOverbought: number;
  volumeMultiplier: number;
  breakoutThreshold: number;
  macdSensitivity: number;
  minSignalStrength: number;
  regimeFilter: boolean;
  showBullish: boolean;
  showBearish: boolean;
}

export interface Alert {
  id: string;
  symbol: string;
  type: 'breakout' | 'rsi' | 'macd' | 'volume' | 'regime';
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  dismissed: boolean;
}

// Calculate RSI
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate MACD
export function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  
  // Simplified signal line (would use EMA of MACD in production)
  const signal = macdLine * 0.8;
  const histogram = macdLine - signal;
  
  return { macd: macdLine, signal, histogram };
}

// Calculate EMA
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate SMA
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Calculate ATR
export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  return calculateSMA(trueRanges, period);
}

/**
 * Calculate volatility-adjusted threshold for regime detection.
 * Higher volatility requires stronger MA separation to confirm a trend.
 * 
 * @param volatility - Annualized volatility as decimal (e.g., 0.25 for 25%)
 * @returns Threshold for MA separation (as decimal)
 */
export function getVolatilityAdjustedThreshold(volatility: number): number {
  // Base threshold: 2% (0.02)
  // Low volatility (< 15%): use 1.5% - trends are clearer in calm markets
  // Normal volatility (15-30%): use 2% - standard threshold
  // High volatility (> 30%): use 3% - need stronger confirmation in choppy markets
  // Very high volatility (> 50%): use 4% - only very strong trends should qualify
  
  if (volatility < 0.15) {
    return 0.015;
  } else if (volatility < 0.30) {
    return 0.02;
  } else if (volatility < 0.50) {
    return 0.03;
  } else {
    return 0.04;
  }
}

/**
 * Estimate annualized volatility from price series.
 * Uses standard deviation of daily returns, annualized by sqrt(252).
 * 
 * @param prices - Array of prices (oldest first)
 * @param period - Number of periods to use for calculation
 * @returns Annualized volatility as decimal
 */
export function estimatePriceVolatility(prices: number[], period: number = 20): number {
  if (prices.length < period + 1) return 0.20; // default 20% if insufficient data
  
  // Calculate returns for the last 'period' prices
  const returns: number[] = [];
  const startIdx = prices.length - period - 1;
  for (let i = startIdx + 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  
  if (returns.length < 2) return 0.20;
  
  // Calculate standard deviation
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyStdDev = Math.sqrt(variance);
  
  // Annualize (252 trading days)
  return dailyStdDev * Math.sqrt(252);
}

/**
 * Detect market regime using volatility-adjusted thresholds.
 * 
 * In high volatility environments, we require stronger MA separation
 * to confirm a trend, reducing false signals in choppy markets.
 * 
 * @param prices - Array of prices (oldest first, at least 50 required)
 * @param useVolatilityAdjustment - Whether to adjust threshold based on volatility
 * @returns Market regime: 'trending_up', 'trending_down', or 'ranging'
 */
export function detectRegime(
  prices: number[],
  useVolatilityAdjustment: boolean = true
): 'trending_up' | 'trending_down' | 'ranging' {
  if (prices.length < 50) return 'ranging';
  
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const currentPrice = prices[prices.length - 1];
  
  // Calculate volatility and adjust threshold
  let threshold = 0.02; // default 2%
  if (useVolatilityAdjustment) {
    const volatility = estimatePriceVolatility(prices);
    threshold = getVolatilityAdjustedThreshold(volatility);
  }
  
  // Strong trend if price is significantly above/below both MAs
  const priceAboveMAs = currentPrice > sma20 && currentPrice > sma50;
  const priceBelowMAs = currentPrice < sma20 && currentPrice < sma50;
  const masTrending = Math.abs(sma20 - sma50) / currentPrice > threshold;
  
  if (priceAboveMAs && masTrending && sma20 > sma50) return 'trending_up';
  if (priceBelowMAs && masTrending && sma20 < sma50) return 'trending_down';
  return 'ranging';
}

// Generate demo scanner hits
export function generateDemoScannerHits(count: number = 20): ScannerHit[] {
  const symbols = [
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'AMD', 
    'NFLX', 'COIN', 'MARA', 'RIOT', 'SQ', 'PYPL', 'SHOP', 'SNOW',
    'PLTR', 'SOFI', 'HOOD', 'RBLX', 'DKNG', 'CRWD', 'ZS', 'NET',
    'MU', 'INTC', 'QCOM', 'AVGO', 'ARM', 'SMCI'
  ];
  
  const hits: ScannerHit[] = [];
  
  for (let i = 0; i < count; i++) {
    const symbol = symbols[i % symbols.length];
    const basePrice = 50 + Math.random() * 450;
    const isBullish = Math.random() > 0.4;
    const change = (Math.random() * 10 - (isBullish ? 0 : 5)) * (isBullish ? 1 : -1);
    const relativeVolume = 1 + Math.random() * 4;
    
    // Generate price history for mini chart
    const priceHistory: number[] = [];
    const volumeHistory: number[] = [];
    let price = basePrice * (1 - Math.random() * 0.1);
    
    for (let j = 0; j < 30; j++) {
      const trend = isBullish ? 0.002 : -0.002;
      price = price * (1 + trend + (Math.random() - 0.5) * 0.02);
      priceHistory.push(price);
      volumeHistory.push(Math.random() * 100);
    }
    
    // Set the last few prices to show breakout
    if (isBullish) {
      priceHistory[priceHistory.length - 1] = basePrice;
      priceHistory[priceHistory.length - 2] = basePrice * 0.99;
      priceHistory[priceHistory.length - 3] = basePrice * 0.98;
      volumeHistory[volumeHistory.length - 1] = 100; // High volume on breakout
    }
    
    const recentHigh = Math.max(...priceHistory.slice(-20));
    const recentLow = Math.min(...priceHistory.slice(-20));
    
    const rsi = 30 + Math.random() * 40 + (isBullish ? 15 : -10);
    const macdData = calculateMACD(priceHistory);
    
    hits.push({
      id: `${symbol}-${Date.now()}-${i}`,
      symbol,
      price: basePrice,
      change,
      changePercent: (change / basePrice) * 100,
      volume: Math.floor(1000000 + Math.random() * 50000000),
      relativeVolume,
      avgVolume: Math.floor(5000000 + Math.random() * 20000000),
      breakoutType: isBullish ? 'bullish' : 'bearish',
      signalStrength: Math.floor(60 + Math.random() * 40),
      timestamp: new Date(Date.now() - Math.random() * 3600000),
      
      rsi,
      rsiDivergence: Math.random() > 0.7 ? (isBullish ? 'bullish' : 'bearish') : 'none',
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      macdCrossover: Math.random() > 0.6 ? (isBullish ? 'bullish' : 'bearish') : 'none',
      sma20: basePrice * (0.98 + Math.random() * 0.04),
      sma50: basePrice * (0.95 + Math.random() * 0.1),
      sma200: basePrice * (0.9 + Math.random() * 0.2),
      maCrossover: Math.random() > 0.8 ? (isBullish ? 'golden' : 'death') : 'none',
      
      recentHigh,
      recentLow,
      breakoutLevel: isBullish ? recentHigh : recentLow,
      distanceFromBreakout: Math.abs(basePrice - (isBullish ? recentHigh : recentLow)) / basePrice * 100,
      
      regime: Math.random() > 0.6 ? (isBullish ? 'trending_up' : 'trending_down') : 'ranging',
      atr: basePrice * (0.01 + Math.random() * 0.03),
      volatility: 10 + Math.random() * 30,
      
      profitFactor: 1 + Math.random() * 2,
      winRate: 40 + Math.random() * 35,
      avgWin: 2 + Math.random() * 5,
      avgLoss: 1 + Math.random() * 2,
      historicalSignals: Math.floor(10 + Math.random() * 100),
      
      priceHistory,
      volumeHistory,
    });
  }
  
  // Sort by signal strength
  return hits.sort((a, b) => b.signalStrength - a.signalStrength);
}

// Generate demo alerts
export function generateDemoAlerts(hits: ScannerHit[]): Alert[] {
  const alerts: Alert[] = [];
  
  hits.slice(0, 5).forEach((hit) => {
    if (hit.signalStrength > 80) {
      alerts.push({
        id: `alert-${hit.id}`,
        symbol: hit.symbol,
        type: 'breakout',
        message: `${hit.symbol} breaking ${hit.breakoutType === 'bullish' ? 'above' : 'below'} $${hit.breakoutLevel.toFixed(2)} with ${hit.relativeVolume.toFixed(1)}x volume`,
        severity: 'high',
        timestamp: hit.timestamp,
        dismissed: false,
      });
    }
    
    if (hit.rsiDivergence !== 'none') {
      alerts.push({
        id: `alert-rsi-${hit.id}`,
        symbol: hit.symbol,
        type: 'rsi',
        message: `${hit.symbol} showing ${hit.rsiDivergence} RSI divergence at ${hit.rsi.toFixed(1)}`,
        severity: 'medium',
        timestamp: hit.timestamp,
        dismissed: false,
      });
    }
    
    if (hit.macdCrossover !== 'none') {
      alerts.push({
        id: `alert-macd-${hit.id}`,
        symbol: hit.symbol,
        type: 'macd',
        message: `${hit.symbol} MACD ${hit.macdCrossover} crossover detected`,
        severity: 'medium',
        timestamp: hit.timestamp,
        dismissed: false,
      });
    }
  });
  
  return alerts.slice(0, 10);
}
