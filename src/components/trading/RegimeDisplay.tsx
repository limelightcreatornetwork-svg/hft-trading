"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RegimeData {
  symbol: string;
  regime: 'CHOP' | 'TREND' | 'VOL_EXPANSION' | 'UNTRADEABLE';
  confidence: number;
  scores: {
    chop: number;
    trend: number;
    volExpansion: number;
    untradeable: number;
  };
  indicators: {
    adx: number;
    volRatio: number;
    spreadRatio: number;
    session: string;
  };
  guidance: {
    canTrade: boolean;
    suggestedStopMultiplier: number;
    suggestedPositionSize: number;
    warnings: string[];
  };
}

const REGIME_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CHOP: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500' },
  TREND: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500' },
  VOL_EXPANSION: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500' },
  UNTRADEABLE: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500' },
};

const REGIME_DESCRIPTIONS: Record<string, string> = {
  CHOP: 'Low directional movement — mean-reversion friendly',
  TREND: 'Strong directional bias — momentum-friendly',
  VOL_EXPANSION: 'Volatility expanding — use wider stops',
  UNTRADEABLE: 'Unsuitable conditions — avoid trading',
};

interface RegimeDisplayProps {
  symbol: string;
  refreshInterval?: number;
}

export function RegimeDisplay({ symbol, refreshInterval = 5000 }: RegimeDisplayProps) {
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRegime = async () => {
    try {
      const response = await fetch(`/api/regime/${symbol}`);
      if (!response.ok) {
        throw new Error('Failed to fetch regime');
      }
      const data = await response.json();
      setRegime(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegime();
    const interval = setInterval(fetchRegime, refreshInterval);
    return () => clearInterval(interval);
  }, [symbol, refreshInterval]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Regime: {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-8 bg-gray-200 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (error || !regime) {
    return (
      <Card className="border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Regime: {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500 text-sm">{error || 'No data'}</p>
        </CardContent>
      </Card>
    );
  }

  const colors = REGIME_COLORS[regime.regime] || REGIME_COLORS.CHOP;

  return (
    <Card className={`border-2 ${colors.border}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">{symbol} Regime</CardTitle>
          <Badge className={`${colors.bg} ${colors.text}`}>
            {regime.regime.replace('_', ' ')}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {REGIME_DESCRIPTIONS[regime.regime]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Confidence & Scores */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Confidence:</span>
            <span className="ml-1 font-medium">{(regime.confidence * 100).toFixed(0)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Session:</span>
            <span className="ml-1 font-medium">{regime.indicators.session.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Key Indicators */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-1 bg-gray-50 rounded">
            <div className="text-muted-foreground">ADX</div>
            <div className="font-semibold">{regime.indicators.adx.toFixed(1)}</div>
          </div>
          <div className="text-center p-1 bg-gray-50 rounded">
            <div className="text-muted-foreground">Vol Ratio</div>
            <div className="font-semibold">{regime.indicators.volRatio.toFixed(2)}</div>
          </div>
          <div className="text-center p-1 bg-gray-50 rounded">
            <div className="text-muted-foreground">Spread</div>
            <div className="font-semibold">{regime.indicators.spreadRatio.toFixed(2)}x</div>
          </div>
        </div>

        {/* Trading Guidance */}
        <div className="border-t pt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className={regime.guidance.canTrade ? 'text-green-600' : 'text-red-600'}>
              {regime.guidance.canTrade ? '✓ Can Trade' : '✗ Do Not Trade'}
            </span>
            <span className="text-muted-foreground">
              Size: {(regime.guidance.suggestedPositionSize * 100).toFixed(0)}%
            </span>
          </div>
          {regime.guidance.warnings.length > 0 && (
            <div className="text-xs text-orange-600 space-y-0.5">
              {regime.guidance.warnings.slice(0, 2).map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

        {/* Score Bars */}
        <div className="space-y-1 text-xs">
          {Object.entries(regime.scores).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <div className="flex-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                <div
                  className={`h-full ${
                    key === regime.regime.toLowerCase().replace('_', '') 
                      ? colors.bg.replace('100', '500') 
                      : 'bg-gray-400'
                  }`}
                  style={{ width: `${value * 100}%` }}
                />
              </div>
              <span className="w-8 text-right">{(value * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Multi-symbol regime overview
 */
export function RegimeOverview({ symbols }: { symbols: string[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {symbols.map((symbol) => (
        <RegimeDisplay key={symbol} symbol={symbol} />
      ))}
    </div>
  );
}
