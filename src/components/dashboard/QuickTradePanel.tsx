'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Calculator,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface SymbolQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
}

interface QuickTradePanelProps {
  portfolioValue?: number;
  allowedSymbols?: string[];
  onSubmit?: (order: OrderData) => Promise<void>;
}

interface OrderData {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
}

const POPULAR_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'META', 'AMD'];

export function QuickTradePanel({ 
  portfolioValue = 100000, 
  allowedSymbols = POPULAR_SYMBOLS,
  onSubmit 
}: QuickTradePanelProps) {
  // Form state
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [quantity, setQuantity] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [stopPrice, setStopPrice] = useState<string>('');
  
  // UI state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>([]);
  const [quote, setQuote] = useState<SymbolQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSizeCalculator, setShowSizeCalculator] = useState(false);
  const [riskPercent, setRiskPercent] = useState(2);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Filter symbols for autocomplete
  useEffect(() => {
    if (symbol.length > 0) {
      const filtered = allowedSymbols.filter(s => 
        s.toLowerCase().startsWith(symbol.toLowerCase())
      ).slice(0, 8);
      setFilteredSymbols(filtered);
      setShowAutocomplete(filtered.length > 0 && symbol !== filtered[0]);
    } else {
      setFilteredSymbols(POPULAR_SYMBOLS.slice(0, 8));
      setShowAutocomplete(false);
    }
  }, [symbol, allowedSymbols]);

  // Fetch quote when symbol changes
  const fetchQuote = useCallback(async (sym: string) => {
    if (!sym || sym.length < 1) {
      setQuote(null);
      return;
    }
    
    setLoadingQuote(true);
    try {
      // Simulated quote fetch - replace with actual API
      const res = await fetch(`/api/positions?symbol=${sym.toUpperCase()}`);
      const data = await res.json();
      
      // For demo, generate mock quote if not available
      if (data.success && data.data.positions?.length > 0) {
        const pos = data.data.positions[0];
        setQuote({
          symbol: sym.toUpperCase(),
          price: pos.currentPrice,
          change: pos.unrealizedPL / pos.quantity,
          changePercent: pos.changeToday,
        });
      } else {
        // Mock data for demo
        setQuote({
          symbol: sym.toUpperCase(),
          price: 100 + Math.random() * 400,
          change: (Math.random() - 0.5) * 10,
          changePercent: (Math.random() - 0.5) * 5,
        });
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (symbol.length >= 1) {
        fetchQuote(symbol);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [symbol, fetchQuote]);

  // Calculate position size based on risk
  const calculatePositionSize = useCallback(() => {
    if (!quote || !portfolioValue) return 0;
    const riskAmount = portfolioValue * (riskPercent / 100);
    return Math.floor(riskAmount / quote.price);
  }, [quote, portfolioValue, riskPercent]);

  // Handle symbol selection
  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setShowAutocomplete(false);
    inputRef.current?.focus();
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!symbol || quantity <= 0) return;
    
    setSubmitting(true);
    try {
      const order: OrderData = {
        symbol: symbol.toUpperCase(),
        side,
        type: orderType,
        quantity,
      };
      
      if (orderType === 'limit' && limitPrice) {
        order.limitPrice = parseFloat(limitPrice);
      }
      if (orderType === 'stop' && stopPrice) {
        order.stopPrice = parseFloat(stopPrice);
      }
      
      if (onSubmit) {
        await onSubmit(order);
      }
      
      // Reset form after successful submission
      setSymbol('');
      setQuantity(0);
      setLimitPrice('');
      setStopPrice('');
      setQuote(null);
    } catch (error) {
      console.error('Error submitting order:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const estimatedTotal = quote ? quantity * quote.price : 0;
  const isValid = symbol && quantity > 0 && (orderType === 'market' || limitPrice || stopPrice);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Quick Trade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Symbol Search */}
        <div className="relative" ref={autocompleteRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search symbol..."
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onFocus={() => setShowAutocomplete(filteredSymbols.length > 0)}
              className="pl-9 h-11 text-lg font-mono"
            />
          </div>
          
          {/* Autocomplete Dropdown */}
          {showAutocomplete && (
            <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
              {filteredSymbols.map((sym) => (
                <button
                  key={sym}
                  className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between"
                  onClick={() => selectSymbol(sym)}
                >
                  <span className="font-mono font-medium">{sym}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quote Display */}
        {quote && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{quote.symbol}</span>
              <div className="text-right">
                <span className="text-xl font-bold">${quote.price.toFixed(2)}</span>
                <div className={`text-sm flex items-center justify-end gap-1 ${
                  quote.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {quote.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        )}
        {loadingQuote && (
          <div className="p-3 bg-muted/50 rounded-lg animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2"></div>
          </div>
        )}

        {/* Side Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={side === 'buy' ? 'default' : 'outline'}
            onClick={() => setSide('buy')}
            className={`h-12 text-lg ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            BUY
          </Button>
          <Button
            variant={side === 'sell' ? 'default' : 'outline'}
            onClick={() => setSide('sell')}
            className={`h-12 text-lg ${side === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}`}
          >
            SELL
          </Button>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-3 gap-2">
          {(['market', 'limit', 'stop'] as const).map((type) => (
            <Button
              key={type}
              variant={orderType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderType(type)}
              className="h-9"
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>

        {/* Limit/Stop Price */}
        {orderType === 'limit' && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Limit Price</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="h-10 font-mono"
            />
          </div>
        )}
        {orderType === 'stop' && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Stop Price</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              className="h-10 font-mono"
            />
          </div>
        )}

        {/* Quantity with Calculator */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-muted-foreground">Quantity</label>
            <button
              onClick={() => setShowSizeCalculator(!showSizeCalculator)}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              <Calculator className="h-3 w-3" />
              Size Calculator
              {showSizeCalculator ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
          <Input
            type="number"
            min="1"
            placeholder="0"
            value={quantity || ''}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            className="h-10 font-mono text-lg"
          />
          
          {/* Position Size Calculator */}
          {showSizeCalculator && (
            <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Risk:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 5, 10].map((pct) => (
                    <Button
                      key={pct}
                      variant={riskPercent === pct ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRiskPercent(pct)}
                      className="h-7 px-2 text-xs"
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Risk Amount:</span>
                <span className="font-medium">${(portfolioValue * riskPercent / 100).toFixed(2)}</span>
              </div>
              {quote && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-8"
                  onClick={() => setQuantity(calculatePositionSize())}
                >
                  Apply: {calculatePositionSize()} shares
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Quick Quantity Buttons */}
        <div className="flex gap-2">
          {[10, 25, 50, 100].map((qty) => (
            <Button
              key={qty}
              variant="outline"
              size="sm"
              onClick={() => setQuantity(qty)}
              className="flex-1 h-8"
            >
              {qty}
            </Button>
          ))}
        </div>

        {/* Order Summary */}
        {quantity > 0 && quote && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated Total:</span>
              <span className="font-bold">${estimatedTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Portfolio %:</span>
              <span>{((estimatedTotal / portfolioValue) * 100).toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          className={`w-full h-12 text-lg font-bold ${
            side === 'buy' 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-red-600 hover:bg-red-700'
          }`}
          disabled={!isValid || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            'Submitting...'
          ) : (
            <>
              {side === 'buy' ? 'BUY' : 'SELL'} {quantity > 0 ? quantity : ''} {symbol || 'Select Symbol'}
            </>
          )}
        </Button>

        {/* Warning for large positions */}
        {estimatedTotal > portfolioValue * 0.2 && (
          <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded text-yellow-700 dark:text-yellow-400 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>This position exceeds 20% of portfolio value. Consider reducing size.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
