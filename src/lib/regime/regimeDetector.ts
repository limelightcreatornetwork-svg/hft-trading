/**
 * Regime Detector - Main Classification Engine
 * 
 * Classifies market conditions into trading regimes:
 * - CHOP: Low directional movement, mean-reversion friendly
 * - TREND: Strong directional bias, momentum-friendly
 * - VOL_EXPANSION: Volatility expanding, wider stops needed
 * - UNTRADEABLE: News events, halts, stale data
 */

import {
  MarketRegime,
  MarketSession,
  MarketDataInput,
  RegimeResult,
  RegimeConfig,
  RegimeIndicators,
  DEFAULT_REGIME_CONFIG,
} from './types';
import { computeIndicators } from './indicators';

/**
 * Main regime detection class
 */
export class RegimeDetector {
  private config: RegimeConfig;
  
  constructor(config: Partial<RegimeConfig> = {}) {
    this.config = { ...DEFAULT_REGIME_CONFIG, ...config };
  }
  
  /**
   * Detect current market regime from raw data
   */
  detect(data: MarketDataInput): RegimeResult {
    const indicators = computeIndicators(data);
    const scores = this.calculateScores(data, indicators);
    const regime = this.classifyRegime(scores);
    const confidence = this.calculateConfidence(scores, regime);
    const guidance = this.generateGuidance(regime, indicators, data);
    
    return {
      symbol: data.symbol,
      timestamp: data.timestamp,
      regime,
      confidence,
      scores,
      indicators,
      guidance,
    };
  }
  
  /**
   * Calculate raw scores for each regime
   */
  private calculateScores(
    data: MarketDataInput,
    indicators: RegimeIndicators
  ): RegimeResult['scores'] {
    // UNTRADEABLE score - highest priority
    const untradeableScore = this.calculateUntradeableScore(data, indicators);
    
    // VOL_EXPANSION score
    const volExpansionScore = this.calculateVolExpansionScore(indicators);
    
    // TREND score
    const trendScore = this.calculateTrendScore(indicators);
    
    // CHOP score (inverse of trend)
    const chopScore = this.calculateChopScore(indicators);
    
    return {
      chop: chopScore,
      trend: trendScore,
      volExpansion: volExpansionScore,
      untradeable: untradeableScore,
    };
  }
  
  /**
   * Calculate UNTRADEABLE score
   */
  private calculateUntradeableScore(
    data: MarketDataInput,
    indicators: RegimeIndicators
  ): number {
    let score = 0;
    
    // Halted stock = definitely untradeable
    if (data.isHalted) {
      return 1.0;
    }
    
    // Stale data
    if (data.lastUpdateMs > this.config.staleDataThresholdMs) {
      score += 0.4;
    }
    
    // Wide spreads (illiquidity)
    if (indicators.spreadRatio > this.config.spreadUntradeableMultiple) {
      score += 0.4;
    } else if (indicators.spreadRatio > this.config.spreadWarningMultiple) {
      score += 0.2;
    }
    
    // Gap (potential news)
    if (data.hasGap && data.gapSize && data.gapSize > 0.02) {
      score += 0.3;
    }
    
    // Avoid open/close periods
    if (indicators.session === MarketSession.OPEN_AUCTION) {
      score += 0.5;
    } else if (indicators.session === MarketSession.CLOSE_AUCTION) {
      score += 0.3;
    } else if (indicators.minutesSinceOpen < this.config.avoidOpenMinutes) {
      score += 0.2;
    } else if (indicators.minutesToClose < this.config.avoidCloseMinutes) {
      score += 0.2;
    }
    
    // Outside regular hours
    if (indicators.session === MarketSession.PRE_MARKET ||
        indicators.session === MarketSession.AFTER_HOURS ||
        indicators.session === MarketSession.CLOSED) {
      score += 0.5;
    }
    
    // Extreme volume (news/event)
    if (Math.abs(indicators.volumeZScore) > this.config.volumeAnomalyZScore) {
      score += 0.2;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Calculate VOL_EXPANSION score
   */
  private calculateVolExpansionScore(indicators: RegimeIndicators): number {
    let score = 0;
    
    // Vol ratio expansion
    if (indicators.volRatio > this.config.volExpansionThreshold) {
      score += 0.5 * Math.min(2, indicators.volRatio / this.config.volExpansionThreshold);
    }
    
    // Wide spreads (but not untradeable)
    if (indicators.spreadRatio > 1.5 && indicators.spreadRatio < this.config.spreadUntradeableMultiple) {
      score += 0.2;
    }
    
    // Elevated volume
    if (indicators.volumeRatio > 1.5) {
      score += 0.2 * Math.min(1, (indicators.volumeRatio - 1) / 2);
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Calculate TREND score
   */
  private calculateTrendScore(indicators: RegimeIndicators): number {
    let score = 0;
    
    // ADX above threshold = trending
    if (indicators.adx > this.config.adxTrendThreshold) {
      score += 0.6 * Math.min(1, indicators.adx / 50);
    }
    
    // Clear directional bias (+DI vs -DI)
    const diDiff = Math.abs(indicators.plusDI - indicators.minusDI);
    if (diDiff > 10) {
      score += 0.3 * Math.min(1, diDiff / 30);
    }
    
    // Moderate vol ratio (not chopping, not exploding)
    if (indicators.volRatio > 0.8 && indicators.volRatio < 1.3) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Calculate CHOP score
   */
  private calculateChopScore(indicators: RegimeIndicators): number {
    let score = 0;
    
    // Low ADX = choppy
    if (indicators.adx < this.config.adxChopThreshold) {
      score += 0.6 * (1 - indicators.adx / this.config.adxChopThreshold);
    }
    
    // No clear directional bias
    const diDiff = Math.abs(indicators.plusDI - indicators.minusDI);
    if (diDiff < 10) {
      score += 0.3 * (1 - diDiff / 10);
    }
    
    // Low vol ratio
    if (indicators.volRatio < this.config.volContractionThreshold) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Classify final regime based on scores
   */
  private classifyRegime(scores: RegimeResult['scores']): MarketRegime {
    // Priority order: UNTRADEABLE > VOL_EXPANSION > TREND > CHOP
    
    if (scores.untradeable > 0.5) {
      return MarketRegime.UNTRADEABLE;
    }
    
    if (scores.volExpansion > 0.5 && scores.volExpansion > scores.trend) {
      return MarketRegime.VOL_EXPANSION;
    }
    
    if (scores.trend > scores.chop && scores.trend > 0.3) {
      return MarketRegime.TREND;
    }
    
    return MarketRegime.CHOP;
  }
  
  /**
   * Calculate confidence score for the classification
   */
  private calculateConfidence(
    scores: RegimeResult['scores'],
    regime: MarketRegime
  ): number {
    const regimeScore = scores[regime.toLowerCase() as keyof typeof scores] ?? 0;
    
    // Get second highest score
    const allScores = Object.values(scores).sort((a, b) => b - a);
    const secondHighest = allScores[1] || 0;
    
    // Confidence based on margin between top score and others
    const margin = regimeScore - secondHighest;
    const confidence = 0.5 + (margin * 0.5);
    
    return Math.max(0.3, Math.min(1, confidence));
  }
  
  /**
   * Generate trading guidance based on regime
   */
  private generateGuidance(
    regime: MarketRegime,
    indicators: RegimeIndicators,
    data: MarketDataInput
  ): RegimeResult['guidance'] {
    const warnings: string[] = [];
    let canTrade = true;
    let suggestedStopMultiplier = 1.5;
    let suggestedPositionSize = 1.0;
    
    // Regime-specific guidance
    switch (regime) {
      case MarketRegime.UNTRADEABLE:
        canTrade = false;
        suggestedPositionSize = 0;
        warnings.push('Market conditions unsuitable for trading');
        if (data.isHalted) warnings.push('Stock is halted');
        if (data.lastUpdateMs > this.config.staleDataThresholdMs) warnings.push('Stale data detected');
        break;
        
      case MarketRegime.VOL_EXPANSION:
        suggestedStopMultiplier = 2.5;
        suggestedPositionSize = 0.5;
        warnings.push('Volatility expanding - use wider stops and smaller size');
        break;
        
      case MarketRegime.TREND:
        suggestedStopMultiplier = 2.0;
        suggestedPositionSize = 1.0;
        if (indicators.plusDI > indicators.minusDI) {
          warnings.push('Bullish trend detected - favor long positions');
        } else {
          warnings.push('Bearish trend detected - favor short positions');
        }
        break;
        
      case MarketRegime.CHOP:
        suggestedStopMultiplier = 1.0;
        suggestedPositionSize = 0.7;
        warnings.push('Choppy conditions - consider mean-reversion strategies');
        warnings.push('Tighten stops and reduce position size');
        break;
    }
    
    // Additional warnings
    if (indicators.spreadRatio > 1.5) {
      warnings.push(`Wide spread: ${(indicators.spreadRatio * 100 - 100).toFixed(0)}% above average`);
    }
    
    if (Math.abs(indicators.volumeZScore) > 2) {
      warnings.push('Unusual volume detected');
    }
    
    if (indicators.minutesSinceOpen < 15) {
      warnings.push('Early in session - elevated volatility expected');
      suggestedPositionSize *= 0.7;
    }
    
    if (indicators.minutesToClose < 15) {
      warnings.push('Near market close - reduced liquidity possible');
      suggestedPositionSize *= 0.8;
    }
    
    return {
      canTrade,
      suggestedStopMultiplier,
      suggestedPositionSize: Math.max(0, Math.min(1, suggestedPositionSize)),
      warnings,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<RegimeConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): RegimeConfig {
    return { ...this.config };
  }
}

/**
 * Create a new regime detector instance
 */
export function createRegimeDetector(config?: Partial<RegimeConfig>): RegimeDetector {
  return new RegimeDetector(config);
}

/**
 * Quick regime check - single function call
 */
export function detectRegime(data: MarketDataInput, config?: Partial<RegimeConfig>): RegimeResult {
  const detector = new RegimeDetector(config);
  return detector.detect(data);
}

export { MarketRegime, MarketSession } from './types';
