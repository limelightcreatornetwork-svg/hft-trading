'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';

interface PLData {
  portfolioValue: number;
  dailyPL: number;
  dailyPLPercent: number;
  weeklyPL: number;
  monthlyPL: number;
  equity: number;
  lastEquity: number;
}

interface PLDisplayProps {
  refreshInterval?: number;
}

export function PLDisplay({ refreshInterval = 5000 }: PLDisplayProps) {
  const [data, setData] = useState<PLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const result = await res.json();
      if (result.success) {
        setData({
          portfolioValue: result.data.portfolioValue || 0,
          dailyPL: result.data.dailyPL || 0,
          dailyPLPercent: result.data.dailyPLPercent || 0,
          weeklyPL: result.data.weeklyPL || 0,
          monthlyPL: result.data.monthlyPL || 0,
          equity: result.data.equity || 0,
          lastEquity: result.data.lastEquity || 0,
        });
        setLastUpdate(new Date());
        setIsLive(true);
      }
    } catch (error) {
      console.error('Error fetching P&L data:', error);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const formatCurrency = (value: number) => {
    const formatted = Math.abs(value).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
    return value >= 0 ? formatted : `-${formatted}`;
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-4 md:pt-6">
              <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-6 md:h-8 bg-muted rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const plCards = [
    {
      title: 'Portfolio Value',
      value: data?.portfolioValue || 0,
      icon: DollarSign,
      isPercent: false,
      subtitle: 'Total equity',
    },
    {
      title: 'Today',
      value: data?.dailyPL || 0,
      percent: data?.dailyPLPercent || 0,
      icon: data?.dailyPL && data.dailyPL >= 0 ? TrendingUp : TrendingDown,
      isPercent: false,
      showPercent: true,
    },
    {
      title: 'This Week',
      value: data?.weeklyPL || 0,
      icon: data?.weeklyPL && data.weeklyPL >= 0 ? TrendingUp : TrendingDown,
      isPercent: false,
    },
    {
      title: 'This Month',
      value: data?.monthlyPL || 0,
      icon: data?.monthlyPL && data.monthlyPL >= 0 ? TrendingUp : TrendingDown,
      isPercent: false,
    },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${isLive ? 'text-green-500 animate-pulse' : 'text-gray-400'}`} />
          <span className="text-xs md:text-sm text-muted-foreground">
            {isLive ? 'Live' : 'Disconnected'}
          </span>
        </div>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* P&L Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {plCards.map((card) => {
          const Icon = card.icon;
          const isPositive = card.value >= 0;
          const colorClass = card.title === 'Portfolio Value' 
            ? 'text-foreground' 
            : isPositive ? 'text-green-600' : 'text-red-600';

          return (
            <Card 
              key={card.title} 
              className={`transition-all hover:shadow-md ${
                card.title !== 'Portfolio Value' 
                  ? isPositive ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' : 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
                  : ''
              }`}
            >
              <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-3 w-3 md:h-4 md:w-4 ${colorClass}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                <div className={`text-lg md:text-2xl font-bold ${colorClass}`}>
                  {formatCurrency(card.value)}
                </div>
                {card.showPercent && card.percent !== undefined && (
                  <Badge 
                    variant="outline" 
                    className={`mt-1 text-xs ${isPositive ? 'border-green-300 text-green-600' : 'border-red-300 text-red-600'}`}
                  >
                    {formatPercent(card.percent)}
                  </Badge>
                )}
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
