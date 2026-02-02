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

// Moneyness filter options
type MoneynessFilter = 'all' | 'itm' | 'atm' | 'otm' | 'near-atm';

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
  
  // New filter states
  const [moneynessFilter, setMoneynessFilter] = useState<MoneynessFilter>('all');
  const [minVolume, setMinVolume] = useState(0);
  const [maxSpread, setMaxSpread] = useState(Infinity);
  const [minOpenInterest, setMinOpenInterest] = useState(0);
  const [showSpreadPercent, setShowSpreadPercent] = useState(true);

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

  // Helper to determine moneyness
  const getMoneyness = useCallback((strike: number, type: 'call' | 'put'): 'ITM' | 'ATM' | 'OTM' => {
    if (!stockPrice) return 'OTM';
    const pctDiff = Math.abs((strike - stockPrice) / stockPrice);
    
    if (pctDiff <= 0.02) return 'ATM';
    
    if (type === 'call') {
      return strike < stockPrice ? 'ITM' : 'OTM';
    } else {
      return strike > stockPrice ? 'ITM' : 'OTM';
    }
  }, [stockPrice]);

  // Filter chain by all criteria
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
      
      // Moneyness filter
      if (moneynessFilter !== 'all' && stockPrice) {
        const moneyness = getMoneyness(entry.contract.strike, entry.contract.type);
        const pctDiff = Math.abs((entry.contract.strike - stockPrice) / stockPrice);
        
        switch (moneynessFilter) {
          case 'itm':
            if (moneyness !== 'ITM') return false;
            break;
          case 'atm':
            if (moneyness !== 'ATM') return false;
            break;
          case 'otm':
            if (moneyness !== 'OTM') return false;
            break;
          case 'near-atm':
            if (pctDiff > 0.05) return false; // Within 5% of ATM
            break;
        }
      }
      
      // Volume filter
      const volume = entry.quote?.volume || entry.contract.volume || 0;
      if (volume < minVolume) return false;
      
      // Open Interest filter
      if (entry.contract.openInterest < minOpenInterest) return false;
      
      // Spread filter
      if (entry.quote && maxSpread !== Infinity) {
        const spread = entry.quote.ask - entry.quote.bid;
        const spreadPercent = entry.quote.bid > 0 ? (spread / entry.quote.bid) * 100 : Infinity;
        if (showSpreadPercent ? spreadPercent > maxSpread : spread > maxSpread) {
          return false;
        }
      }
      
      return true;
    });
  }, [chain, selectedExpiration, deltaRange, moneynessFilter, stockPrice, minVolume, minOpenInterest, maxSpread, showSpreadPercent, getMoneyness]);

  // Separate calls and puts
  const calls = filteredChain.filter(e => e.contract.type === 'call');
  const puts = filteredChain.filter(e => e.contract.type === 'put');

  // Get unique strikes
  const strikes = [...new Set(filteredChain.map(e => e.contract.strike))].sort((a, b) => a - b);

  // Calculate max open interest for heat map
  const maxOI = useMemo(() => {
    return Math.max(...filteredChain.map(e => e.contract.openInterest || 0), 1);
  }, [filteredChain]);

  // Calculate average IV
  const avgIV = useMemo(() => {
    const withIV = filteredChain.filter(e => e.greeks?.iv);
    if (withIV.length === 0) return null;
    return withIV.reduce((sum, e) => sum + (e.greeks?.iv || 0), 0) / withIV.length;
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

  const getSpreadDisplay = (quote: OptionsChainEntry['quote']) => {
    if (!quote) return '-';
    const spread = quote.ask - quote.bid;
    const spreadPct = quote.bid > 0 ? (spread / quote.bid) * 100 : 0;
    return showSpreadPercent ? `${spreadPct.toFixed(1)}%` : `$${spread.toFixed(2)}`;
  };

  const getSpreadColor = (quote: OptionsChainEntry['quote']) => {
    if (!quote) return 'text-gray-500';
    const spreadPct = quote.bid > 0 ? ((quote.ask - quote.bid) / quote.bid) * 100 : 100;
    if (spreadPct <= 5) return 'text-green-400';
    if (spreadPct <= 10) return 'text-yellow-400';
    return 'text-red-400';
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
              {avgIV && (
                <span className="text-sm font-normal text-yellow-400">
                  Avg IV: {(avgIV * 100).toFixed(1)}%
                </span>
              )}
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

        {/* Expiration Tabs */}
        {expirations.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-400">Expiration:</span>
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-1">
                  {expirations.slice(0, 8).map(exp => {
                    const dte = getDaysToExpiry(exp);
                    const isSelected = exp === selectedExpiration;
                    return (
                      <button
                        key={exp}
                        onClick={() => setSelectedExpiration(exp)}
                        className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        {new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span className={`ml-1 ${dte <= 7 ? 'text-orange-400' : ''}`}>
                          ({dte}d)
                        </span>
                      </button>
                    );
                  })}
                  {expirations.length > 8 && (
                    <Select
                      value={selectedExpiration}
                      onChange={(e) => setSelectedExpiration(e.target.value)}
                      options={expirations.slice(8).map(exp => ({
                        value: exp,
                        label: `${new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${getDaysToExpiry(exp)}d)`,
                      }))}
                      className="bg-gray-800 border-gray-700 text-xs"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters Row */}
        {expirations.length > 0 && (
          <div className="space-y-3 mb-4">
            <div className="flex gap-4 items-end">
              {/* Type Filter */}
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Type</label>
                <div className="flex gap-1">
                  {(['all', 'call', 'put'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setOptionType(t)}
                      className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        optionType === t
                          ? t === 'call' ? 'bg-green-600 text-white' : t === 'put' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {t === 'all' ? '📊 All' : t === 'call' ? '📈 Calls' : '📉 Puts'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Moneyness Filter */}
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Moneyness</label>
                <div className="flex gap-1">
                  {([
                    { value: 'all', label: 'All' },
                    { value: 'near-atm', label: 'Near ATM' },
                    { value: 'itm', label: 'ITM' },
                    { value: 'otm', label: 'OTM' },
                  ] as const).map(m => (
                    <button
                      key={m.value}
                      onClick={() => setMoneynessFilter(m.value)}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                        moneynessFilter === m.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

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

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Delta Range */}
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-400">Delta Range</span>
                      <span className="text-gray-300">
                        {(deltaRange[0] * 100).toFixed(0)}% - {(deltaRange[1] * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Slider
                        value={deltaRange[0]}
                        onChange={(val) => setDeltaRange([val, Math.max(val, deltaRange[1])])}
                        min={0}
                        max={1}
                        step={0.05}
                        showValue={false}
                      />
                      <Slider
                        value={deltaRange[1]}
                        onChange={(val) => setDeltaRange([Math.min(deltaRange[0], val), val])}
                        min={0}
                        max={1}
                        step={0.05}
                        showValue={false}
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button 
                        onClick={() => setDeltaRange([0.15, 0.35])}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        📞 Covered Call
                      </button>
                      <button 
                        onClick={() => setDeltaRange([0.25, 0.35])}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        💵 CSP Sweet Spot
                      </button>
                      <button 
                        onClick={() => setDeltaRange([0.40, 0.60])}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        🎯 ATM (40-60Δ)
                      </button>
                      <button 
                        onClick={() => setDeltaRange([0, 1])}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Spread Filter */}
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-400">
                        Max Spread ({showSpreadPercent ? '%' : '$'})
                        <button 
                          onClick={() => setShowSpreadPercent(!showSpreadPercent)}
                          className="ml-1 text-blue-400 hover:text-blue-300"
                        >
                          [toggle]
                        </button>
                      </span>
                      <span className="text-gray-300">
                        {maxSpread === Infinity ? 'Any' : showSpreadPercent ? `${maxSpread}%` : `$${maxSpread}`}
                      </span>
                    </div>
                    <Slider
                      value={maxSpread === Infinity ? 50 : maxSpread}
                      onChange={(val) => setMaxSpread(val >= 50 ? Infinity : val)}
                      min={1}
                      max={50}
                      step={1}
                      showValue={false}
                    />
                    <div className="flex gap-2 mt-2">
                      <button 
                        onClick={() => setMaxSpread(5)}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        Tight (≤5%)
                      </button>
                      <button 
                        onClick={() => setMaxSpread(10)}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        Normal (≤10%)
                      </button>
                      <button 
                        onClick={() => setMaxSpread(Infinity)}
                        className="px-2 py-1 text-[10px] bg-gray-700 rounded hover:bg-gray-600"
                      >
                        Any
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Volume Filter */}
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-400">Min Volume</span>
                      <span className="text-gray-300">{minVolume > 0 ? minVolume.toLocaleString() : 'Any'}</span>
                    </div>
                    <Slider
                      value={minVolume}
                      onChange={setMinVolume}
                      min={0}
                      max={1000}
                      step={50}
                      showValue={false}
                    />
                  </div>

                  {/* Open Interest Filter */}
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-400">Min Open Interest</span>
                      <span className="text-gray-300">{minOpenInterest > 0 ? minOpenInterest.toLocaleString() : 'Any'}</span>
                    </div>
                    <Slider
                      value={minOpenInterest}
                      onChange={setMinOpenInterest}
                      min={0}
                      max={5000}
                      step={100}
                      showValue={false}
                    />
                  </div>
                </div>

                {/* Quick Filter Presets */}
                <div className="pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-400 mb-2">Quick Presets:</div>
                  <div className="flex gap-2 flex-wrap">
                    <button 
                      onClick={() => {
                        setDeltaRange([0.15, 0.35]);
                        setMaxSpread(10);
                        setMinOpenInterest(100);
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-600 rounded hover:bg-blue-500"
                    >
                      🎯 Best for Selling
                    </button>
                    <button 
                      onClick={() => {
                        setDeltaRange([0.40, 0.60]);
                        setMaxSpread(5);
                        setMinVolume(100);
                      }}
                      className="px-3 py-1.5 text-xs bg-green-600 rounded hover:bg-green-500"
                    >
                      📈 Best for Buying
                    </button>
                    <button 
                      onClick={() => {
                        setMoneynessFilter('near-atm');
                        setMinOpenInterest(500);
                        setMaxSpread(10);
                      }}
                      className="px-3 py-1.5 text-xs bg-purple-600 rounded hover:bg-purple-500"
                    >
                      💧 High Liquidity
                    </button>
                    <button 
                      onClick={() => {
                        setDeltaRange([0, 1]);
                        setMaxSpread(Infinity);
                        setMinVolume(0);
                        setMinOpenInterest(0);
                        setMoneynessFilter('all');
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-600 rounded hover:bg-gray-500"
                    >
                      🔄 Reset All
                    </button>
                  </div>
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
              📊 {filteredChain.length} contracts
              {chain.length !== filteredChain.length && ` (${chain.length - filteredChain.length} filtered out)`}
              {selectedExpiration && ` | ${getDaysToExpiry(selectedExpiration)} DTE`}
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
                  <TableHead colSpan={8} className="text-center bg-green-900/30 text-green-400 border-b border-gray-700">
                    📈 CALLS
                  </TableHead>
                  <TableHead className="text-center bg-gray-800 border-x border-gray-700">Strike</TableHead>
                  <TableHead colSpan={8} className="text-center bg-red-900/30 text-red-400 border-b border-gray-700">
                    📉 PUTS
                  </TableHead>
                </TableRow>
                <TableRow className="border-gray-700 text-gray-400">
                  {/* Call columns */}
                  <TableHead className="text-right text-xs">Vol</TableHead>
                  <TableHead className="text-right text-xs">OI</TableHead>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                  <TableHead className="text-right text-xs">Sprd</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-right text-xs">Θ</TableHead>
                  <TableHead className="text-right text-xs">IV</TableHead>
                  {/* Strike */}
                  <TableHead className="text-center font-bold text-white">Strike</TableHead>
                  {/* Put columns */}
                  <TableHead className="text-right text-xs">IV</TableHead>
                  <TableHead className="text-right text-xs">Θ</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-right text-xs">Sprd</TableHead>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                  <TableHead className="text-right text-xs">OI</TableHead>
                  <TableHead className="text-right text-xs">Vol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {strikes.map((strike) => {
                  const call = calls.find(c => c.contract.strike === strike);
                  const put = puts.find(p => p.contract.strike === strike);
                  const moneyness = stockPrice ? getMoneyness(strike, 'call') : null;
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
                      {/* Call Volume */}
                      <TableCell className="text-right text-xs text-gray-400">
                        {call?.quote?.volume || call?.contract.volume || '-'}
                      </TableCell>
                      {/* Call OI with heat map */}
                      <TableCell 
                        className="text-right text-xs"
                        style={{ 
                          backgroundColor: `rgba(34, 197, 94, ${callOIIntensity * 0.3})` 
                        }}
                      >
                        {callOI > 0 ? callOI.toLocaleString() : '-'}
                      </TableCell>
                      {/* Call bid */}
                      <TableCell 
                        className={`text-right cursor-pointer transition-colors ${
                          call === selectedContract ? 'bg-green-900/50' : 'hover:bg-green-900/30'
                        }`}
                        onClick={() => call && handleContractClick(call)}
                      >
                        <span className="font-mono text-green-400">{formatPrice(call?.quote?.bid)}</span>
                      </TableCell>
                      {/* Call ask */}
                      <TableCell className="text-right">
                        <span className="font-mono text-gray-300">{formatPrice(call?.quote?.ask)}</span>
                      </TableCell>
                      {/* Call spread */}
                      <TableCell className={`text-right text-xs ${getSpreadColor(call?.quote || null)}`}>
                        {getSpreadDisplay(call?.quote || null)}
                      </TableCell>
                      {/* Call delta */}
                      <TableCell className="text-right text-xs">
                        <span className={call?.greeks?.delta && call.greeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatGreek(call?.greeks?.delta, 2)}
                        </span>
                      </TableCell>
                      {/* Call theta */}
                      <TableCell className="text-right text-xs text-red-400">
                        {formatGreek(call?.greeks?.theta, 2)}
                      </TableCell>
                      {/* Call IV */}
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
                      
                      {/* Put IV */}
                      <TableCell className="text-right text-xs text-blue-400">
                        {put?.greeks?.iv ? `${(put.greeks.iv * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                      {/* Put theta */}
                      <TableCell className="text-right text-xs text-red-400">
                        {formatGreek(put?.greeks?.theta, 2)}
                      </TableCell>
                      {/* Put delta */}
                      <TableCell className="text-right text-xs">
                        <span className={put?.greeks?.delta && put.greeks.delta < 0 ? 'text-red-400' : 'text-green-400'}>
                          {formatGreek(put?.greeks?.delta, 2)}
                        </span>
                      </TableCell>
                      {/* Put spread */}
                      <TableCell className={`text-right text-xs ${getSpreadColor(put?.quote || null)}`}>
                        {getSpreadDisplay(put?.quote || null)}
                      </TableCell>
                      {/* Put ask */}
                      <TableCell className="text-right">
                        <span className="font-mono text-gray-300">{formatPrice(put?.quote?.ask)}</span>
                      </TableCell>
                      {/* Put bid */}
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
                      {/* Put Volume */}
                      <TableCell className="text-right text-xs text-gray-400">
                        {put?.quote?.volume || put?.contract.volume || '-'}
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
              {calls.slice(0, 10).map((entry) => {
                const moneyness = stockPrice ? getMoneyness(entry.contract.strike, 'call') : null;
                return (
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
                      <Badge variant={moneyness === 'ITM' ? 'success' : 'secondary'} className="text-[10px]">
                        {moneyness}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Bid</span>
                      <span className="font-mono text-green-400">${entry.quote?.bid.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-500">Spread</span>
                      <span className={getSpreadColor(entry.quote)}>{getSpreadDisplay(entry.quote)}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-xs text-center">
                      <div>
                        <div className="text-gray-500">Δ</div>
                        <div className="text-green-400">{entry.greeks?.delta.toFixed(2) || '-'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Γ</div>
                        <div className="text-purple-400">{entry.greeks?.gamma.toFixed(3) || '-'}</div>
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
                );
              })}
            </div>
            
            {/* Puts Column */}
            <div className="space-y-2">
              <div className="text-center text-red-400 font-medium text-sm mb-2">📉 Puts</div>
              {puts.slice(0, 10).map((entry) => {
                const moneyness = stockPrice ? getMoneyness(entry.contract.strike, 'put') : null;
                return (
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
                      <Badge variant={moneyness === 'ITM' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {moneyness}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Bid</span>
                      <span className="font-mono text-red-400">${entry.quote?.bid.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-500">Spread</span>
                      <span className={getSpreadColor(entry.quote)}>{getSpreadDisplay(entry.quote)}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-xs text-center">
                      <div>
                        <div className="text-gray-500">Δ</div>
                        <div className="text-red-400">{entry.greeks?.delta.toFixed(2) || '-'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Γ</div>
                        <div className="text-purple-400">{entry.greeks?.gamma.toFixed(3) || '-'}</div>
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
                );
              })}
            </div>
          </div>
        )}

        {!loading && filteredChain.length === 0 && symbol && chain.length > 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-400 mb-2">
              No contracts match your filters
            </p>
            <p className="text-gray-500 text-sm mb-4">
              {chain.length} contracts available, but filtered out
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setDeltaRange([0, 1]);
                setMaxSpread(Infinity);
                setMinVolume(0);
                setMinOpenInterest(0);
                setMoneynessFilter('all');
              }}
            >
              Reset Filters
            </Button>
          </div>
        )}

        {!loading && filteredChain.length === 0 && symbol && chain.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-400 mb-2">
              No options contracts found for <strong className="text-white">{symbol}</strong>
            </p>
            <p className="text-gray-500 text-sm">
              Try a different symbol or expiration date
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
              <span className="text-green-400">●</span> Tight spread
              <span className="text-yellow-400">●</span> Normal spread
              <span className="text-red-400">●</span> Wide spread
            </div>
            <span>Click bid price to select contract</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
