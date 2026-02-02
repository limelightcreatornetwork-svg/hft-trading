/**
 * Trading System Constants
 * 
 * Centralized configuration for all magic numbers and thresholds.
 * These can be overridden via environment variables for different environments.
 */

import { getNumericEnv, getBooleanEnv } from './env';

// =============================================================================
// REGIME DETECTION THRESHOLDS
// =============================================================================

export const REGIME_THRESHOLDS = {
  // ADX (Average Directional Index) thresholds
  ADX_TREND: getNumericEnv('REGIME_ADX_TREND', 25),           // Above = trending
  ADX_STRONG_TREND: getNumericEnv('REGIME_ADX_STRONG', 40),   // Above = strong trend
  ADX_CHOP: getNumericEnv('REGIME_ADX_CHOP', 20),             // Below = choppy
  
  // ATR volatility thresholds (as % of price)
  VOL_LOW: getNumericEnv('REGIME_VOL_LOW', 0.5),              // Below = low volatility
  VOL_NORMAL: getNumericEnv('REGIME_VOL_NORMAL', 1.5),        // Normal range
  VOL_HIGH: getNumericEnv('REGIME_VOL_HIGH', 2.5),            // Above = high volatility
  VOL_EXTREME: getNumericEnv('REGIME_VOL_EXTREME', 4.0),      // Above = extreme volatility
  
  // Spread thresholds (as % of price)
  SPREAD_TIGHT: getNumericEnv('REGIME_SPREAD_TIGHT', 0.02),   // Below = tight spread
  SPREAD_WIDE: getNumericEnv('REGIME_SPREAD_WIDE', 0.10),     // Above = wide spread
  SPREAD_EXTREME: getNumericEnv('REGIME_SPREAD_EXTREME', 0.25), // Above = untradeable
  
  // Volume anomaly thresholds
  VOL_ANOMALY_LOW: getNumericEnv('REGIME_VOL_ANOMALY_LOW', 0.5),      // Below = unusually low
  VOL_ANOMALY_HIGH: getNumericEnv('REGIME_VOL_ANOMALY_HIGH', 2.0),    // Above = unusually high
  VOL_ANOMALY_EXTREME: getNumericEnv('REGIME_VOL_ANOMALY_EXTREME', 4.0), // Above = extreme spike
} as const;

// =============================================================================
// CONFIDENCE SCORING
// =============================================================================

export const CONFIDENCE_CONFIG = {
  // Component weights (must sum to 1.0)
  WEIGHT_TECHNICAL: getNumericEnv('CONF_WEIGHT_TECHNICAL', 0.35),
  WEIGHT_RISK_REWARD: getNumericEnv('CONF_WEIGHT_RR', 0.25),
  WEIGHT_MARKET_CONDITIONS: getNumericEnv('CONF_WEIGHT_MARKET', 0.25),
  WEIGHT_TIME_OF_DAY: getNumericEnv('CONF_WEIGHT_TIME', 0.15),
  
  // Score boundaries
  SCORE_MIN: 1,
  SCORE_MAX: 10,
} as const;

export const POSITION_SIZING = {
  // High confidence (8-10)
  HIGH: {
    min: getNumericEnv('POS_HIGH_MIN', 8),
    max: 10,
    pct: getNumericEnv('POS_HIGH_PCT', 20),
  },
  // Medium confidence (6-7)
  MEDIUM: {
    min: getNumericEnv('POS_MED_MIN', 6),
    max: 7,
    pct: getNumericEnv('POS_MED_PCT', 10),
  },
  // Low confidence (4-5)
  LOW: {
    min: getNumericEnv('POS_LOW_MIN', 4),
    max: 5,
    pct: getNumericEnv('POS_LOW_PCT', 5),
  },
  // Skip (1-3)
  SKIP: {
    min: 1,
    max: 3,
    pct: 0,
  },
} as const;

// =============================================================================
// RISK MANAGEMENT
// =============================================================================

export const RISK_DEFAULTS = {
  MAX_POSITION_SIZE: getNumericEnv('RISK_MAX_POSITION', 1000),
  MAX_ORDER_SIZE: getNumericEnv('RISK_MAX_ORDER', 100),
  MAX_DAILY_LOSS: getNumericEnv('RISK_MAX_DAILY_LOSS', 1000),
  TRADING_ENABLED: getBooleanEnv('RISK_TRADING_ENABLED', false),
  
  // Options-specific
  MAX_OPTIONS_CONTRACTS: getNumericEnv('RISK_MAX_OPTIONS', 10),
  MAX_PREMIUM_AT_RISK: getNumericEnv('RISK_MAX_PREMIUM', 500),
  MAX_DELTA_EXPOSURE: getNumericEnv('RISK_MAX_DELTA', 100),
  MIN_DAYS_TO_EXPIRATION: getNumericEnv('RISK_MIN_DTE', 1),
} as const;

export const DEFAULT_ALLOWED_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
  'SPY', 'QQQ', 'NVDA', 'META', 'AMD',
] as const;

// =============================================================================
// TRADE MANAGEMENT
// =============================================================================

export const TRADE_DEFAULTS = {
  // Time stop (hours)
  TIME_STOP_HOURS: getNumericEnv('TRADE_TIME_STOP', 4),
  
  // TP/SL defaults (percentages)
  DEFAULT_TP_PCT: getNumericEnv('TRADE_DEFAULT_TP', 2.0),
  DEFAULT_SL_PCT: getNumericEnv('TRADE_DEFAULT_SL', 1.0),
  
  // TP/SL boundaries
  MIN_TP_PCT: getNumericEnv('TRADE_MIN_TP', 1.5),
  MAX_TP_PCT: getNumericEnv('TRADE_MAX_TP', 5.0),
  MIN_SL_PCT: getNumericEnv('TRADE_MIN_SL', 0.5),
  MAX_SL_PCT: getNumericEnv('TRADE_MAX_SL', 3.0),
} as const;

// =============================================================================
// MARKET HOURS (Eastern Time)
// =============================================================================

export const MARKET_HOURS = {
  OPEN_HOUR: 9,
  OPEN_MINUTE: 30,
  CLOSE_HOUR: 16,
  CLOSE_MINUTE: 0,
  
  // Volatile periods to avoid (in minutes from market open/close)
  OPEN_AVOID_MINUTES: 15,   // First 15 minutes
  CLOSE_AVOID_MINUTES: 15,  // Last 15 minutes
  
  // Power hour start
  POWER_HOUR_START: 15 * 60, // 3:00 PM in minutes from midnight
} as const;

// =============================================================================
// VIX ESTIMATION
// =============================================================================

export const VIX_LEVELS = {
  // Estimated VIX from ATR% (ATR% * multiplier ≈ VIX)
  ATR_TO_VIX_MULTIPLIER: 12,
  
  // VIX thresholds
  LOW: 15,        // Calm markets
  NORMAL: 20,     // Normal conditions
  ELEVATED: 25,   // Increased caution
  HIGH: 30,       // Reduce exposure
  EXTREME: 35,    // Consider staying out
} as const;

// =============================================================================
// RATE LIMITING
// =============================================================================

export const RATE_LIMIT = {
  WINDOW_MS: getNumericEnv('RATE_LIMIT_WINDOW', 60 * 1000),  // 1 minute
  MAX_REQUESTS: getNumericEnv('RATE_LIMIT_MAX', 60),          // 60 per minute
} as const;

// =============================================================================
// TECHNICAL ANALYSIS
// =============================================================================

export const TA_PERIODS = {
  ATR: getNumericEnv('TA_ATR_PERIOD', 14),
  ADX: getNumericEnv('TA_ADX_PERIOD', 14),
  LOOKBACK: getNumericEnv('TA_LOOKBACK', 20),
  BARS_FETCH: getNumericEnv('TA_BARS_FETCH', 100),
} as const;
