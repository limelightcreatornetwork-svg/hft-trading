'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface TradingStatsData {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  avgConfidence: number;
  byCloseReason: Record<string, number>;
}

interface TradingStatsProps {
  refreshInterval?: number;
}

export function TradingStats({ refreshInterval = 60000 }: TradingStatsProps) {
  const [stats, setStats] = useState<TradingStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Statistics</CardTitle>
          <CardDescription>No completed trades yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const profitFactor = stats.avgLoss !== 0 
    ? Math.abs(stats.avgWin * stats.winningTrades / (stats.avgLoss * stats.losingTrades))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading Statistics</CardTitle>
        <CardDescription>{stats.totalTrades} completed trades</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.winRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Win</p>
            <p className="text-2xl font-bold text-green-600">
              +${stats.avgWin.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Loss</p>
            <p className="text-2xl font-bold text-red-600">
              ${stats.avgLoss.toFixed(2)}
            </p>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Profit Factor</p>
            <p className={`text-lg font-semibold ${profitFactor >= 1 ? 'text-green-600' : 'text-red-600'}`}>
              {profitFactor.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Confidence</p>
            <p className="text-lg font-semibold">
              {stats.avgConfidence.toFixed(1)}/10
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">W/L</p>
            <p className="text-lg font-semibold">
              <span className="text-green-600">{stats.winningTrades}</span>
              {' / '}
              <span className="text-red-600">{stats.losingTrades}</span>
            </p>
          </div>
        </div>

        {Object.keys(stats.byCloseReason).length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">Exit Reasons</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byCloseReason).map(([reason, count]) => (
                <span 
                  key={reason}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    reason === 'TP_HIT' ? 'bg-green-100 text-green-800' :
                    reason === 'SL_HIT' ? 'bg-red-100 text-red-800' :
                    reason === 'TIME_STOP' ? 'bg-orange-100 text-orange-800' :
                    reason === 'TRAILING_STOP' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  {reason.replace('_', ' ')}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
