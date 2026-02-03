'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  X, 
  Plus, 
  Minus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Sparkline component for mini price charts
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

function Sparkline({ data, width = 80, height = 32, positive = true }: SparklineProps) {
  const { pathD, areaD, lastPoint } = useMemo(() => {
    if (!data || data.length < 2) {
      return { pathD: '', areaD: '', lastPoint: null };
    }
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    
    const points = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (height - padding * 2) - ((value - min) / range) * (height - padding * 2);
      return { x, y };
    });
    
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;
    
    return {
      pathD: linePath,
      areaD: areaPath,
      lastPoint: points[points.length - 1],
    };
  }, [data, width, height]);
  
  if (!pathD) {
    return <div className="w-20 h-8 bg-muted/50 rounded animate-pulse" />;
  }
  
  const color = positive ? '#22c55e' : '#ef4444';
  const fillColor = positive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={areaD} fill={fillColor} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

// Generate mock price history for demo (in production, fetch from API)
function generatePriceHistory(entryPrice: number, currentPrice: number, days: number = 5): number[] {
  const points = days * 4; // 4 points per day
  const history: number[] = [];
  
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const basePrice = entryPrice + (currentPrice - entryPrice) * progress;
    const noise = (Math.random() - 0.5) * entryPrice * 0.02; // 2% noise
    history.push(basePrice + noise);
  }
  
  // Ensure last point is exactly current price
  history[history.length - 1] = currentPrice;
  
  return history;
}

interface Greeks {
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
}

interface Position {
  symbol: string;
  quantity: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
  assetType?: 'stock' | 'option';
  greeks?: Greeks;
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: string;
  priceHistory?: number[];
}

interface PositionCardProps {
  position: Position;
  onClose?: (symbol: string) => void;
  onAdd?: (symbol: string) => void;
  onReduce?: (symbol: string) => void;
  compact?: boolean;
}

export function PositionCard({ 
  position, 
  onClose, 
  onAdd, 
  onReduce,
  compact = false 
}: PositionCardProps) {
  const [showGreeks, setShowGreeks] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isPositive = position.unrealizedPL >= 0;
  const isOption = position.assetType === 'option';

  const handleAction = async (action: string, handler?: (symbol: string) => void) => {
    if (!handler) return;
    setActionLoading(action);
    try {
      await handler(position.symbol);
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatGreek = (value: number | undefined, decimals: number = 3) => {
    if (value === undefined) return '-';
    return value.toFixed(decimals);
  };

  // Generate or use provided price history
  const priceHistory = useMemo(() => {
    if (position.priceHistory && position.priceHistory.length > 1) {
      return position.priceHistory;
    }
    return generatePriceHistory(position.avgEntryPrice, position.currentPrice);
  }, [position.priceHistory, position.avgEntryPrice, position.currentPrice]);

  if (compact) {
    return (
      <Card className={`transition-all hover:shadow-md ${
        isPositive ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
      }`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{position.symbol}</span>
              <Badge variant={position.side === 'long' ? 'default' : 'destructive'} className="text-xs h-5">
                {position.side.toUpperCase()}
              </Badge>
              {isOption && (
                <Badge variant="outline" className="text-xs h-5">
                  {position.optionType?.toUpperCase()}
                </Badge>
              )}
            </div>
            <Sparkline data={priceHistory} positive={isPositive} width={64} height={24} />
            <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{formatCurrency(position.unrealizedPL)}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{position.quantity} @ {formatCurrency(position.avgEntryPrice)}</span>
            <span>{formatCurrency(position.currentPrice)}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`transition-all hover:shadow-md ${
      isPositive ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
    }`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg">{position.symbol}</span>
              <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                {position.side.toUpperCase()}
              </Badge>
              {isOption && (
                <Badge variant="outline">
                  {position.optionType?.toUpperCase()} ${position.strike}
                </Badge>
              )}
            </div>
            {isOption && position.expiration && (
              <p className="text-xs text-muted-foreground">
                Exp: {new Date(position.expiration).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className={`text-xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{formatCurrency(position.unrealizedPL)}
            </div>
            <div className={`text-sm flex items-center justify-end gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isPositive ? '+' : ''}{position.unrealizedPLPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Sparkline Chart */}
        <div className="mb-3 flex justify-center py-2">
          <Sparkline data={priceHistory} positive={isPositive} width={140} height={40} />
        </div>

        {/* Position Details */}
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Quantity</p>
            <p className="font-medium">{position.quantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Entry Price</p>
            <p className="font-medium">{formatCurrency(position.avgEntryPrice)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Current Price</p>
            <p className="font-medium">{formatCurrency(position.currentPrice)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Market Value</p>
            <p className="font-medium">{formatCurrency(position.marketValue)}</p>
          </div>
        </div>

        {/* Today's Change */}
        <div className={`text-sm mb-3 p-2 rounded ${
          position.changeToday >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
        }`}>
          <span className="text-muted-foreground">Today: </span>
          <span className={position.changeToday >= 0 ? 'text-green-600' : 'text-red-600'}>
            {position.changeToday >= 0 ? '+' : ''}{position.changeToday.toFixed(2)}%
          </span>
        </div>

        {/* Greeks (for options) */}
        {isOption && position.greeks && (
          <div className="mb-3">
            <button
              onClick={() => setShowGreeks(!showGreeks)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showGreeks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Greeks
            </button>
            {showGreeks && (
              <div className="grid grid-cols-5 gap-2 mt-2 p-2 bg-muted/50 rounded text-xs">
                <div className="text-center">
                  <p className="text-muted-foreground">Δ Delta</p>
                  <p className="font-mono font-medium">{formatGreek(position.greeks.delta)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Γ Gamma</p>
                  <p className="font-mono font-medium">{formatGreek(position.greeks.gamma, 4)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Θ Theta</p>
                  <p className="font-mono font-medium">{formatGreek(position.greeks.theta)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">ν Vega</p>
                  <p className="font-mono font-medium">{formatGreek(position.greeks.vega)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">IV</p>
                  <p className="font-mono font-medium">
                    {position.greeks.iv ? `${(position.greeks.iv * 100).toFixed(1)}%` : '-'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9"
            onClick={() => handleAction('add', onAdd)}
            disabled={actionLoading !== null}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9"
            onClick={() => handleAction('reduce', onReduce)}
            disabled={actionLoading !== null}
          >
            <Minus className="h-4 w-4 mr-1" />
            Reduce
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1 h-9"
            onClick={() => handleAction('close', onClose)}
            disabled={actionLoading !== null}
          >
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface PositionCardsGridProps {
  positions: Position[];
  onClose?: (symbol: string) => void;
  onAdd?: (symbol: string) => void;
  onReduce?: (symbol: string) => void;
  compact?: boolean;
}

export function PositionCardsGrid({ 
  positions, 
  onClose, 
  onAdd, 
  onReduce,
  compact = false 
}: PositionCardsGridProps) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No open positions</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${
      compact 
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
    }`}>
      {positions.map((position) => (
        <PositionCard
          key={position.symbol}
          position={position}
          onClose={onClose}
          onAdd={onAdd}
          onReduce={onReduce}
          compact={compact}
        />
      ))}
    </div>
  );
}
