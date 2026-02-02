"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RiskMetrics {
  sharpeRatio: number;
  sortino: number;
  maxDrawdownPercent: number;
  maxDrawdown: number;
  valueAtRisk: number;
  valueAtRiskPercent: number;
  volatility: number;
  beta: number;
  calmarRatio: number;
}

interface RiskMetricsCardProps {
  metrics: RiskMetrics;
  loading?: boolean;
}

function getMetricColor(metric: string, value: number): string {
  switch (metric) {
    case 'sharpe':
    case 'sortino':
      if (value >= 2) return 'text-green-600';
      if (value >= 1) return 'text-yellow-600';
      return 'text-red-600';
    case 'maxDrawdown':
      if (value <= 5) return 'text-green-600';
      if (value <= 15) return 'text-yellow-600';
      return 'text-red-600';
    case 'var':
      if (value <= 2) return 'text-green-600';
      if (value <= 5) return 'text-yellow-600';
      return 'text-red-600';
    case 'volatility':
      if (value <= 15) return 'text-green-600';
      if (value <= 30) return 'text-yellow-600';
      return 'text-red-600';
    case 'beta':
      if (value >= 0.8 && value <= 1.2) return 'text-green-600';
      if (value >= 0.5 && value <= 1.5) return 'text-yellow-600';
      return 'text-red-600';
    default:
      return 'text-foreground';
  }
}

function getMetricBadge(metric: string, value: number): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (metric) {
    case 'sharpe':
      if (value >= 2) return { label: 'Excellent', variant: 'default' };
      if (value >= 1) return { label: 'Good', variant: 'secondary' };
      if (value >= 0) return { label: 'Poor', variant: 'destructive' };
      return { label: 'Negative', variant: 'destructive' };
    case 'var':
      if (value <= 2) return { label: 'Low Risk', variant: 'default' };
      if (value <= 5) return { label: 'Moderate', variant: 'secondary' };
      return { label: 'High Risk', variant: 'destructive' };
    default:
      return { label: '', variant: 'outline' };
  }
}

export function RiskMetricsCard({ metrics, loading }: RiskMetricsCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Metrics</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sharpeBadge = getMetricBadge('sharpe', metrics.sharpeRatio);
  const varBadge = getMetricBadge('var', metrics.valueAtRiskPercent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Risk Metrics Dashboard
          <Badge variant={sharpeBadge.variant}>{sharpeBadge.label}</Badge>
        </CardTitle>
        <CardDescription>Portfolio risk and performance metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Sharpe Ratio */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sharpe Ratio</p>
            <p className={`text-2xl font-bold ${getMetricColor('sharpe', metrics.sharpeRatio)}`}>
              {metrics.sharpeRatio.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Risk-adjusted return
            </p>
          </div>

          {/* Sortino Ratio */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sortino Ratio</p>
            <p className={`text-2xl font-bold ${getMetricColor('sortino', metrics.sortino)}`}>
              {metrics.sortino.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Downside-adjusted
            </p>
          </div>

          {/* Max Drawdown */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Max Drawdown</p>
            <p className={`text-2xl font-bold ${getMetricColor('maxDrawdown', metrics.maxDrawdownPercent)}`}>
              -{metrics.maxDrawdownPercent.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ${metrics.maxDrawdown.toFixed(2)}
            </p>
          </div>

          {/* Value at Risk */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">VaR (95%)</p>
            <p className={`text-2xl font-bold ${getMetricColor('var', metrics.valueAtRiskPercent)}`}>
              {metrics.valueAtRiskPercent.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ${metrics.valueAtRisk.toFixed(2)} daily risk
            </p>
          </div>

          {/* Volatility */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Volatility</p>
            <p className={`text-2xl font-bold ${getMetricColor('volatility', metrics.volatility)}`}>
              {metrics.volatility.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Annualized
            </p>
          </div>

          {/* Beta */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Beta</p>
            <p className={`text-2xl font-bold ${getMetricColor('beta', metrics.beta)}`}>
              {metrics.beta.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Market sensitivity
            </p>
          </div>

          {/* Calmar Ratio */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Calmar Ratio</p>
            <p className={`text-2xl font-bold ${getMetricColor('sharpe', metrics.calmarRatio)}`}>
              {metrics.calmarRatio.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Return / Drawdown
            </p>
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="mt-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Daily Value at Risk (95% confidence)</p>
              <p className="text-sm text-muted-foreground">
                Based on historical volatility, there&apos;s a 5% chance of losing more than 
                ${metrics.valueAtRisk.toFixed(2)} ({metrics.valueAtRiskPercent.toFixed(2)}%) in a single day.
              </p>
            </div>
            <Badge variant={varBadge.variant}>{varBadge.label}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
