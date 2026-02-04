'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface OptionPosition {
  symbol: string;
  assetId: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  // Parsed option details
  underlying?: string;
  expiration?: string;
  optionType?: 'call' | 'put';
  strike?: number;
  greeks?: OptionGreeks;
}

interface OptionsPositionsProps {
  onExercise?: (symbol: string) => void;
}

// Greek value color helper
function getGreekColor(greek: string, value: number): string {
  switch (greek) {
    case 'delta':
      return value >= 0 ? 'text-green-400' : 'text-red-400';
    case 'gamma':
      return 'text-purple-400';
    case 'theta':
      return value >= 0 ? 'text-green-400' : 'text-red-400';
    case 'vega':
      return 'text-blue-400';
    default:
      return 'text-gray-300';
  }
}

// Greeks mini-display for position row
function PositionGreeksDisplay({ greeks, quantity, side }: { 
  greeks: OptionGreeks; 
  quantity: number;
  side: string;
}) {
  const multiplier = side === 'long' ? quantity : -quantity;
  const contractSize = 100;
  
  const positionGreeks = {
    delta: greeks.delta * multiplier * contractSize,
    gamma: greeks.gamma * multiplier * contractSize,
    theta: greeks.theta * multiplier * contractSize,
    vega: greeks.vega * multiplier * contractSize,
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Δ</span>
        <span className={getGreekColor('delta', positionGreeks.delta)}>
          {positionGreeks.delta >= 0 ? '+' : ''}{positionGreeks.delta.toFixed(0)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Γ</span>
        <span className={getGreekColor('gamma', positionGreeks.gamma)}>
          {positionGreeks.gamma.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Θ</span>
        <span className={getGreekColor('theta', positionGreeks.theta)}>
          ${positionGreeks.theta.toFixed(0)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">ν</span>
        <span className={getGreekColor('vega', positionGreeks.vega)}>
          ${positionGreeks.vega.toFixed(0)}
        </span>
      </div>
      <div className="flex items-center gap-1 border-l border-gray-600 pl-3">
        <span className="text-gray-500">IV</span>
        <span className="text-yellow-400">{(greeks.iv * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Expanded Greeks detail panel
function GreeksDetailPanel({ 
  position, 
  onClose 
}: { 
  position: OptionPosition;
  onClose: () => void;
}) {
  if (!position.greeks) return null;
  
  const { greeks, quantity, side } = position;
  const multiplier = side === 'long' ? quantity : -quantity;
  const contractSize = 100;
  
  const positionGreeks = {
    delta: greeks.delta * multiplier * contractSize,
    gamma: greeks.gamma * multiplier * contractSize,
    theta: greeks.theta * multiplier * contractSize,
    vega: greeks.vega * multiplier * contractSize,
  };

  const greekInfo = [
    {
      name: 'Delta (Δ)',
      perContract: greeks.delta.toFixed(4),
      position: positionGreeks.delta.toFixed(0),
      unit: 'shares',
      description: 'Share equivalent exposure. Positive = bullish, negative = bearish.',
      color: getGreekColor('delta', positionGreeks.delta),
    },
    {
      name: 'Gamma (Γ)',
      perContract: greeks.gamma.toFixed(5),
      position: positionGreeks.gamma.toFixed(2),
      unit: 'Δ/$1',
      description: 'Rate of delta change. Higher = more delta acceleration.',
      color: getGreekColor('gamma', positionGreeks.gamma),
    },
    {
      name: 'Theta (Θ)',
      perContract: `$${greeks.theta.toFixed(3)}`,
      position: `$${positionGreeks.theta.toFixed(2)}`,
      unit: '/day',
      description: 'Daily time decay. Negative = losing value to time.',
      color: getGreekColor('theta', positionGreeks.theta),
    },
    {
      name: 'Vega (ν)',
      perContract: `$${greeks.vega.toFixed(3)}`,
      position: `$${positionGreeks.vega.toFixed(2)}`,
      unit: '/1% IV',
      description: 'Sensitivity to implied volatility changes.',
      color: getGreekColor('vega', positionGreeks.vega),
    },
  ];

  return (
    <div className="bg-gray-800/80 rounded-lg p-4 mt-2 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-300">
          Greeks Detail: {position.underlying} ${position.strike} {position.optionType?.toUpperCase()}
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 h-6 px-2">
          ✕
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {greekInfo.map((info) => (
          <div key={info.name} className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">{info.name}</span>
              <span className={`font-mono font-bold ${info.color}`}>
                {info.position} {info.unit}
              </span>
            </div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-500">Per contract:</span>
              <span className="text-gray-300 font-mono">{info.perContract}</span>
            </div>
            <p className="text-[10px] text-gray-500">{info.description}</p>
          </div>
        ))}
      </div>
      
      {/* IV Info */}
      <div className="mt-4 bg-gray-900/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Implied Volatility</span>
          <span className="font-mono font-bold text-yellow-400">
            {(greeks.iv * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full"
            style={{ width: `${Math.min(greeks.iv * 200, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>Low (0%)</span>
          <span>Normal (25%)</span>
          <span>High (50%+)</span>
        </div>
      </div>

      {/* Risk Interpretation */}
      <div className="mt-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
        <p className="text-xs text-blue-300">
          <strong>Position Risk:</strong>{' '}
          {positionGreeks.delta > 0 
            ? `Bullish with ${positionGreeks.delta.toFixed(0)} share equivalent exposure.`
            : `Bearish with ${Math.abs(positionGreeks.delta).toFixed(0)} share equivalent short exposure.`
          }
          {' '}
          {positionGreeks.theta < 0 
            ? `Losing ~$${Math.abs(positionGreeks.theta).toFixed(0)}/day to time decay.`
            : `Earning ~$${positionGreeks.theta.toFixed(0)}/day from time decay.`
          }
        </p>
      </div>
    </div>
  );
}

export function OptionsPositions({ onExercise }: OptionsPositionsProps) {
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [showGreeksColumn, setShowGreeksColumn] = useState(true);
  const [sortBy, setSortBy] = useState<'expiry' | 'pnl' | 'delta'>('expiry');
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/positions');
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch positions');
      }

      // Filter for options only (symbols with option format)
      const optionPattern = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
      const optionPositions = data.data.positions.filter((p: { symbol: string }) => 
        optionPattern.test(p.symbol)
      ).map((p: OptionPosition) => {
        const match = p.symbol.match(optionPattern);
        if (match) {
          const [, underlying, expDate, optType, strikeStr] = match;
          const year = 2000 + parseInt(expDate.slice(0, 2));
          const month = expDate.slice(2, 4);
          const day = expDate.slice(4, 6);
          
          return {
            ...p,
            underlying,
            expiration: `${year}-${month}-${day}`,
            optionType: optType === 'C' ? 'call' : 'put',
            strike: parseInt(strikeStr) / 1000,
          };
        }
        return p;
      });

      // Fetch greeks for all option positions
      if (optionPositions.length > 0) {
        const symbols = optionPositions.map((p: OptionPosition) => p.symbol);
        try {
          const quotesRes = await fetch(`/api/options/quotes?symbols=${symbols.join(',')}`);
          const quotesData = await quotesRes.json();
          
          if (quotesData.success && quotesData.data.snapshots) {
            const positionsWithGreeks = optionPositions.map((p: OptionPosition) => {
              const snapshot = quotesData.data.snapshots[p.symbol];
              return {
                ...p,
                greeks: snapshot?.greeks ? {
                  delta: snapshot.greeks.delta,
                  gamma: snapshot.greeks.gamma,
                  theta: snapshot.greeks.theta,
                  vega: snapshot.greeks.vega,
                  iv: snapshot.greeks.implied_volatility,
                } : undefined,
              };
            });
            setPositions(positionsWithGreeks);
          } else {
            setPositions(optionPositions);
          }
        } catch (greeksError) {
          console.warn('Could not fetch Greeks:', greeksError);
          setPositions(optionPositions);
        }
      } else {
        setPositions([]);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (position: OptionPosition) => {
    if (closingPosition) return; // Prevent double-clicks
    
    const confirmed = window.confirm(
      `Close ${Math.abs(position.quantity)} ${position.underlying} ${position.strike} ${position.optionType} position?\n\n` +
      `Current Value: $${position.marketValue.toLocaleString()}\n` +
      `Unrealized P&L: ${position.unrealizedPL >= 0 ? '+' : ''}$${position.unrealizedPL.toFixed(2)}`
    );
    
    if (!confirmed) return;
    
    setClosingPosition(position.symbol);
    setCloseError(null);
    
    try {
      const res = await fetch('/api/options/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: position.symbol,
          quantity: Math.abs(position.quantity),
          currentSide: position.side,
          orderType: 'market',
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to close position');
      }
      
      // Refresh positions after successful close
      await fetchPositions();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close position');
    } finally {
      setClosingPosition(null);
    }
  };

  useEffect(() => {
    fetchPositions();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate totals
  const totals = useMemo(() => {
    return positions.reduce(
      (acc, p) => {
        const multiplier = p.side === 'long' ? p.quantity : -p.quantity;
        const contractSize = 100;
        
        return {
          marketValue: acc.marketValue + p.marketValue,
          unrealizedPL: acc.unrealizedPL + p.unrealizedPL,
          delta: acc.delta + (p.greeks?.delta || 0) * multiplier * contractSize,
          gamma: acc.gamma + (p.greeks?.gamma || 0) * multiplier * contractSize,
          theta: acc.theta + (p.greeks?.theta || 0) * multiplier * contractSize,
          vega: acc.vega + (p.greeks?.vega || 0) * multiplier * contractSize,
        };
      },
      { marketValue: 0, unrealizedPL: 0, delta: 0, gamma: 0, theta: 0, vega: 0 }
    );
  }, [positions]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      switch (sortBy) {
        case 'expiry':
          return (a.expiration || '').localeCompare(b.expiration || '');
        case 'pnl':
          return b.unrealizedPL - a.unrealizedPL;
        case 'delta':
          const aDelta = (a.greeks?.delta || 0) * (a.side === 'long' ? a.quantity : -a.quantity);
          const bDelta = (b.greeks?.delta || 0) * (b.side === 'long' ? b.quantity : -b.quantity);
          return Math.abs(bDelta) - Math.abs(aDelta);
        default:
          return 0;
      }
    });
  }, [positions, sortBy]);

  const getDaysToExpiry = (expiration?: string) => {
    if (!expiration) return null;
    const expDate = new Date(expiration);
    const today = new Date();
    const diff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">💼 Options Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-800 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">💼 Options Positions ({positions.length})</CardTitle>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-400 mr-2">Total:</span>
            <span className="font-bold text-white">${totals.marketValue.toLocaleString()}</span>
            <span className={`ml-2 font-medium ${totals.unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ({totals.unrealizedPL >= 0 ? '+' : ''}${totals.unrealizedPL.toFixed(2)})
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPositions} className="border-gray-700">
            🔄 Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        {closeError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg text-sm flex items-center justify-between">
            <span>⚠️ Close failed: {closeError}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setCloseError(null)}
              className="text-red-400 hover:text-red-300 h-6 px-2"
            >
              ✕
            </Button>
          </div>
        )}

        {positions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400 mb-2">No open options positions</p>
            <p className="text-gray-500 text-sm">
              Go to the Chain tab to open a new position
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio Greeks Summary */}
            <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-300">📊 Portfolio Greeks</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGreeksColumn(!showGreeksColumn)}
                    className={`text-xs px-2 py-1 rounded ${showGreeksColumn ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  >
                    {showGreeksColumn ? '✓ Greeks ON' : 'Greeks OFF'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Net Delta</div>
                  <div className={`text-lg font-bold ${totals.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totals.delta >= 0 ? '+' : ''}{totals.delta.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-gray-500">share equiv.</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Net Gamma</div>
                  <div className="text-lg font-bold text-purple-400">
                    {totals.gamma.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-500">Δ per $1</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Net Theta</div>
                  <div className={`text-lg font-bold ${totals.theta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${totals.theta.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-gray-500">per day</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Net Vega</div>
                  <div className="text-lg font-bold text-blue-400">
                    ${totals.vega.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-gray-500">per 1% IV</div>
                </div>
                <div className="text-center border-l border-gray-600 pl-4">
                  <div className="text-xs text-gray-500 mb-1">Day P&L Est.</div>
                  <div className={`text-lg font-bold ${totals.theta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${totals.theta.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-gray-500">from theta</div>
                </div>
              </div>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-gray-500">Sort by:</span>
              {(['expiry', 'pnl', 'delta'] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-2 py-1 rounded ${sortBy === sort ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
                >
                  {sort === 'expiry' ? '📅 Expiry' : sort === 'pnl' ? '💰 P&L' : '📈 Delta'}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-gray-700 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700 bg-gray-800/50">
                    <TableHead className="text-gray-400">Contract</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-right text-gray-400">Strike</TableHead>
                    <TableHead className="text-right text-gray-400">Expiry</TableHead>
                    <TableHead className="text-right text-gray-400">Qty</TableHead>
                    {showGreeksColumn && (
                      <TableHead className="text-gray-400">Greeks</TableHead>
                    )}
                    <TableHead className="text-right text-gray-400">Entry</TableHead>
                    <TableHead className="text-right text-gray-400">Current</TableHead>
                    <TableHead className="text-right text-gray-400">P&L</TableHead>
                    <TableHead className="text-right text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPositions.map((position) => {
                    const daysToExpiry = getDaysToExpiry(position.expiration);
                    const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 7;
                    const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 3;
                    const isExpanded = expandedPosition === position.symbol;
                    
                    return (
                      <>
                        <TableRow 
                          key={position.symbol}
                          className={`border-gray-700 transition-colors hover:bg-gray-800/50 ${
                            isExpiringSoon ? 'bg-orange-900/20' : ''
                          } ${isExpanded ? 'bg-blue-900/20' : ''}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{position.underlying}</span>
                              <span className="text-xs text-gray-500 font-mono">
                                {position.symbol.slice(-8)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={position.optionType === 'call' ? 'success' : 'destructive'}>
                              {position.optionType === 'call' ? '📈' : '📉'} {position.optionType?.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-white">
                            ${position.strike?.toFixed(0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={isNearExpiry ? 'text-orange-400' : 'text-gray-300'}>
                              {new Date(position.expiration || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {daysToExpiry !== null && (
                                <span className={`text-xs ml-1 ${isExpiringSoon ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                  ({daysToExpiry}d)
                                </span>
                              )}
                              {isExpiringSoon && <span className="ml-1">⚠️</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant={position.side === 'long' ? 'secondary' : 'outline'}
                              className={position.side === 'long' ? 'bg-green-900/50 text-green-400 border-green-700' : 'bg-red-900/50 text-red-400 border-red-700'}
                            >
                              {position.side === 'long' ? '🔼' : '🔽'} {Math.abs(position.quantity)}
                            </Badge>
                          </TableCell>
                          {showGreeksColumn && (
                            <TableCell>
                              {position.greeks ? (
                                <div 
                                  className="cursor-pointer hover:opacity-80"
                                  onClick={() => setExpandedPosition(isExpanded ? null : position.symbol)}
                                >
                                  <PositionGreeksDisplay 
                                    greeks={position.greeks} 
                                    quantity={position.quantity}
                                    side={position.side}
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-mono text-gray-400">
                            ${position.avgEntryPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-white">
                            ${position.currentPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={`font-bold ${
                              position.unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                            </div>
                            <div className={`text-xs ${
                              position.unrealizedPLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {position.unrealizedPLPercent >= 0 ? '+' : ''}{position.unrealizedPLPercent.toFixed(1)}%
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-xs border-gray-600 hover:bg-gray-700"
                                disabled={closingPosition === position.symbol}
                                onClick={() => closePosition(position)}
                              >
                                {closingPosition === position.symbol ? '⏳' : 'Close'}
                              </Button>
                              {position.side === 'long' && onExercise && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="text-xs border-blue-600 text-blue-400 hover:bg-blue-900/30"
                                  onClick={() => onExercise(position.symbol)}
                                >
                                  Exercise
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && position.greeks && (
                          <TableRow key={`${position.symbol}-expanded`} className="border-gray-700">
                            <TableCell colSpan={showGreeksColumn ? 10 : 9} className="p-0">
                              <GreeksDetailPanel 
                                position={position} 
                                onClose={() => setExpandedPosition(null)}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-3 mt-4">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Total Positions</div>
                <div className="text-xl font-bold text-white">{positions.length}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Long / Short</div>
                <div className="text-xl font-bold">
                  <span className="text-green-400">{positions.filter(p => p.side === 'long').length}</span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-red-400">{positions.filter(p => p.side !== 'long').length}</span>
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Calls / Puts</div>
                <div className="text-xl font-bold">
                  <span className="text-green-400">{positions.filter(p => p.optionType === 'call').length}</span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-red-400">{positions.filter(p => p.optionType === 'put').length}</span>
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Expiring ≤7d</div>
                <div className={`text-xl font-bold ${
                  positions.filter(p => {
                    const dte = getDaysToExpiry(p.expiration);
                    return dte !== null && dte <= 7;
                  }).length > 0 ? 'text-orange-400' : 'text-gray-500'
                }`}>
                  {positions.filter(p => {
                    const dte = getDaysToExpiry(p.expiration);
                    return dte !== null && dte <= 7;
                  }).length}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Greeks Available</div>
                <div className={`text-xl font-bold ${
                  positions.filter(p => p.greeks).length === positions.length ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {positions.filter(p => p.greeks).length}/{positions.length}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
