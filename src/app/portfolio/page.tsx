"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RiskMetricsCard,
  AllocationChart,
  CorrelationMatrix,
  RebalanceSuggestions,
  PositionSizing,
  DiversificationScore,
} from "@/components/portfolio";

interface PortfolioData {
  success: boolean;
  data: {
    portfolio: {
      totalValue: number;
      totalCostBasis: number;
      totalUnrealizedPL: number;
      totalUnrealizedPLPercent: number;
      positions: Array<{
        symbol: string;
        quantity: number;
        currentPrice: number;
        marketValue: number;
        costBasis: number;
        weight: number;
        unrealizedPL: number;
        unrealizedPLPercent: number;
        sector?: string;
        assetClass?: string;
      }>;
      cash: number;
      cashWeight: number;
    };
    sectorAllocation: Array<{
      sector: string;
      symbols: string[];
      totalValue: number;
      weight: number;
    }>;
    assetClassAllocation: Array<{
      assetClass: string;
      symbols: string[];
      totalValue: number;
      weight: number;
    }>;
    riskParityWeights: Array<{
      symbol: string;
      volatility: number;
      inverseVolWeight: number;
      targetWeight: number;
      currentWeight: number;
      adjustmentNeeded: number;
    }>;
    kellyAllocations: Array<{
      symbol: string;
      winRate: number;
      avgWin: number;
      avgLoss: number;
      kellyFraction: number;
      halfKelly: number;
      quarterKelly: number;
      recommendedAllocation: number;
    }>;
    rebalanceSuggestions: Array<{
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
    }>;
    correlationMatrix: {
      symbols: string[];
      matrix: number[][];
      highCorrelations: Array<{
        symbol1: string;
        symbol2: string;
        correlation: number;
      }>;
    };
    riskMetrics: {
      sharpeRatio: number;
      sortino: number;
      maxDrawdownPercent: number;
      maxDrawdown: number;
      valueAtRisk: number;
      valueAtRiskPercent: number;
      volatility: number;
      beta: number;
      calmarRatio: number;
    };
    diversification: {
      score: number;
      sectorConcentration: number;
      correlationRisk: number;
      positionConcentration: number;
      recommendations: string[];
    };
  };
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'sizing' | 'rebalance'>('overview');

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/portfolio');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch portfolio');
        }
        setData(result);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch portfolio:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch portfolio data');
      } finally {
        setLoading(false);
      }
    };
    fetchPortfolio();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Portfolio Optimization</h1>
        <div className="grid gap-6">
          <Card>
            <CardContent className="p-12 text-center">
              <div className="animate-pulse">Loading portfolio data...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Portfolio Optimization</h1>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-red-500">Error: {error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.data?.portfolio?.positions?.length) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Portfolio Optimization</h1>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No positions in portfolio</p>
            <p className="text-sm text-muted-foreground mt-2">
              Open some positions to see portfolio analysis
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { portfolio, sectorAllocation, assetClassAllocation, riskParityWeights, 
          kellyAllocations, rebalanceSuggestions, correlationMatrix, 
          riskMetrics, diversification } = data.data;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Portfolio Optimization</h1>
          <p className="text-muted-foreground">
            Analysis and recommendations for your {portfolio.positions.length} positions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">${portfolio.totalValue.toFixed(2)}</p>
          </div>
          <Badge 
            variant={portfolio.totalUnrealizedPL >= 0 ? 'default' : 'destructive'}
            className="text-lg px-3 py-1"
          >
            {portfolio.totalUnrealizedPL >= 0 ? '+' : ''}
            ${portfolio.totalUnrealizedPL.toFixed(2)}
            ({portfolio.totalUnrealizedPLPercent.toFixed(2)}%)
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Positions</CardDescription>
            <CardTitle className="text-2xl">{portfolio.positions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash</CardDescription>
            <CardTitle className="text-2xl">${portfolio.cash.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash Weight</CardDescription>
            <CardTitle className="text-2xl">{(portfolio.cashWeight * 100).toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sectors</CardDescription>
            <CardTitle className="text-2xl">{sectorAllocation.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Diversification</CardDescription>
            <CardTitle className="text-2xl">{diversification.score}/100</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Section Navigation */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeSection === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('overview')}
        >
          Overview & Risk
        </Button>
        <Button
          variant={activeSection === 'sizing' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('sizing')}
        >
          Position Sizing
        </Button>
        <Button
          variant={activeSection === 'rebalance' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('rebalance')}
        >
          Rebalancing
        </Button>
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Risk Metrics */}
          <RiskMetricsCard metrics={riskMetrics} />

          {/* Two column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Allocation Chart */}
            <AllocationChart 
              sectorAllocation={sectorAllocation}
              assetClassAllocation={assetClassAllocation}
            />

            {/* Diversification Score */}
            <DiversificationScore analysis={diversification} />
          </div>

          {/* Correlation Matrix */}
          <CorrelationMatrix data={correlationMatrix} />

          {/* Holdings Table */}
          <Card>
            <CardHeader>
              <CardTitle>Current Holdings</CardTitle>
              <CardDescription>Position breakdown with sector classification</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-left p-2">Sector</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Value</th>
                      <th className="text-right p-2">Weight</th>
                      <th className="text-right p-2">P&L</th>
                      <th className="text-right p-2">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.map((pos, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono font-bold">{pos.symbol}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">
                            {pos.sector}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">{pos.quantity}</td>
                        <td className="p-2 text-right">${pos.currentPrice.toFixed(2)}</td>
                        <td className="p-2 text-right">${pos.marketValue.toFixed(2)}</td>
                        <td className="p-2 text-right">{(pos.weight * 100).toFixed(1)}%</td>
                        <td className={`p-2 text-right ${pos.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL.toFixed(2)}
                        </td>
                        <td className={`p-2 text-right ${pos.unrealizedPLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {pos.unrealizedPLPercent >= 0 ? '+' : ''}{pos.unrealizedPLPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Position Sizing Section */}
      {activeSection === 'sizing' && (
        <div className="space-y-6">
          <PositionSizing 
            kellyAllocations={kellyAllocations}
            riskParityWeights={riskParityWeights}
            portfolioValue={portfolio.totalValue}
          />

          <Card>
            <CardHeader>
              <CardTitle>Position Sizing Guide</CardTitle>
              <CardDescription>Understanding the algorithms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Kelly Criterion</h4>
                  <p className="text-sm text-muted-foreground">
                    The Kelly Criterion calculates the optimal position size to maximize 
                    long-term growth based on your win rate and average win/loss ratio.
                  </p>
                  <ul className="mt-2 text-sm space-y-1">
                    <li>• <strong>Full Kelly:</strong> Maximum growth, high volatility</li>
                    <li>• <strong>Half Kelly:</strong> Good balance of growth and stability (recommended)</li>
                    <li>• <strong>Quarter Kelly:</strong> Conservative, lower drawdowns</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Risk Parity</h4>
                  <p className="text-sm text-muted-foreground">
                    Risk parity allocates capital inversely proportional to each asset&apos;s 
                    volatility, ensuring each position contributes equal risk.
                  </p>
                  <ul className="mt-2 text-sm space-y-1">
                    <li>• Lower volatility assets get higher allocations</li>
                    <li>• Higher volatility assets get lower allocations</li>
                    <li>• Results in more stable portfolio returns</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rebalancing Section */}
      {activeSection === 'rebalance' && (
        <div className="space-y-6">
          <RebalanceSuggestions 
            suggestions={rebalanceSuggestions}
            portfolioValue={portfolio.totalValue}
          />

          <Card>
            <CardHeader>
              <CardTitle>Rebalancing Strategy</CardTitle>
              <CardDescription>Best practices for portfolio maintenance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium">Calendar Rebalancing</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Rebalance on a fixed schedule (monthly, quarterly). Simple but may 
                    miss significant drift between periods.
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium">Threshold Rebalancing</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Rebalance when any position drifts beyond a threshold (5-10% from target). 
                    More responsive to market moves.
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium">Tax-Aware Rebalancing</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Consider tax implications. Use new cash contributions or harvest losses 
                    to rebalance tax-efficiently.
                  </p>
                </div>
              </div>

              <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Current suggestions use equal-weight targets. 
                  In a future update, you&apos;ll be able to customize target allocations based on 
                  your strategy (momentum, value, or risk parity weighted).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
