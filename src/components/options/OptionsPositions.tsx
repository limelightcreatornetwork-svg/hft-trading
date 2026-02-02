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
      <Card>
        <CardHeader>
          <CardTitle>Options Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Options Positions ({positions.length})</CardTitle>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground mr-2">Total:</span>
            <span className="font-bold">${totalValue.toLocaleString()}</span>
            <span className={`ml-2 ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)})
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPositions}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {positions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No open options positions
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Strike</TableHead>
                <TableHead className="text-right">Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => {
                const daysToExpiry = getDaysToExpiry(position.expiration);
                const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 7;
                
                return (
                  <TableRow key={position.symbol}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{position.underlying}</span>
                        <span className="text-xs text-muted-foreground ml-2 font-mono">
                          {position.symbol}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={position.optionType === 'call' ? 'success' : 'destructive'}>
                        {position.optionType?.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${position.strike?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={isNearExpiry ? 'text-orange-600' : ''}>
                        {position.expiration}
                        {daysToExpiry !== null && (
                          <span className="text-xs ml-1">
                            ({daysToExpiry}d)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={position.side === 'long' ? 'secondary' : 'outline'}>
                        {position.side === 'long' ? '+' : '-'}{Math.abs(position.quantity)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${position.avgEntryPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${position.currentPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${
                      position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                      <span className="text-xs ml-1">
                        ({position.unrealizedPLPercent.toFixed(1)}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {position.side === 'long' && onExercise && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onExercise(position.symbol)}
                        >
                          Exercise
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
