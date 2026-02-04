/**
 * Tests for Portfolio Optimizer Module
 * 
 * Tests position sizing algorithms, risk metrics, correlation analysis,
 * and rebalancing recommendations.
 */

// Mock alpaca module before importing portfolio-optimizer
jest.mock('@/lib/alpaca', () => ({
  getPositions: jest.fn(),
  AlpacaPosition: {},
}));

import {
  calculateKellyCriterion,
  calculatePortfolioKelly,
  calculateRiskParityWeights,
  estimateVolatility,
  buildCorrelationMatrix,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateVaR,
  calculateCalmarRatio,
  calculateRiskMetrics,
  generateRebalanceSuggestions,
  generateEqualWeightTargets,
  calculateSectorAllocation,
  calculateAssetClassAllocation,
  analyzeDiversification,
  PortfolioPosition,
  SectorAllocation,
} from '@/lib/portfolio-optimizer';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockPosition = (
  symbol: string,
  quantity: number,
  currentPrice: number,
  costBasis: number,
  weight: number = 0,
  sector?: string,
  assetClass?: string
): PortfolioPosition => ({
  symbol,
  quantity,
  currentPrice,
  marketValue: quantity * currentPrice,
  costBasis,
  weight,
  unrealizedPL: quantity * currentPrice - costBasis,
  unrealizedPLPercent: costBasis > 0 ? ((quantity * currentPrice - costBasis) / costBasis) * 100 : 0,
  sector,
  assetClass,
});

const createMockPositions = (): PortfolioPosition[] => [
  createMockPosition('AAPL', 10, 150, 1400, 0.3, 'Technology', 'Individual Stock'),
  createMockPosition('MSFT', 5, 300, 1400, 0.3, 'Technology', 'Individual Stock'),
  createMockPosition('GOOGL', 2, 140, 270, 0.056, 'Technology', 'Individual Stock'),
  createMockPosition('JPM', 10, 150, 1400, 0.3, 'Financial', 'Individual Stock'),
  createMockPosition('SPY', 2, 450, 880, 0.018, 'ETF - Index', 'Index ETF'),
];

// =============================================================================
// KELLY CRITERION TESTS
// =============================================================================

describe('calculateKellyCriterion', () => {
  it('should return conservative estimate with insufficient trade history', () => {
    const trades = [
      { symbol: 'AAPL', profit: 100, returnPct: 5 },
      { symbol: 'AAPL', profit: -50, returnPct: -2.5 },
    ];
    
    const result = calculateKellyCriterion('AAPL', trades, 10000);
    
    expect(result.symbol).toBe('AAPL');
    expect(result.winRate).toBe(0.5);
    expect(result.kellyFraction).toBe(0.05);
    expect(result.halfKelly).toBe(0.025);
    expect(result.quarterKelly).toBe(0.0125);
    expect(result.recommendedAllocation).toBe(250); // 10000 * 0.025
  });

  it('should calculate Kelly criterion correctly with sufficient history', () => {
    const trades = [
      { symbol: 'AAPL', profit: 100, returnPct: 5 },
      { symbol: 'AAPL', profit: 150, returnPct: 7.5 },
      { symbol: 'AAPL', profit: 80, returnPct: 4 },
      { symbol: 'AAPL', profit: -50, returnPct: -2.5 },
      { symbol: 'AAPL', profit: 120, returnPct: 6 },
      { symbol: 'AAPL', profit: -30, returnPct: -1.5 },
    ];
    
    const result = calculateKellyCriterion('AAPL', trades, 10000);
    
    expect(result.symbol).toBe('AAPL');
    expect(result.winRate).toBeCloseTo(0.667, 2); // 4 wins / 6 trades
    expect(result.avgWin).toBeCloseTo(5.625, 2); // (5 + 7.5 + 4 + 6) / 4
    expect(result.avgLoss).toBeCloseTo(2, 2); // (2.5 + 1.5) / 2
    expect(result.kellyFraction).toBeGreaterThan(0);
    expect(result.kellyFraction).toBeLessThanOrEqual(0.25); // capped
  });

  it('should handle all wins', () => {
    const trades = [
      { symbol: 'AAPL', profit: 100, returnPct: 5 },
      { symbol: 'AAPL', profit: 150, returnPct: 7.5 },
      { symbol: 'AAPL', profit: 80, returnPct: 4 },
      { symbol: 'AAPL', profit: 120, returnPct: 6 },
      { symbol: 'AAPL', profit: 90, returnPct: 4.5 },
    ];
    
    const result = calculateKellyCriterion('AAPL', trades, 10000);
    
    expect(result.winRate).toBe(1);
    expect(result.kellyFraction).toBeGreaterThan(0);
  });

  it('should filter trades by symbol', () => {
    const trades = [
      { symbol: 'AAPL', profit: 100, returnPct: 5 },
      { symbol: 'MSFT', profit: 200, returnPct: 10 },
      { symbol: 'AAPL', profit: -50, returnPct: -2.5 },
      { symbol: 'GOOGL', profit: 150, returnPct: 7.5 },
    ];
    
    const result = calculateKellyCriterion('AAPL', trades, 10000);
    
    // Only 2 AAPL trades, so insufficient history
    expect(result.kellyFraction).toBe(0.05);
  });
});

describe('calculatePortfolioKelly', () => {
  it('should calculate Kelly for all positions', () => {
    const positions = createMockPositions();
    const portfolioValue = 5000;
    
    const results = calculatePortfolioKelly(positions, portfolioValue, 0.55, 1.5);
    
    expect(results).toHaveLength(positions.length);
    results.forEach(result => {
      expect(result.winRate).toBe(0.55);
      expect(result.kellyFraction).toBeGreaterThan(0);
      expect(result.kellyFraction).toBeLessThanOrEqual(0.25);
      expect(result.halfKelly).toBe(result.kellyFraction / 2);
      expect(result.quarterKelly).toBe(result.kellyFraction / 4);
    });
  });

  it('should handle empty positions', () => {
    const results = calculatePortfolioKelly([], 5000);
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// RISK PARITY TESTS
// =============================================================================

describe('calculateRiskParityWeights', () => {
  it('should calculate inverse volatility weights', () => {
    const positions = createMockPositions();
    const volatilities = new Map([
      ['AAPL', 0.25],
      ['MSFT', 0.20],
      ['GOOGL', 0.30],
      ['JPM', 0.22],
      ['SPY', 0.15],
    ]);
    
    const results = calculateRiskParityWeights(positions, volatilities, 5000);
    
    expect(results).toHaveLength(positions.length);
    
    // SPY has lowest volatility, should have highest target weight
    const spyResult = results.find(r => r.symbol === 'SPY');
    const googlResult = results.find(r => r.symbol === 'GOOGL');
    
    expect(spyResult!.targetWeight).toBeGreaterThan(googlResult!.targetWeight);
    
    // Sum of target weights should equal 1
    const totalWeight = results.reduce((sum, r) => sum + r.targetWeight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it('should use default volatility when not provided', () => {
    const positions = [createMockPosition('UNKNOWN', 10, 100, 950, 1)];
    const volatilities = new Map<string, number>();
    
    const results = calculateRiskParityWeights(positions, volatilities, 1000);
    
    expect(results[0].volatility).toBe(0.20); // default
  });

  it('should calculate adjustment needed', () => {
    const positions = [
      createMockPosition('AAPL', 10, 100, 950, 0.6, 'Technology'),
      createMockPosition('MSFT', 5, 80, 380, 0.4, 'Technology'),
    ];
    const volatilities = new Map([
      ['AAPL', 0.25],
      ['MSFT', 0.25],
    ]);
    
    const results = calculateRiskParityWeights(positions, volatilities, 1400);
    
    // With equal volatility, target weights should be equal (0.5 each)
    expect(results[0].targetWeight).toBeCloseTo(0.5, 5);
    expect(results[1].targetWeight).toBeCloseTo(0.5, 5);
    expect(results[0].adjustmentNeeded).toBeCloseTo(-0.1, 5); // 0.5 - 0.6
    expect(results[1].adjustmentNeeded).toBeCloseTo(0.1, 5); // 0.5 - 0.4
  });
});

describe('estimateVolatility', () => {
  it('should calculate annualized volatility from price data', () => {
    // Simulate prices with known daily returns
    const prices = [100];
    for (let i = 1; i < 100; i++) {
      // Random walk with ~1% daily moves
      prices.push(prices[i - 1] * (1 + (Math.random() - 0.5) * 0.02));
    }
    
    const vol = estimateVolatility(prices);
    
    // Should be reasonable volatility (between 5% and 50%)
    expect(vol).toBeGreaterThan(0.05);
    expect(vol).toBeLessThan(0.50);
  });

  it('should return default with insufficient data', () => {
    expect(estimateVolatility([])).toBe(0.20);
    expect(estimateVolatility([100])).toBe(0.20);
  });

  it('should handle flat prices', () => {
    const prices = Array(50).fill(100);
    const vol = estimateVolatility(prices);
    
    expect(vol).toBe(0); // No variance
  });

  it('should handle prices with zero', () => {
    const prices = [100, 0, 100];
    const vol = estimateVolatility(prices);
    
    // Should handle gracefully
    expect(typeof vol).toBe('number');
    expect(isNaN(vol)).toBe(false);
  });
});

// =============================================================================
// CORRELATION TESTS
// =============================================================================

describe('buildCorrelationMatrix', () => {
  it('should build correlation matrix for symbols', () => {
    const symbols = ['AAPL', 'MSFT', 'GOOGL'];
    const returnSeries = new Map<string, number[]>();
    
    // Create correlated returns (AAPL and MSFT highly correlated)
    const baseReturns = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.02);
    returnSeries.set('AAPL', baseReturns.map(r => r + (Math.random() - 0.5) * 0.005));
    returnSeries.set('MSFT', baseReturns.map(r => r + (Math.random() - 0.5) * 0.005));
    returnSeries.set('GOOGL', Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.02)); // independent
    
    const result = buildCorrelationMatrix(symbols, returnSeries, 0.5);
    
    expect(result.symbols).toEqual(symbols);
    expect(result.matrix).toHaveLength(3);
    expect(result.matrix[0]).toHaveLength(3);
    
    // Diagonal should be 1
    expect(result.matrix[0][0]).toBe(1);
    expect(result.matrix[1][1]).toBe(1);
    expect(result.matrix[2][2]).toBe(1);
    
    // Matrix should be symmetric
    expect(result.matrix[0][1]).toBe(result.matrix[1][0]);
    expect(result.matrix[0][2]).toBe(result.matrix[2][0]);
  });

  it('should identify high correlations', () => {
    const symbols = ['A', 'B'];
    const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
    const returnSeries = new Map<string, number[]>();
    returnSeries.set('A', returns);
    returnSeries.set('B', returns); // Identical returns = perfect correlation
    
    const result = buildCorrelationMatrix(symbols, returnSeries, 0.7);
    
    expect(result.highCorrelations).toHaveLength(1);
    expect(result.highCorrelations[0].correlation).toBeCloseTo(1, 5);
    expect(result.highCorrelations[0].symbol1).toBe('A');
    expect(result.highCorrelations[0].symbol2).toBe('B');
  });

  it('should handle empty return series', () => {
    const symbols = ['A', 'B'];
    const returnSeries = new Map<string, number[]>();
    
    const result = buildCorrelationMatrix(symbols, returnSeries);
    
    expect(result.matrix[0][1]).toBe(0);
  });

  it('should handle single symbol', () => {
    const symbols = ['A'];
    const returnSeries = new Map([['A', [0.01, -0.02, 0.015]]]);
    
    const result = buildCorrelationMatrix(symbols, returnSeries);
    
    expect(result.matrix).toHaveLength(1);
    expect(result.matrix[0][0]).toBe(1);
    expect(result.highCorrelations).toHaveLength(0);
  });
});

// =============================================================================
// RISK METRICS TESTS
// =============================================================================

describe('calculateSharpeRatio', () => {
  it('should calculate Sharpe ratio correctly', () => {
    // Generate positive returns
    const returns = Array.from({ length: 252 }, () => 0.001 + Math.random() * 0.002); // ~0.1-0.3% daily
    
    const sharpe = calculateSharpeRatio(returns, 0.05);
    
    // Should be positive given positive returns
    expect(sharpe).toBeGreaterThan(0);
  });

  it('should return 0 with insufficient data', () => {
    expect(calculateSharpeRatio([])).toBe(0);
    expect(calculateSharpeRatio([0.01])).toBe(0);
  });

  it('should handle zero volatility', () => {
    const returns = Array(100).fill(0.001); // Constant returns
    const sharpe = calculateSharpeRatio(returns);
    
    // Zero standard deviation leads to division by zero
    // Returns > risk-free rate means Sharpe approaches positive infinity
    expect(sharpe).toBeGreaterThan(1000000);
  });

  it('should return negative Sharpe for underperforming portfolio', () => {
    const returns = Array.from({ length: 252 }, () => -0.001 + Math.random() * 0.0005); // negative bias
    const sharpe = calculateSharpeRatio(returns, 0.05);
    
    expect(sharpe).toBeLessThan(0);
  });
});

describe('calculateSortinoRatio', () => {
  it('should calculate Sortino ratio correctly', () => {
    const returns = Array.from({ length: 100 }, () => 0.002 + (Math.random() - 0.3) * 0.01);
    
    const sortino = calculateSortinoRatio(returns, 0.05);
    
    // Should be positive with mostly positive returns
    expect(sortino).toBeGreaterThan(0);
  });

  it('should return high value with no downside', () => {
    const returns = Array.from({ length: 50 }, () => Math.random() * 0.01); // all positive
    
    const sortino = calculateSortinoRatio(returns);
    
    expect(sortino).toBe(10); // max value when no losses
  });

  it('should handle all negative returns', () => {
    const returns = Array.from({ length: 50 }, () => -Math.random() * 0.01);
    
    const sortino = calculateSortinoRatio(returns);
    
    expect(sortino).toBeLessThan(0);
  });
});

describe('calculateMaxDrawdown', () => {
  it('should calculate max drawdown correctly', () => {
    const equityCurve = [100, 110, 105, 120, 90, 95, 100, 115];
    
    const result = calculateMaxDrawdown(equityCurve);
    
    // Max drawdown from 120 to 90 = 30, or 25%
    expect(result.maxDrawdown).toBe(30);
    expect(result.maxDrawdownPercent).toBe(25);
  });

  it('should handle monotonically increasing curve', () => {
    const equityCurve = [100, 110, 120, 130, 140];
    
    const result = calculateMaxDrawdown(equityCurve);
    
    expect(result.maxDrawdown).toBe(0);
    expect(result.maxDrawdownPercent).toBe(0);
  });

  it('should handle insufficient data', () => {
    expect(calculateMaxDrawdown([]).maxDrawdown).toBe(0);
    expect(calculateMaxDrawdown([100]).maxDrawdown).toBe(0);
  });

  it('should track from highest peak', () => {
    const equityCurve = [100, 150, 120, 180, 140];
    
    const result = calculateMaxDrawdown(equityCurve);
    
    // Max drawdown from 180 to 140 = 40, or ~22.2%
    expect(result.maxDrawdown).toBe(40);
    expect(result.maxDrawdownPercent).toBeCloseTo(22.22, 1);
  });
});

describe('calculateVaR', () => {
  it('should calculate 95% VaR correctly', () => {
    const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
    const portfolioValue = 10000;
    
    const result = calculateVaR(returns, portfolioValue, 0.95);
    
    expect(result.valueAtRisk).toBeGreaterThan(0);
    expect(result.valueAtRiskPercent).toBeGreaterThan(0);
    expect(result.valueAtRiskPercent).toBeLessThan(10); // reasonable bound
  });

  it('should return default VaR with insufficient data', () => {
    const result = calculateVaR([0.01, 0.02, -0.01], 10000);
    
    expect(result.valueAtRisk).toBe(200); // 2% of 10000
    expect(result.valueAtRiskPercent).toBe(2);
  });

  it('should scale VaR for holding period', () => {
    const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
    const portfolioValue = 10000;
    
    const var1Day = calculateVaR(returns, portfolioValue, 0.95, 1);
    const var5Day = calculateVaR(returns, portfolioValue, 0.95, 5);
    
    // 5-day VaR should be larger (sqrt(5) times 1-day)
    expect(var5Day.valueAtRisk).toBeGreaterThan(var1Day.valueAtRisk);
  });
});

describe('calculateCalmarRatio', () => {
  it('should calculate Calmar ratio correctly', () => {
    const ratio = calculateCalmarRatio(0.15, 10); // 15% return, 10% max drawdown
    
    expect(ratio).toBe(0.015); // 0.15 / 10
  });

  it('should handle zero drawdown', () => {
    const ratio = calculateCalmarRatio(0.15, 0);
    
    expect(ratio).toBe(0);
  });

  it('should handle negative return', () => {
    const ratio = calculateCalmarRatio(-0.05, 10);
    
    expect(ratio).toBe(-0.005);
  });
});

describe('calculateRiskMetrics', () => {
  it('should calculate comprehensive risk metrics', () => {
    const dailyReturns = Array.from({ length: 252 }, () => 0.0005 + (Math.random() - 0.5) * 0.02);
    const equityCurve: number[] = [10000];
    for (let i = 0; i < dailyReturns.length; i++) {
      equityCurve.push(equityCurve[i] * (1 + dailyReturns[i]));
    }
    
    const metrics = calculateRiskMetrics(dailyReturns, equityCurve, 10000);
    
    expect(typeof metrics.sharpeRatio).toBe('number');
    expect(typeof metrics.maxDrawdown).toBe('number');
    expect(typeof metrics.maxDrawdownPercent).toBe('number');
    expect(typeof metrics.valueAtRisk).toBe('number');
    expect(typeof metrics.volatility).toBe('number');
    expect(typeof metrics.beta).toBe('number');
    expect(typeof metrics.sortino).toBe('number');
    expect(typeof metrics.calmarRatio).toBe('number');
    
    expect(metrics.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.volatility).toBeGreaterThanOrEqual(0);
  });

  it('should calculate beta with market returns', () => {
    const dailyReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
    const marketReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.015);
    const equityCurve = [10000, 10100, 10050, 10200];
    
    const metrics = calculateRiskMetrics(dailyReturns, equityCurve, 10000, marketReturns);
    
    expect(typeof metrics.beta).toBe('number');
  });

  it('should handle empty returns', () => {
    const metrics = calculateRiskMetrics([], [10000], 10000);
    
    expect(metrics.sharpeRatio).toBe(0);
    expect(metrics.volatility).toBe(0);
  });
});

// =============================================================================
// REBALANCING TESTS
// =============================================================================

describe('generateRebalanceSuggestions', () => {
  it('should generate rebalancing suggestions', () => {
    const positions = [
      createMockPosition('AAPL', 10, 100, 950, 0.4, 'Technology'),
      createMockPosition('MSFT', 5, 100, 480, 0.2, 'Technology'),
      createMockPosition('SPY', 5, 200, 980, 0.4, 'ETF - Index'),
    ];
    const targetWeights = new Map([
      ['AAPL', 0.33],
      ['MSFT', 0.33],
      ['SPY', 0.34],
    ]);
    const portfolioValue = 2500;
    
    const suggestions = generateRebalanceSuggestions(positions, targetWeights, portfolioValue, 5);
    
    expect(suggestions).toHaveLength(3);
    suggestions.forEach(s => {
      expect(['buy', 'sell', 'hold']).toContain(s.action);
      expect(['high', 'medium', 'low']).toContain(s.priority);
      expect(s.reason).toBeDefined();
    });
  });

  it('should suggest buy when underweight', () => {
    const positions = [createMockPosition('AAPL', 5, 100, 450, 0.2, 'Technology')];
    const targetWeights = new Map([['AAPL', 0.35]]);
    
    const suggestions = generateRebalanceSuggestions(positions, targetWeights, 2500, 5);
    
    expect(suggestions[0].action).toBe('buy');
    expect(suggestions[0].dollarChange).toBeGreaterThan(0);
  });

  it('should suggest sell when overweight', () => {
    const positions = [createMockPosition('AAPL', 10, 100, 950, 0.5, 'Technology')];
    const targetWeights = new Map([['AAPL', 0.30]]);
    
    const suggestions = generateRebalanceSuggestions(positions, targetWeights, 2000, 5);
    
    expect(suggestions[0].action).toBe('sell');
    expect(suggestions[0].dollarChange).toBeLessThan(0);
  });

  it('should suggest hold when within tolerance', () => {
    const positions = [createMockPosition('AAPL', 10, 100, 950, 0.32, 'Technology')];
    const targetWeights = new Map([['AAPL', 0.33]]);
    
    const suggestions = generateRebalanceSuggestions(positions, targetWeights, 3125, 5);
    
    expect(suggestions[0].action).toBe('hold');
  });

  it('should sort by priority and dollar change', () => {
    const positions = [
      createMockPosition('AAPL', 10, 100, 950, 0.5, 'Technology'), // very overweight
      createMockPosition('MSFT', 5, 100, 480, 0.25, 'Technology'), // slightly underweight
      createMockPosition('GOOGL', 2, 100, 190, 0.1, 'Technology'), // very underweight
    ];
    const targetWeights = new Map([
      ['AAPL', 0.33],
      ['MSFT', 0.33],
      ['GOOGL', 0.34],
    ]);
    
    const suggestions = generateRebalanceSuggestions(positions, targetWeights, 2000, 5);
    
    // High priority items should come first
    const highPriorityIndices = suggestions
      .map((s, i) => s.priority === 'high' ? i : -1)
      .filter(i => i >= 0);
    const mediumPriorityIndices = suggestions
      .map((s, i) => s.priority === 'medium' ? i : -1)
      .filter(i => i >= 0);
    
    if (highPriorityIndices.length > 0 && mediumPriorityIndices.length > 0) {
      expect(Math.max(...highPriorityIndices)).toBeLessThan(Math.min(...mediumPriorityIndices));
    }
  });
});

describe('generateEqualWeightTargets', () => {
  it('should generate equal weights', () => {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN'];
    
    const targets = generateEqualWeightTargets(symbols);
    
    expect(targets.size).toBe(4);
    for (const weight of targets.values()) {
      expect(weight).toBe(0.25);
    }
  });

  it('should handle single symbol', () => {
    const targets = generateEqualWeightTargets(['AAPL']);
    
    expect(targets.get('AAPL')).toBe(1);
  });

  it('should handle empty array', () => {
    const targets = generateEqualWeightTargets([]);
    
    expect(targets.size).toBe(0);
  });
});

// =============================================================================
// SECTOR & ASSET CLASS ALLOCATION TESTS
// =============================================================================

describe('calculateSectorAllocation', () => {
  it('should calculate sector allocation breakdown', () => {
    const positions = createMockPositions();
    
    const allocations = calculateSectorAllocation(positions);
    
    expect(allocations.length).toBeGreaterThan(0);
    
    // Check Technology sector
    const tech = allocations.find(a => a.sector === 'Technology');
    expect(tech).toBeDefined();
    expect(tech!.symbols).toContain('AAPL');
    expect(tech!.symbols).toContain('MSFT');
    expect(tech!.symbols).toContain('GOOGL');
    
    // Check weights sum to 1
    const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it('should sort by weight descending', () => {
    const positions = createMockPositions();
    
    const allocations = calculateSectorAllocation(positions);
    
    for (let i = 1; i < allocations.length; i++) {
      expect(allocations[i - 1].weight).toBeGreaterThanOrEqual(allocations[i].weight);
    }
  });

  it('should handle empty positions', () => {
    const allocations = calculateSectorAllocation([]);
    
    expect(allocations).toHaveLength(0);
  });

  it('should group unknown sectors as Other', () => {
    const positions = [createMockPosition('UNKNOWN', 10, 100, 950, 1)];
    
    const allocations = calculateSectorAllocation(positions);
    
    expect(allocations[0].sector).toBe('Other');
  });
});

describe('calculateAssetClassAllocation', () => {
  it('should calculate asset class allocation', () => {
    const positions = createMockPositions();
    
    const allocations = calculateAssetClassAllocation(positions);
    
    expect(allocations.length).toBeGreaterThan(0);
    
    // Check for Index ETF class (SPY)
    const etfClass = allocations.find(a => a.assetClass === 'Index ETF');
    expect(etfClass).toBeDefined();
    expect(etfClass!.symbols).toContain('SPY');
  });

  it('should handle positions without asset class', () => {
    const positions = [createMockPosition('XYZ', 10, 100, 950, 1)];
    
    const allocations = calculateAssetClassAllocation(positions);
    
    expect(allocations[0].assetClass).toBe('Individual Stock');
  });
});

// =============================================================================
// DIVERSIFICATION ANALYSIS TESTS
// =============================================================================

describe('analyzeDiversification', () => {
  it('should calculate diversification score', () => {
    const positions = createMockPositions();
    const sectorAllocations = calculateSectorAllocation(positions);
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(100);
    expect(typeof analysis.sectorConcentration).toBe('number');
    expect(typeof analysis.positionConcentration).toBe('number');
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });

  it('should flag high position concentration', () => {
    // Single position portfolio
    const positions = [createMockPosition('AAPL', 100, 150, 14000, 1, 'Technology')];
    const sectorAllocations = calculateSectorAllocation(positions);
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    expect(analysis.positionConcentration).toBe(100); // 100% in one position
    expect(analysis.recommendations.some(r => r.includes('concentration'))).toBe(true);
  });

  it('should flag high sector concentration', () => {
    // All tech portfolio
    const positions = [
      createMockPosition('AAPL', 10, 150, 1400, 0.33, 'Technology'),
      createMockPosition('MSFT', 5, 300, 1400, 0.33, 'Technology'),
      createMockPosition('GOOGL', 10, 140, 1300, 0.34, 'Technology'),
    ];
    const sectorAllocations: SectorAllocation[] = [{
      sector: 'Technology',
      symbols: ['AAPL', 'MSFT', 'GOOGL'],
      totalValue: 4500,
      weight: 1,
    }];
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    expect(analysis.sectorConcentration).toBe(100);
    expect(analysis.recommendations.some(r => r.includes('Technology'))).toBe(true);
  });

  it('should flag high correlations when matrix provided', () => {
    const positions = createMockPositions();
    const sectorAllocations = calculateSectorAllocation(positions);
    const correlationMatrix = {
      symbols: ['AAPL', 'MSFT'],
      matrix: [[1, 0.9], [0.9, 1]],
      highCorrelations: [{ symbol1: 'AAPL', symbol2: 'MSFT', correlation: 0.9 }],
    };
    
    const analysis = analyzeDiversification(positions, sectorAllocations, correlationMatrix);
    
    expect(analysis.correlationRisk).toBeGreaterThan(0);
    expect(analysis.recommendations.some(r => r.includes('correlation'))).toBe(true);
  });

  it('should recommend more positions for small portfolios', () => {
    const positions = [
      createMockPosition('AAPL', 10, 150, 1400, 0.5, 'Technology'),
      createMockPosition('MSFT', 5, 300, 1400, 0.5, 'Technology'),
    ];
    const sectorAllocations = calculateSectorAllocation(positions);
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    expect(analysis.recommendations.some(r => r.includes('fewer than 5'))).toBe(true);
  });

  it('should recommend sector diversification when few sectors', () => {
    const positions = [
      createMockPosition('AAPL', 10, 150, 1400, 0.5, 'Technology'),
      createMockPosition('MSFT', 5, 300, 1400, 0.5, 'Technology'),
    ];
    const sectorAllocations: SectorAllocation[] = [{
      sector: 'Technology',
      symbols: ['AAPL', 'MSFT'],
      totalValue: 3000,
      weight: 1,
    }];
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    expect(analysis.recommendations.some(r => r.includes('sector diversification'))).toBe(true);
  });

  it('should give high score for well-diversified portfolio', () => {
    // Diversified portfolio across sectors
    const positions = [
      createMockPosition('AAPL', 5, 150, 700, 0.15, 'Technology'),
      createMockPosition('JPM', 5, 150, 700, 0.15, 'Financial'),
      createMockPosition('JNJ', 5, 150, 700, 0.15, 'Healthcare'),
      createMockPosition('XOM', 5, 150, 700, 0.15, 'Energy'),
      createMockPosition('AMZN', 5, 150, 700, 0.15, 'Consumer Discretionary'),
      createMockPosition('SPY', 5, 150, 700, 0.25, 'ETF - Index'),
    ];
    const sectorAllocations: SectorAllocation[] = [
      { sector: 'ETF - Index', symbols: ['SPY'], totalValue: 750, weight: 0.25 },
      { sector: 'Technology', symbols: ['AAPL'], totalValue: 750, weight: 0.15 },
      { sector: 'Financial', symbols: ['JPM'], totalValue: 750, weight: 0.15 },
      { sector: 'Healthcare', symbols: ['JNJ'], totalValue: 750, weight: 0.15 },
      { sector: 'Energy', symbols: ['XOM'], totalValue: 750, weight: 0.15 },
      { sector: 'Consumer Discretionary', symbols: ['AMZN'], totalValue: 750, weight: 0.15 },
    ];
    
    const analysis = analyzeDiversification(positions, sectorAllocations);
    
    // Should have high score for good diversification
    expect(analysis.score).toBeGreaterThan(50);
  });

  it('should limit recommendations to 5', () => {
    // Create scenario with many issues
    const positions = [createMockPosition('AAPL', 100, 150, 14000, 1, 'Technology')];
    const sectorAllocations: SectorAllocation[] = [{
      sector: 'Technology',
      symbols: ['AAPL'],
      totalValue: 15000,
      weight: 1,
    }];
    const correlationMatrix = {
      symbols: ['A', 'B', 'C', 'D', 'E', 'F'],
      matrix: [],
      highCorrelations: [
        { symbol1: 'A', symbol2: 'B', correlation: 0.9 },
        { symbol1: 'C', symbol2: 'D', correlation: 0.85 },
        { symbol1: 'E', symbol2: 'F', correlation: 0.8 },
      ],
    };
    
    const analysis = analyzeDiversification(positions, sectorAllocations, correlationMatrix);
    
    expect(analysis.recommendations.length).toBeLessThanOrEqual(5);
  });
});
