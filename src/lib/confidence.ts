/**
 * Confidence-Based Trading System
 * 
 * Rates trades 1-10 based on:
 * - Technical signals (regime, momentum, volume)
 * - Risk/reward ratio
 * - Market conditions (VIX level, sector strength)
 * - Time of day (avoid first/last 15 min)
 */

import { detectRegimeCached, RegimeType } from './regime';
import {
  POSITION_SIZING as POSITION_SIZING_CONFIG,
  CONFIDENCE_CONFIG,
} from './constants';

export interface ConfidenceScore {
  total: number;           // 1-10
  technical: number;       // 1-10
  riskReward: number;      // 1-10
  marketConditions: number; // 1-10
  timeOfDay: number;       // 1-10
  breakdown: {
    regime: RegimeType;
    regimeConfidence: number;
    momentum: number;       // -1 to 1
    volumeAnomaly: number;
    vixLevel: number;
    riskRewardRatio: number;
    marketHour: string;
  };
  recommendation: 'SKIP' | 'SMALL' | 'MEDIUM' | 'FULL';
  positionSizePct: number;  // 0, 5, 10, or 20
  reasoning: string[];
}

export interface TradeParams {
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  targetPrice?: number;    // For R:R calculation
  stopPrice?: number;      // For R:R calculation
}

// Re-export position sizing from centralized constants for backwards compatibility
export const POSITION_SIZING = POSITION_SIZING_CONFIG;

/**
 * Calculate confidence score for a trade
 */
export async function calculateConfidence(params: TradeParams): Promise<ConfidenceScore> {
  const reasoning: string[] = [];
  
  // 1. Technical Score (regime, momentum, volume)
  const technicalResult = await calculateTechnicalScore(params.symbol);
  reasoning.push(...technicalResult.reasons);
  
  // 2. Risk/Reward Score
  const riskRewardResult = calculateRiskRewardScore(params);
  reasoning.push(...riskRewardResult.reasons);
  
  // 3. Market Conditions Score (VIX level)
  const marketResult = await calculateMarketConditionsScore();
  reasoning.push(...marketResult.reasons);
  
  // 4. Time of Day Score
  const timeResult = calculateTimeOfDayScore();
  reasoning.push(...timeResult.reasons);
  
  // Calculate weighted average using configurable weights
  const weightedScore =
    technicalResult.score * CONFIDENCE_CONFIG.WEIGHT_TECHNICAL +
    riskRewardResult.score * CONFIDENCE_CONFIG.WEIGHT_RISK_REWARD +
    marketResult.score * CONFIDENCE_CONFIG.WEIGHT_MARKET_CONDITIONS +
    timeResult.score * CONFIDENCE_CONFIG.WEIGHT_TIME_OF_DAY;

  const totalScore = Math.round(
    Math.max(CONFIDENCE_CONFIG.SCORE_MIN, Math.min(CONFIDENCE_CONFIG.SCORE_MAX, weightedScore))
  );
  
  // Determine position sizing
  let recommendation: ConfidenceScore['recommendation'];
  let positionSizePct: number;
  
  if (totalScore >= POSITION_SIZING.HIGH.min) {
    recommendation = 'FULL';
    positionSizePct = POSITION_SIZING.HIGH.pct;
  } else if (totalScore >= POSITION_SIZING.MEDIUM.min) {
    recommendation = 'MEDIUM';
    positionSizePct = POSITION_SIZING.MEDIUM.pct;
  } else if (totalScore >= POSITION_SIZING.LOW.min) {
    recommendation = 'SMALL';
    positionSizePct = POSITION_SIZING.LOW.pct;
  } else {
    recommendation = 'SKIP';
    positionSizePct = POSITION_SIZING.SKIP.pct;
  }
  
  return {
    total: totalScore,
    technical: Math.round(technicalResult.score),
    riskReward: Math.round(riskRewardResult.score),
    marketConditions: Math.round(marketResult.score),
    timeOfDay: Math.round(timeResult.score),
    breakdown: {
      regime: technicalResult.regime,
      regimeConfidence: technicalResult.regimeConfidence,
      momentum: technicalResult.momentum,
      volumeAnomaly: technicalResult.volumeAnomaly,
      vixLevel: marketResult.vixLevel,
      riskRewardRatio: riskRewardResult.ratio,
      marketHour: timeResult.marketHour,
    },
    recommendation,
    positionSizePct,
    reasoning,
  };
}

/**
 * Calculate technical score from regime detection
 */
async function calculateTechnicalScore(symbol: string): Promise<{
  score: number;
  regime: RegimeType;
  regimeConfidence: number;
  momentum: number;
  volumeAnomaly: number;
  reasons: string[];
}> {
  const reasons: string[] = [];
  
  try {
    const result = await detectRegimeCached(symbol);

    let score = 5; // Base score

    // Regime-based scoring
    switch (result.regime) {
      case 'TREND':
        score = 8 + result.confidence * 2; // 8-10
        reasons.push(`TREND regime detected (${(result.confidence * 100).toFixed(0)}% confidence) - favorable for momentum`);
        break;
      case 'CHOP':
        score = 5 + result.confidence; // 5-6
        reasons.push(`CHOP regime detected - range-bound, proceed with caution`);
        break;
      case 'VOL_EXPANSION':
        score = 4 - result.confidence; // 3-4
        reasons.push(`VOL_EXPANSION regime - elevated volatility, reduce size`);
        break;
      case 'UNTRADEABLE':
        score = 1;
        reasons.push(`UNTRADEABLE regime - extreme conditions, skip trade`);
        break;
    }

    // Adjust for momentum (regression slope)
    const momentum = result.metrics.regressionSlope;
    if (Math.abs(momentum) > 0.1) {
      score += 0.5;
      reasons.push(`Strong momentum: ${momentum > 0 ? 'bullish' : 'bearish'} trend`);
    }

    // Adjust for volume anomaly
    const volumeAnomaly = result.metrics.volumeAnomaly;
    if (volumeAnomaly > 1.5 && volumeAnomaly < 3) {
      score += 0.5;
      reasons.push(`Elevated volume (${volumeAnomaly.toFixed(1)}x avg) confirms move`);
    } else if (volumeAnomaly > 3) {
      score -= 1;
      reasons.push(`Extreme volume spike (${volumeAnomaly.toFixed(1)}x avg) - potential exhaustion`);
    }

    return {
      score: Math.max(1, Math.min(10, score)),
      regime: result.regime,
      regimeConfidence: result.confidence,
      momentum: momentum,
      volumeAnomaly: volumeAnomaly,
      reasons,
    };
  } catch {
    reasons.push(`Could not fetch regime data - using conservative estimate`);
    return {
      score: 5,
      regime: 'CHOP',
      regimeConfidence: 0.5,
      momentum: 0,
      volumeAnomaly: 1,
      reasons,
    };
  }
}

/**
 * Calculate risk/reward score
 */
function calculateRiskRewardScore(params: TradeParams): {
  score: number;
  ratio: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  
  // If no target/stop provided, assume 2:1 default
  if (!params.targetPrice || !params.stopPrice) {
    reasons.push(`No TP/SL specified - assuming 2:1 R:R (default)`);
    return { score: 6, ratio: 2, reasons };
  }
  
  const reward = Math.abs(params.targetPrice - params.entryPrice);
  const risk = Math.abs(params.entryPrice - params.stopPrice);
  
  if (risk === 0) {
    reasons.push(`Invalid stop loss - zero risk`);
    return { score: 1, ratio: 0, reasons };
  }
  
  const ratio = reward / risk;
  
  let score: number;
  if (ratio >= 3) {
    score = 10;
    reasons.push(`Excellent R:R ratio of ${ratio.toFixed(1)}:1`);
  } else if (ratio >= 2.5) {
    score = 9;
    reasons.push(`Very good R:R ratio of ${ratio.toFixed(1)}:1`);
  } else if (ratio >= 2) {
    score = 8;
    reasons.push(`Good R:R ratio of ${ratio.toFixed(1)}:1`);
  } else if (ratio >= 1.5) {
    score = 6;
    reasons.push(`Acceptable R:R ratio of ${ratio.toFixed(1)}:1`);
  } else if (ratio >= 1) {
    score = 4;
    reasons.push(`Marginal R:R ratio of ${ratio.toFixed(1)}:1 - barely break-even`);
  } else {
    score = 2;
    reasons.push(`Poor R:R ratio of ${ratio.toFixed(1)}:1 - negative expected value`);
  }
  
  return { score, ratio, reasons };
}

/**
 * Calculate market conditions score (VIX level, overall market health)
 */
async function calculateMarketConditionsScore(): Promise<{
  score: number;
  vixLevel: number;
  reasons: string[];
}> {
  const reasons: string[] = [];
  
  try {
    // Try to get VIX data from SPY volatility as proxy (cached)
    const spyResult = await detectRegimeCached('SPY');
    
    // Use ATR percent as VIX proxy (typical VIX ranges 10-40)
    // ATR% of 1% ≈ VIX 15, ATR% of 2% ≈ VIX 25, ATR% of 3% ≈ VIX 35
    const vixEstimate = spyResult.metrics.atrPercent * 12;
    
    let score: number;
    if (vixEstimate < 15) {
      score = 9;
      reasons.push(`Low volatility environment (VIX ~${vixEstimate.toFixed(0)}) - calm markets`);
    } else if (vixEstimate < 20) {
      score = 8;
      reasons.push(`Normal volatility (VIX ~${vixEstimate.toFixed(0)}) - healthy conditions`);
    } else if (vixEstimate < 25) {
      score = 6;
      reasons.push(`Elevated volatility (VIX ~${vixEstimate.toFixed(0)}) - increased caution`);
    } else if (vixEstimate < 30) {
      score = 4;
      reasons.push(`High volatility (VIX ~${vixEstimate.toFixed(0)}) - reduce exposure`);
    } else {
      score = 2;
      reasons.push(`Extreme volatility (VIX ~${vixEstimate.toFixed(0)}) - consider staying out`);
    }
    
    return { score, vixLevel: vixEstimate, reasons };
  } catch {
    reasons.push(`Could not assess market conditions - using moderate estimate`);
    return { score: 6, vixLevel: 20, reasons };
  }
}

/**
 * Calculate time of day score
 * Avoid: First 15 min (9:30-9:45) and last 15 min (3:45-4:00)
 */
function calculateTimeOfDayScore(): {
  score: number;
  marketHour: string;
  reasons: string[];
} {
  const reasons: string[] = [];
  const now = new Date();
  
  // Convert to ET (market hours)
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const marketOpen = 9 * 60 + 30;   // 9:30 AM
  const marketClose = 16 * 60;       // 4:00 PM
  const firstPeriodEnd = marketOpen + 15;  // 9:45 AM
  const lastPeriodStart = marketClose - 15; // 3:45 PM
  
  let score: number;
  let marketHour: string;
  
  // Pre-market
  if (totalMinutes < marketOpen) {
    score = 5;
    marketHour = 'pre-market';
    reasons.push(`Pre-market hours - limited liquidity`);
  }
  // First 15 minutes (high volatility, gaps)
  else if (totalMinutes < firstPeriodEnd) {
    score = 4;
    marketHour = 'open';
    reasons.push(`Market opening (first 15 min) - high volatility, avoid new positions`);
  }
  // Last 15 minutes (closing rush)
  else if (totalMinutes >= lastPeriodStart && totalMinutes < marketClose) {
    score = 4;
    marketHour = 'close';
    reasons.push(`Market closing (last 15 min) - end-of-day volatility`);
  }
  // After-hours
  else if (totalMinutes >= marketClose) {
    score = 3;
    marketHour = 'after-hours';
    reasons.push(`After-hours - limited liquidity and wider spreads`);
  }
  // Power hour (3:00-3:45)
  else if (totalMinutes >= (15 * 60) && totalMinutes < lastPeriodStart) {
    score = 7;
    marketHour = 'power-hour';
    reasons.push(`Power hour - good volume, institutional activity`);
  }
  // Mid-morning (9:45-11:30) - best time
  else if (totalMinutes >= firstPeriodEnd && totalMinutes < (11 * 60 + 30)) {
    score = 9;
    marketHour = 'mid-morning';
    reasons.push(`Mid-morning session - optimal trading conditions`);
  }
  // Lunch lull (11:30-2:00)
  else if (totalMinutes >= (11 * 60 + 30) && totalMinutes < (14 * 60)) {
    score = 6;
    marketHour = 'lunch';
    reasons.push(`Lunch hours - reduced volume, choppy price action`);
  }
  // Afternoon (2:00-3:00)
  else {
    score = 8;
    marketHour = 'afternoon';
    reasons.push(`Afternoon session - good trading conditions`);
  }
  
  // Weekend check
  const dayOfWeek = etTime.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    score = 1;
    marketHour = 'weekend';
    reasons.length = 0;
    reasons.push(`Weekend - markets closed`);
  }
  
  return { score, marketHour, reasons };
}

/**
 * Get recommended position size based on confidence and portfolio value
 */
export function getPositionSize(confidence: ConfidenceScore, portfolioValue: number): {
  dollarAmount: number;
  percentOfPortfolio: number;
} {
  const dollarAmount = portfolioValue * (confidence.positionSizePct / 100);
  return {
    dollarAmount,
    percentOfPortfolio: confidence.positionSizePct,
  };
}

/**
 * Calculate suggested TP/SL based on ATR
 */
export async function getSuggestedLevels(symbol: string, entryPrice: number, side: 'buy' | 'sell'): Promise<{
  takeProfit: number;
  takeProfitPct: number;
  stopLoss: number;
  stopLossPct: number;
  atrBased: boolean;
}> {
  try {
    const result = await detectRegimeCached(symbol);

    // Use 2x ATR for TP, 1x ATR for SL
    const atrPercent = result.metrics.atrPercent;
    
    let takeProfitPct = atrPercent * 2;  // 2x ATR
    let stopLossPct = atrPercent;         // 1x ATR
    
    // Minimum floors
    takeProfitPct = Math.max(takeProfitPct, 1.5);  // At least 1.5%
    stopLossPct = Math.max(stopLossPct, 0.5);      // At least 0.5%
    
    // Maximum caps
    takeProfitPct = Math.min(takeProfitPct, 5);    // Max 5%
    stopLossPct = Math.min(stopLossPct, 3);        // Max 3%
    
    const multiplier = side === 'buy' ? 1 : -1;
    
    return {
      takeProfit: entryPrice * (1 + multiplier * takeProfitPct / 100),
      takeProfitPct,
      stopLoss: entryPrice * (1 - multiplier * stopLossPct / 100),
      stopLossPct,
      atrBased: true,
    };
  } catch {
    // Default to fixed percentages
    const takeProfitPct = 2;
    const stopLossPct = 1;
    const multiplier = side === 'buy' ? 1 : -1;
    
    return {
      takeProfit: entryPrice * (1 + multiplier * takeProfitPct / 100),
      takeProfitPct,
      stopLoss: entryPrice * (1 - multiplier * stopLossPct / 100),
      stopLossPct,
      atrBased: false,
    };
  }
}
