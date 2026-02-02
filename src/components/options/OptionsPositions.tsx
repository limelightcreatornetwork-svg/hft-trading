'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
}

interface OptionsPositionsProps {
  onExercise?: (symbol: string) => void;
}

export function OptionsPositions({ onExercise }: OptionsPositionsProps) {
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      setPositions(optionPositions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

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
            <span className="font-bold text-white">${totalValue.toLocaleString()}</span>
            <span className={`ml-2 font-medium ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ({totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)})
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
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 bg-gray-800/50">
                  <TableHead className="text-gray-400">Contract</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-right text-gray-400">Strike</TableHead>
                  <TableHead className="text-right text-gray-400">Expiry</TableHead>
                  <TableHead className="text-right text-gray-400">Qty</TableHead>
                  <TableHead className="text-right text-gray-400">Entry</TableHead>
                  <TableHead className="text-right text-gray-400">Current</TableHead>
                  <TableHead className="text-right text-gray-400">P&L</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => {
                  const daysToExpiry = getDaysToExpiry(position.expiration);
                  const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 7;
                  const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 3;
                  
                  return (
                    <TableRow 
                      key={position.symbol}
                      className={`border-gray-700 transition-colors hover:bg-gray-800/50 ${
                        isExpiringSoon ? 'bg-orange-900/20' : ''
                      }`}
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
                            onClick={() => {/* TODO: Implement close position */}}
                          >
                            Close
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3 mt-4">
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
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
