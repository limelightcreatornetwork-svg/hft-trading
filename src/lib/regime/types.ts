/**
 * Market Regime Types and Definitions
 * 
 * Used to classify current market conditions for trading decisions.
 */

/**
 * Market regime classifications
 */
export enum MarketRegime {
  /** Low directional movement, mean-reversion friendly */
  CHOP = 'CHOP',
  /** Strong directional bias, momentum-friendly */
  TREND = 'TREND',
  /** Volatility expanding, wider stops needed */
  VOL_EXPANSION = 'VOL_EXPANSION',
  /** News events, halts, stale data - do not trade */
  UNTRADEABLE = 'UNTRADEABLE',
}

/**
 * Time of day classifications for market microstructure
 */
export enum MarketSession {
  PRE_MARKET = 'PRE_MARKET',
  OPEN_AUCTION = 'OPEN_AUCTION',
  MORNING_SESSION = 'MORNING_SESSION',
  MIDDAY = 'MIDDAY',
  AFTERNOON_SESSION = 'AFTERNOON_SESSION',
  CLOSE_AUCTION = 'CLOSE_AUCTION',
  AFTER_HOURS = 'AFTER_HOURS',
  CLOSED = 'CLOSED',
}

/**
 * Raw market data input for regime detection
 */
export interface MarketDataInput {
  symbol: string;
  timestamp: Date;
  
  // Price data
  prices: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
  
  // Quote data
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  
  // Spread info
  currentSpread: number;
  averageSpread: number;
  
  // Flags
  isHalted: boolean;
  hasGap: boolean;
  gapSize?: number;
  lastUpdateMs: number; // ms since last quote update
}

/**
 * Computed indicators for regime detection
 */
export interface RegimeIndicators {
  // Volatility
  realizedVolShort: number;  // 5-bar realized vol
  realizedVolLong: number;   // 20-bar realized vol
  volRatio: number;          // short/long vol ratio
  atr: number;               // Average True Range
  
  // Directional strength
  adx: number;               // Average Directional Index (0-100)
  plusDI: number;            // +DI component
  minusDI: number;           // -DI component
  
  // Spread analysis
  spreadRatio: number;       // current/average spread
  spreadZScore: number;      // standardized spread deviation
  
  // Volume analysis
  volumeRatio: number;       // current/average volume
  volumeZScore: number;      // standardized volume deviation
  
  // Session info
  session: MarketSession;
  minutesSinceOpen: number;
  minutesToClose: number;
}

/**
 * Regime detection result
 */
export interface RegimeResult {
  symbol: string;
  timestamp: Date;
  
  // Classification
  regime: MarketRegime;
  confidence: number;        // 0-1 confidence score
  
  // Sub-scores
  scores: {
    chop: number;
    trend: number;
    volExpansion: number;
    untradeable: number;
  };
  
  // Indicators used
  indicators: RegimeIndicators;
  
  // Trading guidance
  guidance: {
    canTrade: boolean;
    suggestedStopMultiplier: number;  // ATR multiplier for stops
    suggestedPositionSize: number;    // 0-1 relative size
    warnings: string[];
  };
}

/**
 * Regime detector configuration
 */
export interface RegimeConfig {
  // Volatility thresholds
  volExpansionThreshold: number;     // vol ratio above this = VOL_EXPANSION
  volContractionThreshold: number;   // vol ratio below this = low vol environment
  
  // ADX thresholds
  adxTrendThreshold: number;         // ADX above this = TREND
  adxChopThreshold: number;          // ADX below this = CHOP
  
  // Spread thresholds
  spreadWarningMultiple: number;     // spread > avg * this = warning
  spreadUntradeableMultiple: number; // spread > avg * this = UNTRADEABLE
  
  // Data freshness
  staleDataThresholdMs: number;      // ms since last update before stale
  
  // Session configs
  avoidOpenMinutes: number;          // avoid first N minutes
  avoidCloseMinutes: number;         // avoid last N minutes
  
  // Volume thresholds
  volumeAnomalyZScore: number;       // volume z-score above this = anomaly
}

/**
 * Default regime configuration
 */
export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  volExpansionThreshold: 1.5,
  volContractionThreshold: 0.7,
  adxTrendThreshold: 25,
  adxChopThreshold: 20,
  spreadWarningMultiple: 2.0,
  spreadUntradeableMultiple: 4.0,
  staleDataThresholdMs: 5000,
  avoidOpenMinutes: 5,
  avoidCloseMinutes: 5,
  volumeAnomalyZScore: 3.0,
};
