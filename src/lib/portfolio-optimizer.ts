/**
 * Portfolio Optimization Module
 * 
 * Provides position sizing algorithms, risk metrics, correlation analysis,
 * and rebalancing recommendations for portfolio management.
 */

import { getPositions, AlpacaPosition } from './alpaca';

// =============================================================================
// TYPES
// =============================================================================

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  weight: number; // as decimal (0-1)
  unrealizedPL: number;
  unrealizedPLPercent: number;
  sector?: string;
  assetClass?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedPL: number;
  totalUnrealizedPLPercent: number;
  positions: PortfolioPosition[];
  cash: number;
  cashWeight: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  valueAtRisk: number; // 95% VaR
  valueAtRiskPercent: number;
  volatility: number; // annualized
  beta: number;
  sortino: number;
  calmarRatio: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  highCorrelations: Array<{
    symbol1: string;
    symbol2: string;
    correlation: number;
  }>;
}

export interface KellyCriterion {
  symbol: string;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  kellyFraction: number;
  halfKelly: number; // more conservative
  quarterKelly: number; // very conservative
  recommendedAllocation: number;
}

export interface RiskParityWeights {
  symbol: string;
  volatility: number;
  inverseVolWeight: number;
  targetWeight: number;
  currentWeight: number;
  adjustmentNeeded: number;
}

export interface RebalanceSuggestion {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  currentValue: number;
  targetValue: number;
  action: 'buy' | 'sell' | 'hold';
  sharesChange: number;
  dollarChange: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface SectorAllocation {
  sector: string;
  symbols: string[];
  totalValue: number;
  weight: number;
  targetWeight?: number;
}

export interface AssetClassAllocation {
  assetClass: string;
  symbols: string[];
  totalValue: number;
  weight: number;
}

// =============================================================================
// SECTOR & ASSET CLASS MAPPINGS
// =============================================================================

const SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL: 'Technology',
  MSFT: 'Technology',
  GOOGL: 'Technology',
  GOOG: 'Technology',
  META: 'Technology',
  NVDA: 'Technology',
  AMD: 'Technology',
  INTC: 'Technology',
  QCOM: 'Technology',
  AVGO: 'Technology',
  CRM: 'Technology',
  ADBE: 'Technology',
  ORCL: 'Technology',
  IBM: 'Technology',
  
  // Consumer Discretionary
  AMZN: 'Consumer Discretionary',
  TSLA: 'Consumer Discretionary',
  HD: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary',
  MCD: 'Consumer Discretionary',
  SBUX: 'Consumer Discretionary',
  
  // Automotive
  F: 'Automotive',
  GM: 'Automotive',
  TM: 'Automotive',
  RIVN: 'Automotive',
  LCID: 'Automotive',
  NIO: 'Electric Vehicles',
  
  // Healthcare
  JNJ: 'Healthcare',
  UNH: 'Healthcare',
  PFE: 'Healthcare',
  ABBV: 'Healthcare',
  MRK: 'Healthcare',
  LLY: 'Healthcare',
  
  // Financial
  JPM: 'Financial',
  BAC: 'Financial',
  WFC: 'Financial',
  GS: 'Financial',
  MS: 'Financial',
  V: 'Financial',
  MA: 'Financial',
  
  // Energy
  XOM: 'Energy',
  CVX: 'Energy',
  COP: 'Energy',
  SLB: 'Energy',
  
  // Communication Services
  NFLX: 'Communication Services',
  DIS: 'Communication Services',
  CMCSA: 'Communication Services',
  T: 'Communication Services',
  VZ: 'Communication Services',
  
  // ETFs
  SPY: 'ETF - Index',
  QQQ: 'ETF - Index',
  IWM: 'ETF - Index',
  DIA: 'ETF - Index',
  VTI: 'ETF - Index',
  VOO: 'ETF - Index',
  
  // Default
  DEFAULT: 'Other',
};

const ASSET_CLASS_MAP: Record<string, string> = {
  SPY: 'Index ETF',
  QQQ: 'Index ETF',
  IWM: 'Index ETF',
  DIA: 'Index ETF',
  VTI: 'Index ETF',
  VOO: 'Index ETF',
  DEFAULT: 'Individual Stock',
};

function getSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase()] || SECTOR_MAP.DEFAULT;
}

function getAssetClass(symbol: string): string {
  return ASSET_CLASS_MAP[symbol.toUpperCase()] || ASSET_CLASS_MAP.DEFAULT;
}

// =============================================================================
// PORTFOLIO SUMMARY
// =============================================================================

export async function getPortfolioSummary(cash: number = 0): Promise<PortfolioSummary> {
  const alpacaPositions = await getPositions();
  
  const positions: PortfolioPosition[] = alpacaPositions.map((pos: AlpacaPosition) => {
    const marketValue = parseFloat(pos.market_value);
    const costBasis = parseFloat(pos.cost_basis);
    const unrealizedPL = parseFloat(pos.unrealized_pl);
    
    return {
      symbol: pos.symbol,
      quantity: parseFloat(pos.qty),
      currentPrice: parseFloat(pos.current_price),
      marketValue,
      costBasis,
      weight: 0, // calculated below
      unrealizedPL,
      unrealizedPLPercent: costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0,
      sector: getSector(pos.symbol),
      assetClass: getAssetClass(pos.symbol),
    };
  });
  
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalValue = totalMarketValue + cash;
  
  // Calculate weights
  positions.forEach(p => {
    p.weight = totalValue > 0 ? p.marketValue / totalValue : 0;
  });
  
  const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalUnrealizedPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  
  return {
    totalValue,
    totalCostBasis,
    totalUnrealizedPL,
    totalUnrealizedPLPercent: totalCostBasis > 0 ? (totalUnrealizedPL / totalCostBasis) * 100 : 0,
    positions,
    cash,
    cashWeight: totalValue > 0 ? cash / totalValue : 0,
  };
}

// =============================================================================
// KELLY CRITERION POSITION SIZING
// =============================================================================

interface TradeHistory {
  symbol: string;
  profit: number; // positive for win, negative for loss
  returnPct: number;
}

/**
 * Calculate Kelly Criterion for position sizing
 * Kelly % = W - [(1-W) / R]
 * Where W = win rate, R = win/loss ratio
 */
export function calculateKellyCriterion(
  symbol: string,
  trades: TradeHistory[],
  portfolioValue: number
): KellyCriterion {
  const symbolTrades = trades.filter(t => t.symbol === symbol);
  
  if (symbolTrades.length < 5) {
    // Not enough history, return conservative estimate
    return {
      symbol,
      winRate: 0.5,
      avgWin: 0,
      avgLoss: 0,
      kellyFraction: 0.05, // default 5%
      halfKelly: 0.025,
      quarterKelly: 0.0125,
      recommendedAllocation: portfolioValue * 0.025,
    };
  }
  
  const wins = symbolTrades.filter(t => t.profit > 0);
  const losses = symbolTrades.filter(t => t.profit <= 0);
  
  const winRate = wins.length / symbolTrades.length;
  const avgWin = wins.length > 0 
    ? wins.reduce((sum, t) => sum + t.returnPct, 0) / wins.length 
    : 0;
  const avgLoss = losses.length > 0 
    ? Math.abs(losses.reduce((sum, t) => sum + t.returnPct, 0) / losses.length)
    : 0.01; // prevent division by zero
  
  // Kelly formula: f* = (p * b - q) / b
  // where p = win probability, q = 1-p, b = win/loss ratio
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kellyFraction = Math.max(0, (winRate * b - (1 - winRate)) / b);
  
  // Cap at 25% for safety
  const cappedKelly = Math.min(kellyFraction, 0.25);
  
  return {
    symbol,
    winRate,
    avgWin,
    avgLoss,
    kellyFraction: cappedKelly,
    halfKelly: cappedKelly / 2,
    quarterKelly: cappedKelly / 4,
    recommendedAllocation: portfolioValue * (cappedKelly / 2), // use half-Kelly
  };
}

/**
 * Calculate Kelly criterion for all positions with simulated history
 */
export function calculatePortfolioKelly(
  positions: PortfolioPosition[],
  portfolioValue: number,
  simulatedWinRate: number = 0.55,
  simulatedWinLossRatio: number = 1.5
): KellyCriterion[] {
  return positions.map(pos => {
    // For positions without trade history, use estimated parameters
    const b = simulatedWinLossRatio;
    const p = simulatedWinRate;
    const kellyFraction = Math.max(0, (p * b - (1 - p)) / b);
    const cappedKelly = Math.min(kellyFraction, 0.25);
    
    return {
      symbol: pos.symbol,
      winRate: simulatedWinRate,
      avgWin: simulatedWinLossRatio * 2, // approximate
      avgLoss: 2, // approximate 2% loss
      kellyFraction: cappedKelly,
      halfKelly: cappedKelly / 2,
      quarterKelly: cappedKelly / 4,
      recommendedAllocation: portfolioValue * (cappedKelly / 2),
    };
  });
}

// =============================================================================
// RISK PARITY WEIGHTS
// =============================================================================

// VolatilityData interface - used for internal calculations
// interface VolatilityData {
//   symbol: string;
//   volatility: number; // annualized
//   dailyReturns: number[];
// }

/**
 * Calculate risk parity weights based on inverse volatility
 */
export function calculateRiskParityWeights(
  positions: PortfolioPosition[],
  volatilities: Map<string, number>,
  _portfolioValue: number
): RiskParityWeights[] {
  // Calculate inverse volatility for each position
  const inverseVols = positions.map(pos => {
    const vol = volatilities.get(pos.symbol) || 0.20; // default 20% if unknown
    return {
      symbol: pos.symbol,
      volatility: vol,
      inverseVol: 1 / vol,
    };
  });
  
  // Sum of inverse volatilities
  const totalInverseVol = inverseVols.reduce((sum, v) => sum + v.inverseVol, 0);
  
  // Calculate target weights
  return inverseVols.map(v => {
    const position = positions.find(p => p.symbol === v.symbol)!;
    const targetWeight = totalInverseVol > 0 ? v.inverseVol / totalInverseVol : 1 / positions.length;
    
    return {
      symbol: v.symbol,
      volatility: v.volatility,
      inverseVolWeight: v.inverseVol,
      targetWeight,
      currentWeight: position.weight,
      adjustmentNeeded: targetWeight - position.weight,
    };
  });
}

/**
 * Estimate volatility from price data
 * Uses simple standard deviation of returns (annualized)
 */
export function estimateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0.20; // default
  
  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  
  if (returns.length === 0) return 0.20;
  
  // Calculate standard deviation
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Annualize (252 trading days)
  return stdDev * Math.sqrt(252);
}

// =============================================================================
// CORRELATION ANALYSIS
// =============================================================================

/**
 * Calculate correlation between two return series
 */
function calculateCorrelation(returns1: number[], returns2: number[]): number {
  const n = Math.min(returns1.length, returns2.length);
  if (n < 2) return 0;
  
  const slice1 = returns1.slice(-n);
  const slice2 = returns2.slice(-n);
  
  const mean1 = slice1.reduce((a, b) => a + b, 0) / n;
  const mean2 = slice2.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;
  
  for (let i = 0; i < n; i++) {
    const diff1 = slice1[i] - mean1;
    const diff2 = slice2[i] - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }
  
  const denominator = Math.sqrt(denom1 * denom2);
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Build correlation matrix for portfolio positions
 */
export function buildCorrelationMatrix(
  symbols: string[],
  returnSeries: Map<string, number[]>,
  threshold: number = 0.7
): CorrelationMatrix {
  const n = symbols.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  const highCorrelations: CorrelationMatrix['highCorrelations'] = [];
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0; // diagonal
    const returns1 = returnSeries.get(symbols[i]) || [];
    
    for (let j = i + 1; j < n; j++) {
      const returns2 = returnSeries.get(symbols[j]) || [];
      const corr = calculateCorrelation(returns1, returns2);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
      
      if (Math.abs(corr) >= threshold) {
        highCorrelations.push({
          symbol1: symbols[i],
          symbol2: symbols[j],
          correlation: corr,
        });
      }
    }
  }
  
  return { symbols, matrix, highCorrelations };
}

// =============================================================================
// RISK METRICS
// =============================================================================

/**
 * Calculate Sharpe Ratio
 * Sharpe = (Rp - Rf) / σp
 */
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.05 // annual
): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Annualize
  const annualReturn = avgReturn * 252;
  const annualStdDev = stdDev * Math.sqrt(252);
  
  return annualStdDev > 0 ? (annualReturn - riskFreeRate) / annualStdDev : 0;
}

/**
 * Calculate Sortino Ratio (downside risk only)
 */
export function calculateSortinoRatio(
  returns: number[],
  riskFreeRate: number = 0.05
): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // Only negative returns for downside deviation
  const negativeReturns = returns.filter(r => r < 0);
  if (negativeReturns.length === 0) return 10; // no downside, excellent
  
  const downsideVariance = negativeReturns.reduce((sum, r) => sum + r * r, 0) / returns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  
  // Annualize
  const annualReturn = avgReturn * 252;
  const annualDownside = downsideDeviation * Math.sqrt(252);
  
  return annualDownside > 0 ? (annualReturn - riskFreeRate) / annualDownside : 0;
}

/**
 * Calculate Maximum Drawdown
 */
export function calculateMaxDrawdown(equityCurve: number[]): { maxDrawdown: number; maxDrawdownPercent: number } {
  if (equityCurve.length < 2) return { maxDrawdown: 0, maxDrawdownPercent: 0 };
  
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  
  for (const value of equityCurve) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = peak - value;
    const drawdownPercent = peak > 0 ? drawdown / peak : 0;
    
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }
  
  return { maxDrawdown, maxDrawdownPercent: maxDrawdownPercent * 100 };
}

/**
 * Calculate Value at Risk (VaR) using historical method
 * Returns the potential loss at a given confidence level
 */
export function calculateVaR(
  returns: number[],
  portfolioValue: number,
  confidenceLevel: number = 0.95,
  holdingPeriod: number = 1 // days
): { valueAtRisk: number; valueAtRiskPercent: number } {
  if (returns.length < 10) {
    // Not enough data, use parametric estimate
    return {
      valueAtRisk: portfolioValue * 0.02, // 2% default
      valueAtRiskPercent: 2,
    };
  }
  
  // Sort returns ascending
  const sortedReturns = [...returns].sort((a, b) => a - b);
  
  // Find the percentile
  const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
  const varReturn = sortedReturns[index] || sortedReturns[0];
  
  // Scale for holding period
  const scaledVaR = varReturn * Math.sqrt(holdingPeriod);
  
  return {
    valueAtRisk: Math.abs(scaledVaR * portfolioValue),
    valueAtRiskPercent: Math.abs(scaledVaR * 100),
  };
}

/**
 * Calculate Calmar Ratio
 * Calmar = Annual Return / Max Drawdown
 */
export function calculateCalmarRatio(
  annualReturn: number,
  maxDrawdownPercent: number
): number {
  return maxDrawdownPercent > 0 ? annualReturn / maxDrawdownPercent : 0;
}

/**
 * Calculate comprehensive risk metrics
 */
export function calculateRiskMetrics(
  dailyReturns: number[],
  equityCurve: number[],
  portfolioValue: number,
  marketReturns?: number[], // for beta calculation
  riskFreeRate: number = 0.05
): RiskMetrics {
  const sharpeRatio = calculateSharpeRatio(dailyReturns, riskFreeRate);
  const sortino = calculateSortinoRatio(dailyReturns, riskFreeRate);
  const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(equityCurve);
  const { valueAtRisk, valueAtRiskPercent } = calculateVaR(dailyReturns, portfolioValue);
  
  // Calculate volatility
  const avgReturn = dailyReturns.length > 0 
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length 
    : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
    : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  
  // Calculate beta if market returns provided
  let beta = 1.0;
  if (marketReturns && marketReturns.length > 0) {
    const correlation = calculateCorrelation(dailyReturns, marketReturns);
    const marketStdDev = Math.sqrt(
      marketReturns.reduce((sum, r) => {
        const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
        return sum + Math.pow(r - marketMean, 2);
      }, 0) / marketReturns.length
    );
    const portfolioStdDev = Math.sqrt(variance);
    beta = marketStdDev > 0 ? (correlation * portfolioStdDev) / marketStdDev : 1;
  }
  
  // Calmar ratio
  const annualReturn = avgReturn * 252;
  const calmarRatio = calculateCalmarRatio(annualReturn * 100, maxDrawdownPercent);
  
  return {
    sharpeRatio,
    maxDrawdown,
    maxDrawdownPercent,
    valueAtRisk,
    valueAtRiskPercent,
    volatility: volatility * 100, // as percentage
    beta,
    sortino,
    calmarRatio,
  };
}

// =============================================================================
// REBALANCING SUGGESTIONS
// =============================================================================

/**
 * Generate rebalancing suggestions based on target allocation
 */
export function generateRebalanceSuggestions(
  positions: PortfolioPosition[],
  targetWeights: Map<string, number>,
  portfolioValue: number,
  tolerancePct: number = 5 // rebalance if off by more than 5%
): RebalanceSuggestion[] {
  const suggestions: RebalanceSuggestion[] = [];
  
  for (const position of positions) {
    const targetWeight = targetWeights.get(position.symbol) || 0;
    const currentWeight = position.weight * 100; // convert to percentage
    const targetWeightPct = targetWeight * 100;
    
    const weightDiff = targetWeightPct - currentWeight;
    const currentValue = position.marketValue;
    const targetValue = portfolioValue * targetWeight;
    const dollarChange = targetValue - currentValue;
    const sharesChange = position.currentPrice > 0 
      ? Math.round(dollarChange / position.currentPrice)
      : 0;
    
    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let priority: 'high' | 'medium' | 'low' = 'low';
    let reason = '';
    
    if (Math.abs(weightDiff) > tolerancePct) {
      action = dollarChange > 0 ? 'buy' : 'sell';
      priority = Math.abs(weightDiff) > tolerancePct * 2 ? 'high' : 'medium';
      reason = `${Math.abs(weightDiff).toFixed(1)}% deviation from target (${currentWeight.toFixed(1)}% → ${targetWeightPct.toFixed(1)}%)`;
    } else if (Math.abs(weightDiff) > tolerancePct / 2) {
      priority = 'low';
      reason = `Minor deviation: ${Math.abs(weightDiff).toFixed(1)}%`;
    } else {
      reason = 'Within tolerance';
    }
    
    suggestions.push({
      symbol: position.symbol,
      currentWeight: currentWeight / 100,
      targetWeight,
      currentValue,
      targetValue,
      action,
      sharesChange: Math.abs(sharesChange),
      dollarChange,
      priority,
      reason,
    });
  }
  
  // Sort by priority and absolute dollar change
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return Math.abs(b.dollarChange) - Math.abs(a.dollarChange);
  });
}

/**
 * Generate equal-weight target allocation
 */
export function generateEqualWeightTargets(symbols: string[]): Map<string, number> {
  const weight = 1 / symbols.length;
  return new Map(symbols.map(s => [s, weight]));
}

// =============================================================================
// SECTOR & ASSET CLASS ALLOCATION
// =============================================================================

/**
 * Calculate sector allocation breakdown
 */
export function calculateSectorAllocation(positions: PortfolioPosition[]): SectorAllocation[] {
  const sectorMap = new Map<string, { symbols: string[]; totalValue: number }>();
  
  for (const position of positions) {
    const sector = position.sector || 'Other';
    const existing = sectorMap.get(sector) || { symbols: [], totalValue: 0 };
    existing.symbols.push(position.symbol);
    existing.totalValue += position.marketValue;
    sectorMap.set(sector, existing);
  }
  
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  
  const allocations: SectorAllocation[] = [];
  for (const [sector, data] of sectorMap) {
    allocations.push({
      sector,
      symbols: data.symbols,
      totalValue: data.totalValue,
      weight: totalValue > 0 ? data.totalValue / totalValue : 0,
    });
  }
  
  return allocations.sort((a, b) => b.weight - a.weight);
}

/**
 * Calculate asset class allocation breakdown
 */
export function calculateAssetClassAllocation(positions: PortfolioPosition[]): AssetClassAllocation[] {
  const classMap = new Map<string, { symbols: string[]; totalValue: number }>();
  
  for (const position of positions) {
    const assetClass = position.assetClass || 'Individual Stock';
    const existing = classMap.get(assetClass) || { symbols: [], totalValue: 0 };
    existing.symbols.push(position.symbol);
    existing.totalValue += position.marketValue;
    classMap.set(assetClass, existing);
  }
  
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  
  const allocations: AssetClassAllocation[] = [];
  for (const [assetClass, data] of classMap) {
    allocations.push({
      assetClass,
      symbols: data.symbols,
      totalValue: data.totalValue,
      weight: totalValue > 0 ? data.totalValue / totalValue : 0,
    });
  }
  
  return allocations.sort((a, b) => b.weight - a.weight);
}

// =============================================================================
// DIVERSIFICATION SCORE
// =============================================================================

export interface DiversificationAnalysis {
  score: number; // 0-100
  sectorConcentration: number;
  correlationRisk: number;
  positionConcentration: number;
  recommendations: string[];
}

/**
 * Calculate portfolio diversification score
 */
export function analyzeDiversification(
  positions: PortfolioPosition[],
  sectorAllocation: SectorAllocation[],
  correlationMatrix?: CorrelationMatrix
): DiversificationAnalysis {
  const recommendations: string[] = [];
  
  // 1. Position concentration (Herfindahl-Hirschman Index)
  const weights = positions.map(p => p.weight);
  const hhi = weights.reduce((sum, w) => sum + w * w, 0);
  const positionConcentration = hhi * 100;
  
  // Score: lower HHI = better diversification
  const positionScore = Math.max(0, 100 - (hhi * 400)); // HHI of 0.25 = 0 score
  
  if (hhi > 0.2) {
    recommendations.push(`High position concentration (${(hhi * 100).toFixed(1)}% HHI). Consider reducing largest positions.`);
  }
  
  // 2. Sector concentration
  const maxSectorWeight = sectorAllocation.length > 0 
    ? Math.max(...sectorAllocation.map(s => s.weight))
    : 0;
  const sectorConcentration = maxSectorWeight * 100;
  
  const sectorScore = Math.max(0, 100 - (maxSectorWeight * 200)); // 50% in one sector = 0
  
  if (maxSectorWeight > 0.4) {
    const topSector = sectorAllocation[0];
    recommendations.push(`Heavy ${topSector.sector} exposure (${(maxSectorWeight * 100).toFixed(1)}%). Consider diversifying into other sectors.`);
  }
  
  // 3. Correlation risk
  let correlationScore = 80; // default good score
  let correlationRisk = 20;
  
  if (correlationMatrix && correlationMatrix.highCorrelations.length > 0) {
    const avgHighCorr = correlationMatrix.highCorrelations.reduce(
      (sum, c) => sum + Math.abs(c.correlation), 0
    ) / correlationMatrix.highCorrelations.length;
    
    correlationRisk = avgHighCorr * 100;
    correlationScore = Math.max(0, 100 - (correlationMatrix.highCorrelations.length * 15));
    
    for (const corr of correlationMatrix.highCorrelations.slice(0, 3)) {
      recommendations.push(
        `High correlation (${(corr.correlation * 100).toFixed(0)}%) between ${corr.symbol1} and ${corr.symbol2}. Consider reducing one position.`
      );
    }
  }
  
  // Overall score (weighted average)
  const score = Math.round(
    positionScore * 0.35 +
    sectorScore * 0.35 +
    correlationScore * 0.30
  );
  
  // Add general recommendations
  if (positions.length < 5) {
    recommendations.push('Portfolio has fewer than 5 positions. Consider adding more diversification.');
  }
  
  if (sectorAllocation.length < 3) {
    recommendations.push('Portfolio is concentrated in few sectors. Consider sector diversification.');
  }
  
  return {
    score,
    sectorConcentration,
    correlationRisk,
    positionConcentration,
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
  };
}
