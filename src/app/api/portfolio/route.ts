import { getAccount } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getPortfolioSummary,
  calculatePortfolioKelly,
  calculateRiskParityWeights,
  calculateSectorAllocation,
  calculateAssetClassAllocation,
  calculateRiskMetrics,
  buildCorrelationMatrix,
  generateRebalanceSuggestions,
  generateEqualWeightTargets,
  analyzeDiversification,
} from '@/lib/portfolio-optimizer';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simulated historical data for risk metrics (in production, fetch from market data API)
function generateSimulatedReturns(numDays: number = 60): number[] {
  // Simulate daily returns with slight positive drift and volatility
  const returns: number[] = [];
  for (let i = 0; i < numDays; i++) {
    // Normal distribution approximation
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // Daily return: 0.05% drift, 1.5% daily volatility
    const dailyReturn = 0.0005 + 0.015 * z;
    returns.push(dailyReturn);
  }
  return returns;
}

function generateSimulatedEquityCurve(startValue: number, numDays: number = 60): number[] {
  const curve = [startValue];
  const returns = generateSimulatedReturns(numDays);
  for (const r of returns) {
    const lastValue = curve[curve.length - 1];
    curve.push(lastValue * (1 + r));
  }
  return curve;
}

export const GET = withAuth(async function GET(_request) {
  try {
    // Get account info for cash balance
    const account = await getAccount();
    const cash = parseFloat(account.cash);

    // Get portfolio summary
    const portfolio = await getPortfolioSummary(cash);

    if (portfolio.positions.length === 0) {
      return apiSuccess({
        portfolio,
        message: 'No positions in portfolio',
      });
    }

    // Calculate sector allocation
    const sectorAllocation = calculateSectorAllocation(portfolio.positions);

    // Calculate asset class allocation
    const assetClassAllocation = calculateAssetClassAllocation(portfolio.positions);

    // Generate volatility estimates for each position
    const volatilities = new Map<string, number>();
    for (const pos of portfolio.positions) {
      // In production, fetch actual historical prices
      // For now, estimate based on sector (tech more volatile, etc.)
      let baseVol = 0.25; // 25% default
      if (pos.sector === 'Technology') baseVol = 0.35;
      if (pos.sector === 'Electric Vehicles') baseVol = 0.50;
      if (pos.sector === 'ETF - Index') baseVol = 0.18;
      if (pos.sector === 'Automotive') baseVol = 0.40;
      volatilities.set(pos.symbol, baseVol);
    }

    // Calculate risk parity weights
    const riskParityWeights = calculateRiskParityWeights(
      portfolio.positions,
      volatilities,
      portfolio.totalValue
    );

    // Calculate Kelly criterion
    const kellyAllocations = calculatePortfolioKelly(
      portfolio.positions,
      portfolio.totalValue
    );

    // Generate rebalancing suggestions (equal weight target)
    const targetWeights = generateEqualWeightTargets(
      portfolio.positions.map(p => p.symbol)
    );
    const rebalanceSuggestions = generateRebalanceSuggestions(
      portfolio.positions,
      targetWeights,
      portfolio.totalValue
    );

    // Build correlation matrix (simulated)
    const symbols = portfolio.positions.map(p => p.symbol);
    const returnSeries = new Map<string, number[]>();
    for (const sym of symbols) {
      returnSeries.set(sym, generateSimulatedReturns(60));
    }
    const correlationMatrix = buildCorrelationMatrix(symbols, returnSeries, 0.6);

    // Calculate risk metrics (simulated historical data)
    const portfolioReturns = generateSimulatedReturns(60);
    const equityCurve = generateSimulatedEquityCurve(portfolio.totalValue, 60);
    const marketReturns = generateSimulatedReturns(60); // SPY proxy

    const riskMetrics = calculateRiskMetrics(
      portfolioReturns,
      equityCurve,
      portfolio.totalValue,
      marketReturns
    );

    // Diversification analysis
    const diversification = analyzeDiversification(
      portfolio.positions,
      sectorAllocation,
      correlationMatrix
    );

    return apiSuccess({
      portfolio,
      sectorAllocation,
      assetClassAllocation,
      riskParityWeights,
      kellyAllocations,
      rebalanceSuggestions,
      correlationMatrix: {
        symbols: correlationMatrix.symbols,
        matrix: correlationMatrix.matrix.map(row =>
          row.map(v => Math.round(v * 100) / 100)
        ),
        highCorrelations: correlationMatrix.highCorrelations,
      },
      riskMetrics: {
        sharpeRatio: Math.round(riskMetrics.sharpeRatio * 100) / 100,
        sortino: Math.round(riskMetrics.sortino * 100) / 100,
        maxDrawdownPercent: Math.round(riskMetrics.maxDrawdownPercent * 100) / 100,
        maxDrawdown: Math.round(riskMetrics.maxDrawdown * 100) / 100,
        valueAtRisk: Math.round(riskMetrics.valueAtRisk * 100) / 100,
        valueAtRiskPercent: Math.round(riskMetrics.valueAtRiskPercent * 100) / 100,
        volatility: Math.round(riskMetrics.volatility * 100) / 100,
        beta: Math.round(riskMetrics.beta * 100) / 100,
        calmarRatio: Math.round(riskMetrics.calmarRatio * 100) / 100,
      },
      diversification,
    });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return apiError('Failed to analyze portfolio');
  }
});
