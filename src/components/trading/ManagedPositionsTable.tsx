'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfidenceIndicator } from './ConfidenceIndicator';

interface ManagedPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  confidence: number;
  takeProfitPct: number;
  stopLossPct: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  timeStopHours: number;
  trailingStopPct: number | null;
  hoursRemaining: number;
  enteredAt: string;
  status: string;
  currentPrice?: number;
  currentPnl?: number;
  currentPnlPct?: number;
}

interface ManagedPositionsTableProps {
  refreshInterval?: number;
}

export function ManagedPositionsTable({ 
  refreshInterval = 10000,
}: ManagedPositionsTableProps) {
  const [positions, setPositions] = useState<ManagedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    try {
      const response = await fetch('/api/positions/managed?status=active');
      if (!response.ok) throw new Error('Failed to fetch positions');
      const data = await response.json();
      setPositions(data.positions);
      setError(null);
    } catch (err) {
      setError('Failed to load positions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (positionId: string, currentPrice: number) => {
    try {
      const response = await fetch('/api/positions/managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId, closePrice: currentPrice }),
      });
      if (response.ok) {
        fetchPositions();
      }
    } catch (err) {
      console.error('Failed to close position:', err);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const formatTime = (hours: number) => {
    if (hours <= 0) return '⏰ EXPIRED';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const getTimeColor = (hours: number) => {
    if (hours <= 0) return 'text-red-500 font-bold';
    if (hours <= 1) return 'text-orange-500';
    return 'text-muted-foreground';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Managed Positions</CardTitle>
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

  const totalPnl = positions.reduce((sum, p) => sum + (p.currentPnl || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Managed Positions ({positions.length})
          {positions.length > 0 && (
            <span className={totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
              ({totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)})
            </span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={fetchPositions}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-red-500 text-center">{error}</p>
        ) : positions.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No managed positions</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-center">TP/SL</TableHead>
                <TableHead className="text-center">Time Left</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={position.side === 'buy' ? 'success' : 'destructive'}>
                      {position.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ConfidenceIndicator score={position.confidence} showLabel={false} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    ${position.entryPrice.toFixed(2)}
                    <span className="text-xs text-muted-foreground block">
                      x{position.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    ${(position.currentPrice || position.entryPrice).toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${
                    (position.currentPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(position.currentPnl || 0) >= 0 ? '+' : ''}${(position.currentPnl || 0).toFixed(2)}
                    <span className="text-xs block">
                      ({(position.currentPnlPct || 0).toFixed(2)}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col text-xs">
                      <span className="text-green-600">
                        TP: ${position.takeProfitPrice.toFixed(2)} (+{position.takeProfitPct}%)
                      </span>
                      <span className="text-red-600">
                        SL: ${position.stopLossPrice.toFixed(2)} (-{position.stopLossPct}%)
                      </span>
                      {position.trailingStopPct && (
                        <span className="text-blue-600">
                          Trail: {position.trailingStopPct}%
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={`text-center ${getTimeColor(position.hoursRemaining)}`}>
                    {formatTime(position.hoursRemaining)}
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => closePosition(position.id, position.currentPrice || position.entryPrice)}
                    >
                      Close
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
