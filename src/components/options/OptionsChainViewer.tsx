'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';

interface OptionsChainEntry {
  contract: {
    symbol: string;
    name: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
    openInterest: number;
    volume?: number;
  };
  quote: {
    bid: number;
    ask: number;
    last: number;
    spread: number;
    volume?: number;
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

// Popular symbols for quick access
const POPULAR_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT'];

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
  const [deltaRange, setDeltaRange] = useState<[number, number]>([0, 1]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedContract, setSelectedContract] = useState<OptionsChainEntry | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

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

  // Filter chain by selected expiration and delta range
  const filteredChain = useMemo(() => {
    return chain.filter(entry => {
      // Expiration filter
      if (selectedExpiration && entry.contract.expiration !== selectedExpiration) {
        return false;
      }
      // Delta filter
      if (entry.greeks) {
        const absDelta = Math.abs(entry.greeks.delta);
        if (absDelta < deltaRange[0] || absDelta > deltaRange[1]) {
          return false;
        }
      }
      return true;
    });
  }, [chain, selectedExpiration, deltaRange]);

  // Separate calls and puts
  const calls = filteredChain.filter(e => e.contract.type === 'call');
  const puts = filteredChain.filter(e => e.contract.type === 'put');

  // Get unique strikes
  const strikes = [...new Set(filteredChain.map(e => e.contract.strike))].sort((a, b) => a - b);

  // Calculate max open interest for heat map
  const maxOI = useMemo(() => {
    return Math.max(...filteredChain.map(e => e.contract.openInterest || 0), 1);
  }, [filteredChain]);

  // Calculate days to expiry
  const getDaysToExpiry = (expiration: string) => {
    const expDate = new Date(expiration);
    const today = new Date();
    return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Handle contract selection
  const handleContractClick = (entry: OptionsChainEntry) => {
    setSelectedContract(entry);
    onSelectContract?.(entry);
  };

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
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📈 Options Chain</span>
          {stockPrice && (
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-white">
                {symbol}
              </span>
              <span className="text-lg font-normal text-green-400">
                ${stockPrice.toFixed(2)}
              </span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search Form with Popular Symbols */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2 mb-2">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Enter symbol (e.g., AAPL)"
              className="flex-1 bg-gray-800 border-gray-700 text-white"
            />
            <Button type="submit" disabled={loading || !symbol}>
              {loading ? '⏳' : '🔍'} {loading ? 'Loading...' : 'Search'}
            </Button>
          </div>
          {/* Quick Symbol Buttons */}
          <div className="flex flex-wrap gap-1">
            {POPULAR_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  setSymbol(sym);
                  setSelectedExpiration('');
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  symbol === sym 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </form>

        {/* Filters */}
        {expirations.length > 0 && (
          <div className="space-y-3 mb-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm text-gray-400">Expiration</label>
                <Select
                  value={selectedExpiration}
                  onChange={(e) => setSelectedExpiration(e.target.value)}
                  options={expirations.map(exp => {
                    const dte = getDaysToExpiry(exp);
                    return {
                      value: exp,
                      label: `${new Date(exp).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                      })} (${dte}d)`,
                    };
                  })}
                  className="mt-1 bg-gray-800 border-gray-700"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-gray-400">Type</label>
                <Select
                  value={optionType}
                  onChange={(e) => setOptionType(e.target.value as 'call' | 'put' | 'all')}
                  options={[
                    { value: 'all', label: '📊 All' },
                    { value: 'call', label: '📈 Calls Only' },
                    { value: 'put', label: '📉 Puts Only' },
                  ]}
                  className="mt-1 bg-gray-800 border-gray-700"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="border-gray-700"
                >
                  {showAdvancedFilters ? '▲ Less' : '▼ More'}
                </Button>
              </div>
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Delta Range</span>
                    <span className="text-gray-300">
                      {(deltaRange[0] * 100).toFixed(0)}% - {(deltaRange[1] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">Min Delta</label>
                      <Slider
                        value={deltaRange[0]}
                        onChange={(val) => setDeltaRange([val, Math.max(val, deltaRange[1])])}
                        min={0}
                        max={1}
                        step={0.05}
                        showValue={false}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max Delta</label>
                      <Slider
                        value={deltaRange[1]}
                        onChange={(val) => setDeltaRange([Math.min(deltaRange[0], val), val])}
                        min={0}
                        max={1}
                        step={0.05}
                        showValue={false}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Deep OTM</span>
                    <span>ATM (50Δ)</span>
                    <span>Deep ITM</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDeltaRange([0.15, 0.35])}
                    className="text-xs border-gray-600"
                  >
                    📞 Covered Call (15-35Δ)
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDeltaRange([0.25, 0.35])}
                    className="text-xs border-gray-600"
                  >
                    💵 CSP Sweet Spot (25-35Δ)
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDeltaRange([0, 1])}
                    className="text-xs border-gray-600"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shares Info for Covered Calls */}
        {sharesOwned > 0 && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
            <p className="text-sm text-blue-300">
              📊 You own <strong className="text-blue-200">{sharesOwned}</strong> shares of {symbol}. 
              You can sell up to <strong className="text-blue-200">{Math.floor(sharesOwned / 100)}</strong> covered call contracts.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg">
            ⚠️ {error}
          </div>
        )}

        {/* Stats Bar */}
        {filteredChain.length > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
            <span>
              📊 {filteredChain.length} contracts | 
              {selectedExpiration && ` ${getDaysToExpiry(selectedExpiration)} DTE`}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded ${viewMode === 'table' ? 'bg-gray-700 text-white' : 'hover:bg-gray-800'}`}
              >
                ⊞ Table
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 rounded ${viewMode === 'grid' ? 'bg-gray-700 text-white' : 'hover:bg-gray-800'}`}
              >
                ⊡ Grid
              </button>
            </div>
          </div>
        )}

        {/* Options Table View */}
        {filteredChain.length > 0 && viewMode === 'table' && (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead colSpan={7} className="text-center bg-green-900/30 text-green-400 border-b border-gray-700">
                    📈 CALLS
                  </TableHead>
                  <TableHead className="text-center bg-gray-800 border-x border-gray-700">Strike</TableHead>
                  <TableHead colSpan={7} className="text-center bg-red-900/30 text-red-400 border-b border-gray-700">
                    📉 PUTS
                  </TableHead>
                </TableRow>
                <TableRow className="border-gray-700 text-gray-400">
                  {/* Call columns */}
                  <TableHead className="text-right text-xs">OI</TableHead>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-right text-xs">Γ</TableHead>
                  <TableHead className="text-right text-xs">Θ</TableHead>
                  <TableHead className="text-right text-xs">IV</TableHead>
                  {/* Strike */}
                  <TableHead className="text-center font-bold text-white">Strike</TableHead>
                  {/* Put columns */}
                  <TableHead className="text-right text-xs">IV</TableHead>
                  <TableHead className="text-right text-xs">Θ</TableHead>
                  <TableHead className="text-right text-xs">Γ</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                  <TableHead className="text-right text-xs">OI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {strikes.map((strike) => {
                  const call = calls.find(c => c.contract.strike === strike);
                  const put = puts.find(p => p.contract.strike === strike);
                  const moneyness = getMoneyness(strike);
                  const isATM = moneyness === 'ATM';
                  const isSelected = selectedContract?.contract.strike === strike;
                  
                  // Calculate OI heat map intensity
                  const callOI = call?.contract.openInterest || 0;
                  const putOI = put?.contract.openInterest || 0;
                  const callOIIntensity = Math.min(callOI / maxOI, 1);
                  const putOIIntensity = Math.min(putOI / maxOI, 1);
                  
                  return (
                    <TableRow 
                      key={strike} 
                      className={`border-gray-700 transition-colors ${
                        isATM ? 'bg-yellow-900/20' : ''
                      } ${isSelected ? 'bg-blue-900/30' : ''}`}
                    >
                      {/* Call OI with heat map */}
                      <TableCell 
                        className="text-right text-xs"
                        style={{ 
                          backgroundColor: `rgba(34, 197, 94, ${callOIIntensity * 0.3})` 
                        }}
                      >
                        {callOI > 0 ? callOI.toLocaleString() : '-'}
                      </TableCell>
                      {/* Call data */}
                      <TableCell 
                        className={`text-right cursor-pointer transition-colors ${
                          call === selectedContract ? 'bg-green-900/50' : 'hover:bg-green-900/30'
                        }`}
                        onClick={() => call && handleContractClick(call)}
                      >
                        <span className="font-mono text-green-400">{formatPrice(call?.quote?.bid)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-gray-300">{formatPrice(call?.quote?.ask)}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={call?.greeks?.delta && call.greeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatGreek(call?.greeks?.delta, 2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-purple-400">
                        {formatGreek(call?.greeks?.gamma)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-400">
                        {formatGreek(call?.greeks?.theta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-blue-400">
                        {call?.greeks?.iv ? `${(call.greeks.iv * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                      
                      {/* Strike */}
                      <TableCell className="text-center font-bold bg-gray-800 border-x border-gray-700">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-white">${strike.toFixed(0)}</span>
                          {moneyness && (
                            <Badge 
                              variant={moneyness === 'ITM' ? 'success' : moneyness === 'OTM' ? 'secondary' : 'warning'} 
                              className="text-[10px] px-1"
                            >
                              {moneyness}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Put data - mirrored order */}
                      <TableCell className="text-right text-xs text-blue-400">
                        {put?.greeks?.iv ? `${(put.greeks.iv * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-400">
                        {formatGreek(put?.greeks?.theta, 2)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-purple-400">
                        {formatGreek(put?.greeks?.gamma)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={put?.greeks?.delta && put.greeks.delta < 0 ? 'text-red-400' : 'text-green-400'}>
                          {formatGreek(put?.greeks?.delta, 2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-gray-300">{formatPrice(put?.quote?.ask)}</span>
                      </TableCell>
                      <TableCell 
                        className={`text-right cursor-pointer transition-colors ${
                          put === selectedContract ? 'bg-red-900/50' : 'hover:bg-red-900/30'
                        }`}
                        onClick={() => put && handleContractClick(put)}
                      >
                        <span className="font-mono text-red-400">{formatPrice(put?.quote?.bid)}</span>
                      </TableCell>
                      {/* Put OI with heat map */}
                      <TableCell 
                        className="text-right text-xs"
                        style={{ 
                          backgroundColor: `rgba(239, 68, 68, ${putOIIntensity * 0.3})` 
                        }}
                      >
                        {putOI > 0 ? putOI.toLocaleString() : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Grid View - Card-based layout */}
        {filteredChain.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-2 gap-3">
            {/* Calls Column */}
            <div className="space-y-2">
              <div className="text-center text-green-400 font-medium text-sm mb-2">📈 Calls</div>
              {calls.slice(0, 10).map((entry) => (
                <div
                  key={entry.contract.symbol}
                  onClick={() => handleContractClick(entry)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    entry === selectedContract 
                      ? 'bg-green-900/50 border border-green-500' 
                      : 'bg-gray-800 hover:bg-gray-750 border border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">${entry.contract.strike}</span>
                    <Badge variant={getMoneyness(entry.contract.strike) === 'ITM' ? 'success' : 'secondary'} className="text-[10px]">
                      {getMoneyness(entry.contract.strike)}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Bid</span>
                    <span className="font-mono text-green-400">${entry.quote?.bid.toFixed(2) || '-'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2 text-xs text-center">
                    <div>
                      <div className="text-gray-500">Δ</div>
                      <div className="text-green-400">{entry.greeks?.delta.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Θ</div>
                      <div className="text-red-400">{entry.greeks?.theta.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">IV</div>
                      <div className="text-blue-400">{entry.greeks?.iv ? `${(entry.greeks.iv * 100).toFixed(0)}%` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">OI</div>
                      <div className="text-gray-300">{entry.contract.openInterest || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Puts Column */}
            <div className="space-y-2">
              <div className="text-center text-red-400 font-medium text-sm mb-2">📉 Puts</div>
              {puts.slice(0, 10).map((entry) => (
                <div
                  key={entry.contract.symbol}
                  onClick={() => handleContractClick(entry)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    entry === selectedContract 
                      ? 'bg-red-900/50 border border-red-500' 
                      : 'bg-gray-800 hover:bg-gray-750 border border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">${entry.contract.strike}</span>
                    <Badge variant={getMoneyness(entry.contract.strike) === 'ITM' ? 'destructive' : 'secondary'} className="text-[10px]">
                      {getMoneyness(entry.contract.strike)}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Bid</span>
                    <span className="font-mono text-red-400">${entry.quote?.bid.toFixed(2) || '-'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2 text-xs text-center">
                    <div>
                      <div className="text-gray-500">Δ</div>
                      <div className="text-red-400">{entry.greeks?.delta.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Θ</div>
                      <div className="text-red-400">{entry.greeks?.theta.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">IV</div>
                      <div className="text-blue-400">{entry.greeks?.iv ? `${(entry.greeks.iv * 100).toFixed(0)}%` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">OI</div>
                      <div className="text-gray-300">{entry.contract.openInterest || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && filteredChain.length === 0 && symbol && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-400 mb-2">
              No options contracts found for <strong className="text-white">{symbol}</strong>
            </p>
            <p className="text-gray-500 text-sm">
              Try adjusting filters or searching a different symbol
            </p>
          </div>
        )}

        {!loading && !symbol && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📈</div>
            <p className="text-gray-400 mb-2">
              Enter a symbol to view options chain
            </p>
            <p className="text-gray-500 text-sm">
              Popular: {POPULAR_SYMBOLS.join(', ')}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-gray-400 text-sm">Loading options chain...</p>
          </div>
        )}

        {/* Legend */}
        {filteredChain.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span><span className="inline-block w-3 h-3 bg-green-500/30 rounded mr-1"></span> High Call OI</span>
              <span><span className="inline-block w-3 h-3 bg-red-500/30 rounded mr-1"></span> High Put OI</span>
              <span><span className="inline-block w-3 h-3 bg-yellow-900/50 rounded mr-1"></span> ATM</span>
            </div>
            <span>Click bid price to select contract</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
