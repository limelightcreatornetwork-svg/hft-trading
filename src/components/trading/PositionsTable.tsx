'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Position {
  symbol: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
}

interface PositionsTableProps {
  positions: Position[];
  loading: boolean;
}

export function PositionsTable({ positions, loading }: PositionsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
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

  const totalPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Positions ({positions.length})</CardTitle>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Total:</span>
          <span className="font-bold">${totalValue.toLocaleString()}</span>
          <span className={`ml-2 ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ({totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)})
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No open positions</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => (
                <TableRow key={position.symbol}>
                  <TableCell className="font-medium">{position.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={position.side === 'long' ? 'success' : 'destructive'}>
                      {position.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{position.quantity}</TableCell>
                  <TableCell className="text-right">${position.avgEntryPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${position.currentPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${position.marketValue.toFixed(2)}</TableCell>
                  <TableCell className={`text-right font-medium ${position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                    <span className="text-xs ml-1">
                      ({position.unrealizedPLPercent.toFixed(1)}%)
                    </span>
                  </TableCell>
                  <TableCell className={`text-right ${position.changeToday >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {position.changeToday >= 0 ? '+' : ''}{position.changeToday.toFixed(2)}%
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
