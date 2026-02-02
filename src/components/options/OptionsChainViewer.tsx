'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface OptionsChainEntry {
  contract: {
    symbol: string;
    name: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
    openInterest: number;
  };
  quote: {
    bid: number;
    ask: number;
    last: number;
    spread: number;
  } | null;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
  } | null;
}

interface OptionsChainViewerProps {
  defaultSymbol?: string;
  onSelectContract?: (contract: OptionsChainEntry) => void;
  positions?: Array<{ symbol: string; qty: string }>;
}

export function OptionsChainViewer({ 
  defaultSymbol = '', 
  onSelectContract,
  positions = [],
}: OptionsChainViewerProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [chain, setChain] = useState<OptionsChainEntry[]>([]);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [optionType, setOptionType] = useState<'call' | 'put' | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockPrice, setStockPrice] = useState<number | null>(null);

  const fetchChain = useCallback(async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);

    try {
      // Fetch stock price
      const quoteRes = await fetch(`/api/quotes?symbol=${symbol}`);
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        if (quoteData.success) {
          setStockPrice(quoteData.data.price);
        }
      }

      // Build URL with filters
      const params = new URLSearchParams({ symbol });
      if (selectedExpiration) params.set('expiration', selectedExpiration);
      if (optionType !== 'all') params.set('type', optionType);
      params.set('limit', '100');

      const res = await fetch(`/api/options/chain?${params.toString()}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch options chain');
      }

      setChain(data.data.chain);
      setExpirations(data.data.expirations);
      
      // Auto-select first expiration if none selected
      if (!selectedExpiration && data.data.expirations.length > 0) {
        setSelectedExpiration(data.data.expirations[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedExpiration, optionType]);

  useEffect(() => {
    if (symbol) {
      fetchChain();
    }
  }, [fetchChain, symbol]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedExpiration('');
    fetchChain();
  };

  // Check if user has underlying shares for covered calls
  const underlyingShares = positions.find(p => p.symbol === symbol)?.qty;
  const sharesOwned = underlyingShares ? parseInt(underlyingShares) : 0;

  // Filter chain by selected expiration
  const filteredChain = chain.filter(entry => 
    !selectedExpiration || entry.contract.expiration === selectedExpiration
  );

  // Separate calls and puts
  const calls = filteredChain.filter(e => e.contract.type === 'call');
  const puts = filteredChain.filter(e => e.contract.type === 'put');

  // Get unique strikes
  const strikes = [...new Set(filteredChain.map(e => e.contract.strike))].sort((a, b) => a - b);

  const formatGreek = (value: number | undefined, decimals: number = 4) => {
    if (value === undefined || value === null) return '-';
    return value.toFixed(decimals);
  };

  const formatPrice = (value: number | undefined) => {
    if (value === undefined || value === null) return '-';
    return `$${value.toFixed(2)}`;
  };

  const getMoneyness = (strike: number) => {
    if (!stockPrice) return '';
    if (strike < stockPrice * 0.98) return 'ITM';
    if (strike > stockPrice * 1.02) return 'OTM';
    return 'ATM';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Options Chain</span>
          {stockPrice && (
            <span className="text-lg font-normal">
              {symbol} @ ${stockPrice.toFixed(2)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex gap-4 mb-4">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Enter symbol (e.g., AAPL)"
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !symbol}>
            {loading ? 'Loading...' : 'Search'}
          </Button>
        </form>

        {/* Filters */}
        {expirations.length > 0 && (
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">Expiration</label>
              <Select
                value={selectedExpiration}
                onChange={(e) => setSelectedExpiration(e.target.value)}
                options={expirations.map(exp => ({
                  value: exp,
                  label: new Date(exp).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  }),
                }))}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">Type</label>
              <Select
                value={optionType}
                onChange={(e) => setOptionType(e.target.value as 'call' | 'put' | 'all')}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'call', label: 'Calls Only' },
                  { value: 'put', label: 'Puts Only' },
                ]}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* Shares Info for Covered Calls */}
        {sharesOwned > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              You own <strong>{sharesOwned}</strong> shares of {symbol}. 
              You can sell up to <strong>{Math.floor(sharesOwned / 100)}</strong> covered call contracts.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Options Table */}
        {filteredChain.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={6} className="text-center bg-green-50 text-green-700">
                    CALLS
                  </TableHead>
                  <TableHead className="text-center bg-gray-100">Strike</TableHead>
                  <TableHead colSpan={6} className="text-center bg-red-50 text-red-700">
                    PUTS
                  </TableHead>
                </TableRow>
                <TableRow>
                  {/* Call columns */}
                  <TableHead className="text-right">Bid</TableHead>
                  <TableHead className="text-right">Ask</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Γ</TableHead>
                  <TableHead className="text-right">Θ</TableHead>
                  <TableHead className="text-right">IV</TableHead>
                  {/* Strike */}
                  <TableHead className="text-center font-bold">Strike</TableHead>
                  {/* Put columns */}
                  <TableHead className="text-right">Bid</TableHead>
                  <TableHead className="text-right">Ask</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Γ</TableHead>
                  <TableHead className="text-right">Θ</TableHead>
                  <TableHead className="text-right">IV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {strikes.map((strike) => {
                  const call = calls.find(c => c.contract.strike === strike);
                  const put = puts.find(p => p.contract.strike === strike);
                  const moneyness = getMoneyness(strike);
                  const isATM = moneyness === 'ATM';
                  
                  return (
                    <TableRow 
                      key={strike} 
                      className={isATM ? 'bg-yellow-50' : ''}
                    >
                      {/* Call data */}
                      <TableCell 
                        className="text-right cursor-pointer hover:bg-green-100"
                        onClick={() => call && onSelectContract?.(call)}
                      >
                        {formatPrice(call?.quote?.bid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(call?.quote?.ask)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatGreek(call?.greeks?.delta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatGreek(call?.greeks?.gamma)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-600">
                        {formatGreek(call?.greeks?.theta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {call?.greeks?.iv ? `${(call.greeks.iv * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                      
                      {/* Strike */}
                      <TableCell className="text-center font-bold">
                        <div className="flex items-center justify-center gap-2">
                          ${strike.toFixed(2)}
                          {moneyness && (
                            <Badge variant={moneyness === 'ITM' ? 'success' : moneyness === 'OTM' ? 'secondary' : 'warning'} className="text-xs">
                              {moneyness}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Put data */}
                      <TableCell 
                        className="text-right cursor-pointer hover:bg-red-100"
                        onClick={() => put && onSelectContract?.(put)}
                      >
                        {formatPrice(put?.quote?.bid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(put?.quote?.ask)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatGreek(put?.greeks?.delta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatGreek(put?.greeks?.gamma)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-600">
                        {formatGreek(put?.greeks?.theta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {put?.greeks?.iv ? `${(put.greeks.iv * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && filteredChain.length === 0 && symbol && (
          <p className="text-center text-muted-foreground py-8">
            No options contracts found for {symbol}
          </p>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
