/**
 * @fileoverview Regime Detection System
 * 
 * Classifies market conditions to gate strategy eligibility:
 * - CHOP: Low directional strength, mean-reverting
 * - TREND: Strong directional momentum
 * - VOL_EXPANSION: Volatility breakout regime
 * - UNTRADEABLE: Halts, stale data, extreme conditions
 * 
 * @module core/regime-detector
 */

import { Regime } from './types.js';
import { logger } from '../libs/logger.js';

/**
 * Default regime detection parameters
 */
const DEFAULT_PARAMS = {
  // Volatility thresholds
  volLookback: 20,            // Bars for realized vol calculation
  volLowThreshold: 0.5,       // Annualized vol below this = low vol
  volHighThreshold: 2.0,      // Annualized vol above this = high vol
  volExpansionRatio: 1.5,     // Vol > ratio * avg = expansion
  
  // Directional strength
  adxLookback: 14,            // ADX calculation period
  adxTrendThreshold: 25,      // ADX above this = trending
  adxChopThreshold: 20,       // ADX below this = choppy
  
  // Spread thresholds
  maxSpreadBps: 50,           // Spread above this = untradeable
  staleQuoteMs: 5000,         // Quote older than this = stale
  
  // Volume thresholds
  volumeAnomalyRatio: 3,      // Volume > ratio * avg = anomaly
  minVolumeRatio: 0.2,        // Volume < ratio * avg = thin
  
  // Halt detection
  maxGapPercent: 5,           // Gap > this = potential halt
  
  // Smoothing
  smoothingPeriod: 3,         // Smooth regime transitions
};

/**
 * Strategy eligibility matrix
 * Defines which strategies can trade in which regimes
 */
const STRATEGY_ELIGIBILITY = {
  'mean_reversion': [Regime.CHOP],
  'momentum_scalp': [Regime.TREND, Regime.VOL_EXPANSION],
  'breakout': [Regime.VOL_EXPANSION],
  'trend_follow': [Regime.TREND],
  'market_making': [Regime.CHOP],
  'all_weather': [Regime.CHOP, Regime.TREND, Regime.VOL_EXPANSION],
};

/**
 * Regime Detector
 * Analyzes market data to classify current regime
 */
export class RegimeDetector {
  constructor(params = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    
    // Per-symbol state
    this.symbolState = new Map();
    
    // Global market state
    this.marketState = {
      regime: Regime.CHOP,
      confidence: 0,
      lastUpdate: null,
      volatilityIndex: 0,
      breadth: 0,
    };
    
    // History for smoothing
    this.regimeHistory = [];
    
    this.logger = params.logger || logger;
  }

  /**
   * Calculate realized volatility from price series
   */
  calculateRealizedVol(prices, lookback = null) {
    lookback = lookback || this.params.volLookback;
    if (prices.length < lookback + 1) return null;
    
    const returns = [];
    for (let i = prices.length - lookback; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);
    
    // Annualize (assuming ~252 trading days)
    return dailyVol * Math.sqrt(252);
  }

  /**
   * Calculate directional strength (simplified ADX-like metric)
   */
  calculateDirectionalStrength(highs, lows, closes, lookback = null) {
    lookback = lookback || this.params.adxLookback;
    if (closes.length < lookback + 1) return null;
    
    const trueRanges = [];
    const plusDMs = [];
    const minusDMs = [];
    
    for (let i = closes.length - lookback; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      const prevHigh = highs[i - 1];
      const prevLow = lows[i - 1];
      
      // True Range
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
      
      // Directional Movement
      const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
      const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
      plusDMs.push(plusDM);
      minusDMs.push(minusDM);
    }
    
    // Smoothed averages
    const smoothTR = this._ema(trueRanges, lookback);
    const smoothPlusDM = this._ema(plusDMs, lookback);
    const smoothMinusDM = this._ema(minusDMs, lookback);
    
    if (smoothTR === 0) return 0;
    
    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;
    
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.0001) * 100;
    
    return dx;
  }

  /**
   * Calculate spread in basis points
   */
  calculateSpreadBps(bid, ask) {
    if (!bid || !ask || bid <= 0) return Infinity;
    const mid = (bid + ask) / 2;
    return ((ask - bid) / mid) * 10000;
  }

  /**
   * Check for price gaps
   */
  detectGap(currentPrice, previousClose) {
    if (!previousClose || previousClose <= 0) return 0;
    return Math.abs(currentPrice - previousClose) / previousClose * 100;
  }

  /**
   * Classify regime for a symbol
   */
  classifySymbol(data) {
    const {
      symbol,
      prices = [],
      highs = [],
      lows = [],
      closes = [],
      volumes = [],
      bid,
      ask,
      lastQuoteTime,
      isHalted = false,
      previousClose,
    } = data;
    
    const now = Date.now();
    const state = this.symbolState.get(symbol) || this._createSymbolState(symbol);
    
    // Check for untradeable conditions first
    const untradeableReasons = [];
    
    // Halted
    if (isHalted) {
      untradeableReasons.push('halted');
    }
    
    // Stale quotes
    if (lastQuoteTime && (now - lastQuoteTime) > this.params.staleQuoteMs) {
      untradeableReasons.push('stale_quote');
    }
    
    // Wide spread
    const spreadBps = this.calculateSpreadBps(bid, ask);
    if (spreadBps > this.params.maxSpreadBps) {
      untradeableReasons.push('wide_spread');
    }
    
    // Large gap
    if (prices.length > 0 && previousClose) {
      const gap = this.detectGap(prices[prices.length - 1], previousClose);
      if (gap > this.params.maxGapPercent) {
        untradeableReasons.push('large_gap');
      }
    }
    
    if (untradeableReasons.length > 0) {
      return this._updateSymbolState(symbol, state, {
        regime: Regime.UNTRADEABLE,
        confidence: 1.0,
        reasons: untradeableReasons,
        spreadBps,
        lastUpdate: now,
      });
    }
    
    // Calculate metrics
    const realizedVol = this.calculateRealizedVol(prices);
    const directionalStrength = this.calculateDirectionalStrength(highs, lows, closes);
    const avgVolume = volumes.length > 0 
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 20)
      : 0;
    const recentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 1;
    
    // Store metrics
    state.metrics = {
      realizedVol,
      directionalStrength,
      spreadBps,
      volumeRatio,
      avgVolume,
      recentVolume,
    };
    
    // Determine regime
    let regime = Regime.CHOP;
    let confidence = 0.5;
    const reasons = [];
    
    // Check for volatility expansion
    const avgHistoricalVol = state.volHistory.length > 0
      ? state.volHistory.reduce((a, b) => a + b, 0) / state.volHistory.length
      : realizedVol || 0.3;
    
    const isVolExpansion = realizedVol && avgHistoricalVol > 0 &&
      realizedVol > avgHistoricalVol * this.params.volExpansionRatio;
    
    if (isVolExpansion) {
      regime = Regime.VOL_EXPANSION;
      confidence = Math.min(0.9, 0.5 + (realizedVol / avgHistoricalVol - 1) * 0.2);
      reasons.push('vol_expansion');
    }
    // Check for trend
    else if (directionalStrength !== null && directionalStrength > this.params.adxTrendThreshold) {
      regime = Regime.TREND;
      confidence = Math.min(0.9, 0.5 + (directionalStrength - this.params.adxTrendThreshold) * 0.02);
      reasons.push('strong_direction');
    }
    // Check for chop
    else if (directionalStrength !== null && directionalStrength < this.params.adxChopThreshold) {
      regime = Regime.CHOP;
      confidence = Math.min(0.9, 0.5 + (this.params.adxChopThreshold - directionalStrength) * 0.02);
      reasons.push('weak_direction');
    }
    
    // Volume anomaly can indicate regime change
    if (volumeRatio > this.params.volumeAnomalyRatio) {
      reasons.push('volume_anomaly');
      confidence = Math.max(confidence, 0.7);
    }
    
    // Update vol history
    if (realizedVol !== null) {
      state.volHistory.push(realizedVol);
      if (state.volHistory.length > 50) {
        state.volHistory.shift();
      }
    }
    
    // Apply smoothing (require consistent regime for N periods)
    const smoothedRegime = this._smoothRegime(symbol, regime, state);
    
    return this._updateSymbolState(symbol, state, {
      regime: smoothedRegime,
      rawRegime: regime,
      confidence,
      reasons,
      spreadBps,
      lastUpdate: now,
    });
  }

  /**
   * Smooth regime transitions to avoid whipsaws
   */
  _smoothRegime(symbol, newRegime, state) {
    state.recentRegimes.push(newRegime);
    if (state.recentRegimes.length > this.params.smoothingPeriod) {
      state.recentRegimes.shift();
    }
    
    // Count regime occurrences
    const counts = {};
    for (const r of state.recentRegimes) {
      counts[r] = (counts[r] || 0) + 1;
    }
    
    // Return most common regime
    let maxCount = 0;
    let smoothedRegime = state.regime;
    for (const [regime, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        smoothedRegime = regime;
      }
    }
    
    return smoothedRegime;
  }

  /**
   * Create initial symbol state
   */
  _createSymbolState(symbol) {
    return {
      symbol,
      regime: Regime.CHOP,
      confidence: 0,
      reasons: [],
      metrics: {},
      volHistory: [],
      recentRegimes: [],
      lastUpdate: null,
      cooldown: null,
      disabled: false,
    };
  }

  /**
   * Update symbol state
   */
  _updateSymbolState(symbol, state, updates) {
    Object.assign(state, updates);
    this.symbolState.set(symbol, state);
    
    // Log regime changes
    if (updates.regime && state.regime !== updates.regime) {
      this.logger.info({
        symbol,
        prevRegime: state.regime,
        newRegime: updates.regime,
        confidence: updates.confidence,
        reasons: updates.reasons,
      }, 'Regime changed');
    }
    
    return { ...state };
  }

  /**
   * Check if strategy is eligible to trade symbol
   */
  isStrategyEligible(strategy, symbol) {
    const state = this.symbolState.get(symbol);
    if (!state) return { eligible: false, reason: 'no_data' };
    
    if (state.disabled) {
      return { eligible: false, reason: 'symbol_disabled' };
    }
    
    if (state.cooldown && Date.now() < state.cooldown) {
      return { eligible: false, reason: 'cooldown' };
    }
    
    if (state.regime === Regime.UNTRADEABLE) {
      return { eligible: false, reason: 'untradeable_regime', details: state.reasons };
    }
    
    const allowedRegimes = STRATEGY_ELIGIBILITY[strategy] || [];
    if (!allowedRegimes.includes(state.regime)) {
      return {
        eligible: false,
        reason: 'regime_mismatch',
        currentRegime: state.regime,
        allowedRegimes,
      };
    }
    
    return {
      eligible: true,
      regime: state.regime,
      confidence: state.confidence,
    };
  }

  /**
   * Set cooldown for symbol
   */
  setCooldown(symbol, durationMs) {
    const state = this.symbolState.get(symbol) || this._createSymbolState(symbol);
    state.cooldown = Date.now() + durationMs;
    this.symbolState.set(symbol, state);
    
    this.logger.info({ symbol, durationMs, until: state.cooldown }, 'Symbol cooldown set');
  }

  /**
   * Disable symbol
   */
  disableSymbol(symbol, reason = '') {
    const state = this.symbolState.get(symbol) || this._createSymbolState(symbol);
    state.disabled = true;
    state.disabledReason = reason;
    state.disabledAt = new Date();
    this.symbolState.set(symbol, state);
    
    this.logger.warn({ symbol, reason }, 'Symbol disabled');
  }

  /**
   * Enable symbol
   */
  enableSymbol(symbol) {
    const state = this.symbolState.get(symbol);
    if (state) {
      state.disabled = false;
      state.disabledReason = null;
      this.symbolState.set(symbol, state);
      
      this.logger.info({ symbol }, 'Symbol enabled');
    }
  }

  /**
   * Get regime for symbol
   */
  getRegime(symbol) {
    return this.symbolState.get(symbol)?.regime || null;
  }

  /**
   * Get all symbol states
   */
  getAllSymbolStates() {
    return Array.from(this.symbolState.entries()).map(([symbol, state]) => ({
      symbol,
      ...state,
    }));
  }

  /**
   * Calculate market-wide regime
   */
  calculateMarketRegime(symbolStates = null) {
    const states = symbolStates || Array.from(this.symbolState.values());
    if (states.length === 0) return this.marketState;
    
    // Count regimes
    const regimeCounts = {
      [Regime.CHOP]: 0,
      [Regime.TREND]: 0,
      [Regime.VOL_EXPANSION]: 0,
      [Regime.UNTRADEABLE]: 0,
    };
    
    let totalVol = 0;
    let volCount = 0;
    
    for (const state of states) {
      regimeCounts[state.regime] = (regimeCounts[state.regime] || 0) + 1;
      if (state.metrics?.realizedVol) {
        totalVol += state.metrics.realizedVol;
        volCount++;
      }
    }
    
    // Determine market regime by majority
    let maxCount = 0;
    let marketRegime = Regime.CHOP;
    for (const [regime, count] of Object.entries(regimeCounts)) {
      if (count > maxCount && regime !== Regime.UNTRADEABLE) {
        maxCount = count;
        marketRegime = regime;
      }
    }
    
    // Calculate breadth (% of symbols trending/expanding)
    const breadth = (regimeCounts[Regime.TREND] + regimeCounts[Regime.VOL_EXPANSION]) / states.length;
    
    // Update market state
    this.marketState = {
      regime: marketRegime,
      confidence: maxCount / states.length,
      lastUpdate: new Date(),
      volatilityIndex: volCount > 0 ? totalVol / volCount : 0,
      breadth,
      regimeCounts,
    };
    
    return this.marketState;
  }

  /**
   * EMA helper
   */
  _ema(values, period) {
    if (values.length === 0) return 0;
    const alpha = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = alpha * values[i] + (1 - alpha) * ema;
    }
    return ema;
  }

  /**
   * Reset state (for testing)
   */
  reset() {
    this.symbolState.clear();
    this.regimeHistory = [];
    this.marketState = {
      regime: Regime.CHOP,
      confidence: 0,
      lastUpdate: null,
      volatilityIndex: 0,
      breadth: 0,
    };
  }
}

// Export singleton
export const regimeDetector = new RegimeDetector();
