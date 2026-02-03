'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Search, 
  Filter,
  X
} from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  quantity: number;
  price: number;
  total: number;
  status: string;
  filledAt: string;
  pnl?: number;
}

interface TradeHistoryProps {
  pageSize?: number;
}

export function TradeHistory({ pageSize = 10 }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);

  // Filters
  const [symbolFilter, setSymbolFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      
      if (symbolFilter) params.append('symbol', symbolFilter.toUpperCase());
      if (typeFilter !== 'all') params.append('side', typeFilter);
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);

      const res = await fetch(`/api/orders?status=filled&${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        // Transform orders to trades format
        const tradeData = (data.data.orders || []).map((order: Record<string, unknown>) => ({
          id: order.id as string,
          symbol: order.symbol as string,
          side: order.side as 'buy' | 'sell',
          type: order.type as string,
          quantity: Number(order.filledQuantity) || Number(order.quantity) || 0,
          price: Number(order.filledAvgPrice) || Number(order.limitPrice) || 0,
          total: (Number(order.filledQuantity) || Number(order.quantity) || 0) * (Number(order.filledAvgPrice) || Number(order.limitPrice) || 0),
          status: order.status as string,
          filledAt: order.filledAt as string || order.submittedAt as string,
          pnl: order.pnl as number | undefined,
        }));
        setTrades(tradeData);
        setTotalTrades(data.data.total || tradeData.length);
        setTotalPages(Math.ceil((data.data.total || tradeData.length) / pageSize));
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, symbolFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Symbol', 'Side', 'Type', 'Quantity', 'Price', 'Total', 'P&L', 'Status'];
    const csvData = trades.map(trade => [
      new Date(trade.filledAt).toLocaleString(),
      trade.symbol,
      trade.side,
      trade.type,
      trade.quantity,
      trade.price.toFixed(2),
      trade.total.toFixed(2),
      trade.pnl?.toFixed(2) || '-',
      trade.status,
    ]);

    const csv = [headers.join(','), ...csvData.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSymbolFilter('');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const hasActiveFilters = symbolFilter || typeFilter !== 'all' || dateFrom || dateTo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-lg md:text-xl">Trade History</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-8"
            >
              <Filter className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  !
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={trades.length === 0}
              className="h-8"
            >
              <Download className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-3 md:p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Symbol..."
                  value={symbolFilter}
                  onChange={(e) => setSymbolFilter(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="all">All Types</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
              <Input
                type="date"
                placeholder="From"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9"
              />
              <Input
                type="date"
                placeholder="To"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded"></div>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No trades found</p>
            {hasActiveFilters && (
              <Button variant="link" onClick={clearFilters} className="mt-2">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="p-3 border rounded-lg bg-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{trade.symbol}</span>
                      <Badge variant={trade.side === 'buy' ? 'default' : 'destructive'} className="text-xs">
                        {trade.side.toUpperCase()}
                      </Badge>
                    </div>
                    {trade.pnl !== undefined && (
                      <span className={`text-sm font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>Qty: {trade.quantity}</div>
                    <div>Price: ${trade.price.toFixed(2)}</div>
                    <div>Total: ${trade.total.toFixed(2)}</div>
                    <div>{new Date(trade.filledAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="text-sm">
                        {new Date(trade.filledAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={trade.side === 'buy' ? 'default' : 'destructive'}>
                          {trade.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{trade.type}</TableCell>
                      <TableCell className="text-right">{trade.quantity}</TableCell>
                      <TableCell className="text-right">${trade.price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${trade.total.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-medium ${
                        trade.pnl === undefined ? '' : trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalTrades)} of {totalTrades}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 text-sm">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
