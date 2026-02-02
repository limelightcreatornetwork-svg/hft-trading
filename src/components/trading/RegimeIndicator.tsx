"use client";

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RegimeType = 'CHOP' | 'TREND' | 'VOL_EXPANSION' | 'UNTRADEABLE';

interface RegimeMetrics {
  atr: number;
  atrPercent: number;
  volatility: number;
  adx: number;
  regressionSlope: number;
  spreadPercent: number;
  volumeAnomaly: number;
  priceRange: number;
}

interface RegimeData {
  success: boolean;
  regime: RegimeType;
  confidence: number;
  timestamp: string;
  symbol: string;
  metrics: RegimeMetrics;
  recommendation: string;
}

const REGIME_STYLES: Record<RegimeType, { bg: string; text: string; border: string; icon: string }> = {
  CHOP: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-500',
    border: 'border-yellow-500',
    icon: '📊',
  },
  TREND: {
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    border: 'border-green-500',
    icon: '📈',
  },
  VOL_EXPANSION: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-500',
    border: 'border-orange-500',
    icon: '⚡',
  },
  UNTRADEABLE: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500',
    icon: '🚫',
  },
};

const REGIME_DESCRIPTIONS: Record<RegimeType, string> = {
  CHOP: 'Range-bound, mean-reverting',
  TREND: 'Strong directional move',
  VOL_EXPANSION: 'Volatility spike',
  UNTRADEABLE: 'Extreme conditions',
};

interface RegimeIndicatorProps {
  symbol?: string;
  refreshInterval?: number; // in milliseconds
  compact?: boolean;
}

export function RegimeIndicator({
  symbol = 'SPY',
  refreshInterval = 30000, // 30 seconds default
  compact = false,
}: RegimeIndicatorProps) {
  const [data, setData] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchRegime = useCallback(async () => {
    try {
      const response = await fetch(`/api/regime?symbol=${encodeURIComponent(symbol)}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
        setError(null);
        setLastUpdate(new Date());
      } else {
        setError(result.error || 'Failed to fetch regime');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchRegime();
    
    const interval = setInterval(fetchRegime, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchRegime, refreshInterval]);

  if (loading && !data) {
    return (
      <Card className={compact ? 'w-fit' : ''}>
        <CardHeader className={compact ? 'p-3' : ''}>
          <CardTitle className={compact ? 'text-sm' : ''}>Market Regime</CardTitle>
        </CardHeader>
        <CardContent className={compact ? 'p-3 pt-0' : ''}>
          <div className="animate-pulse flex space-x-4">
            <div className="h-8 w-32 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className={compact ? 'w-fit' : ''}>
        <CardHeader className={compact ? 'p-3' : ''}>
          <CardTitle className={compact ? 'text-sm' : ''}>Market Regime</CardTitle>
        </CardHeader>
        <CardContent className={compact ? 'p-3 pt-0' : ''}>
          <Badge variant="outline" className="text-red-500 border-red-500">
            Error: {error}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const style = REGIME_STYLES[data.regime];
  const confidencePercent = Math.round(data.confidence * 100);

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${style.bg} ${style.border}`}>
        <span>{style.icon}</span>
        <span className={`font-semibold ${style.text}`}>{data.regime}</span>
        <Badge variant="secondary" className="text-xs">
          {confidencePercent}%
        </Badge>
      </div>
    );
  }

  return (
    <Card className={`${style.bg} border-2 ${style.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{style.icon}</span>
            <div>
              <CardTitle className={`text-xl ${style.text}`}>
                {data.regime}
              </CardTitle>
              <CardDescription>
                {REGIME_DESCRIPTIONS[data.regime]}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {confidencePercent}% confident
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {data.symbol}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Recommendation */}
          <div className="p-3 bg-background/50 rounded-lg">
            <p className="text-sm font-medium">💡 Recommendation</p>
            <p className="text-sm text-muted-foreground">{data.recommendation}</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox
              label="ADX"
              value={data.metrics.adx.toFixed(1)}
              description="Trend strength"
            />
            <MetricBox
              label="ATR %"
              value={`${data.metrics.atrPercent.toFixed(2)}%`}
              description="Volatility"
            />
            <MetricBox
              label="Volume"
              value={`${data.metrics.volumeAnomaly.toFixed(1)}x`}
              description="vs average"
            />
            <MetricBox
              label="Spread"
              value={`${(data.metrics.spreadPercent * 100).toFixed(3)}%`}
              description="Bid-ask"
            />
          </div>

          {/* Last Update */}
          {lastUpdate && (
            <p className="text-xs text-muted-foreground text-right">
              Updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="p-2 bg-background/30 rounded">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default RegimeIndicator;
