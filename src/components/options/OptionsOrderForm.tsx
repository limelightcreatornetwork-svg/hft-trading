'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface SelectedContract {
  contract: {
    symbol: string;
    name: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
  };
  quote: {
    bid: number;
    ask: number;
    last: number;
  } | null;
  greeks: {
    delta: number;
    theta: number;
    iv: number;
  } | null;
}

interface OptionsOrderFormProps {
  selectedContract?: SelectedContract | null;
  positions?: Array<{ symbol: string; qty: string }>;
  buyingPower?: number;
  onOrderSubmit?: (result: { success: boolean; data?: unknown; error?: string }) => void;
}

type Strategy = 'covered_call' | 'cash_secured_put' | 'custom';

export function OptionsOrderForm({
  selectedContract,
  positions = [],
  buyingPower = 0,
  onOrderSubmit,
}: OptionsOrderFormProps) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [limitPrice, setLimitPrice] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Update form when contract is selected
  useEffect(() => {
    if (selectedContract) {
      setSymbol(selectedContract.contract.symbol);
      // Default to selling (covered call / cash secured put)
      setSide('sell');
      // Use mid price as default limit
      if (selectedContract.quote) {
        const midPrice = (selectedContract.quote.bid + selectedContract.quote.ask) / 2;
        setLimitPrice(midPrice.toFixed(2));
      }
      // Set strategy based on option type
      setStrategy(selectedContract.contract.type === 'call' ? 'covered_call' : 'cash_secured_put');
    }
  }, [selectedContract]);

  // Calculate requirements
  const contractQty = parseInt(quantity) || 0;
  const strike = selectedContract?.contract.strike || 0;
  const underlying = selectedContract?.contract.symbol.match(/^([A-Z]+)/)?.[1] || '';
  
  // For covered calls
  const sharesOwned = positions.find(p => p.symbol === underlying)?.qty;
  const availableShares = sharesOwned ? parseInt(sharesOwned) : 0;
  const maxCoveredCalls = Math.floor(availableShares / 100);
  
  // For cash-secured puts
  const cashRequired = strike * 100 * contractQty;
  const hasSufficientCash = buyingPower >= cashRequired;

  // Validation
  const canSubmit = () => {
    if (!symbol || !quantity || contractQty <= 0) return false;
    if (orderType === 'limit' && !limitPrice) return false;
    
    if (side === 'sell') {
      if (selectedContract?.contract.type === 'call' && contractQty > maxCoveredCalls) {
        return false;
      }
      if (selectedContract?.contract.type === 'put' && !hasSufficientCash) {
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/options/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          quantity: contractQty,
          side,
          type: orderType,
          limitPrice: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
          strategy,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit order');
      }

      setSuccess(`Order submitted successfully! Order ID: ${data.data?.order?.id}`);
      onOrderSubmit?.({ success: true, data: data.data });
      
      // Reset form
      setQuantity('1');
      setLimitPrice('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      onOrderSubmit?.({ success: false, error: message });
    } finally {
      setLoading(false);
    }
  };

  // Premium calculation
  const estimatedPremium = selectedContract?.quote && contractQty
    ? ((side === 'sell' ? selectedContract.quote.bid : selectedContract.quote.ask) * 100 * contractQty)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Options Order</span>
          <Badge variant={side === 'sell' ? 'destructive' : 'success'}>
            {side === 'sell' ? 'SELL' : 'BUY'} TO {side === 'sell' ? 'OPEN' : 'OPEN'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Strategy Selection */}
          <div>
            <label className="text-sm text-muted-foreground">Strategy (Level 1)</label>
            <Select
              value={strategy}
              onChange={(e) => {
                const val = e.target.value as Strategy;
                setStrategy(val);
                if (val === 'covered_call' || val === 'cash_secured_put') {
                  setSide('sell');
                }
              }}
              options={[
                { value: 'covered_call', label: '📞 Covered Call (Sell Call w/ Shares)' },
                { value: 'cash_secured_put', label: '💵 Cash-Secured Put (Sell Put w/ Cash)' },
                { value: 'custom', label: '⚙️ Custom' },
              ]}
              className="mt-1"
            />
          </div>

          {/* Contract Symbol */}
          <div>
            <label className="text-sm text-muted-foreground">Option Contract</label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL240119C00100000"
              className="mt-1 font-mono"
              disabled={loading}
            />
            {selectedContract && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedContract.contract.name}
              </p>
            )}
          </div>

          {/* Side and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Side</label>
              <Select
                value={side}
                onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
                options={[
                  { value: 'sell', label: 'SELL' },
                  { value: 'buy', label: 'BUY' },
                ]}
                className="mt-1"
                disabled={loading || strategy !== 'custom'}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Contracts</label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                step="1"
                className="mt-1"
                disabled={loading}
              />
            </div>
          </div>

          {/* Order Type and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Order Type</label>
              <Select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
                options={[
                  { value: 'limit', label: 'LIMIT' },
                  { value: 'market', label: 'MARKET' },
                ]}
                className="mt-1"
                disabled={loading}
              />
            </div>
            {orderType === 'limit' && (
              <div>
                <label className="text-sm text-muted-foreground">Limit Price</label>
                <Input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="mt-1"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Quote Info */}
          {selectedContract?.quote && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bid × Ask:</span>
                <span className="font-mono">
                  ${selectedContract.quote.bid.toFixed(2)} × ${selectedContract.quote.ask.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Spread:</span>
                <span className="font-mono">
                  ${(selectedContract.quote.ask - selectedContract.quote.bid).toFixed(2)}
                </span>
              </div>
              {selectedContract.greeks && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delta:</span>
                    <span className="font-mono">{selectedContract.greeks.delta.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Theta:</span>
                    <span className="font-mono text-red-600">
                      ${selectedContract.greeks.theta.toFixed(2)}/day
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IV:</span>
                    <span className="font-mono">{(selectedContract.greeks.iv * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Requirements Check */}
          {side === 'sell' && selectedContract && (
            <div className={`p-3 rounded-lg ${
              (selectedContract.contract.type === 'call' && contractQty <= maxCoveredCalls) ||
              (selectedContract.contract.type === 'put' && hasSufficientCash)
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}>
              {selectedContract.contract.type === 'call' ? (
                <div className="text-sm">
                  <strong>Covered Call Requirements:</strong>
                  <div>Shares owned: {availableShares} ({maxCoveredCalls} contracts max)</div>
                  <div>Contracts requested: {contractQty}</div>
                  {contractQty > maxCoveredCalls && (
                    <div className="text-red-600 font-medium mt-1">
                      ⚠️ Insufficient shares for covered call
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm">
                  <strong>Cash-Secured Put Requirements:</strong>
                  <div>Cash required: ${cashRequired.toLocaleString()}</div>
                  <div>Buying power: ${buyingPower.toLocaleString()}</div>
                  {!hasSufficientCash && (
                    <div className="text-red-600 font-medium mt-1">
                      ⚠️ Insufficient buying power for cash-secured put
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Premium Preview */}
          {estimatedPremium > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-blue-800">
                  {side === 'sell' ? 'Estimated Premium Received:' : 'Estimated Cost:'}
                </span>
                <span className="font-bold text-blue-800">
                  ${estimatedPremium.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !canSubmit()}
            variant={side === 'sell' ? 'destructive' : 'default'}
          >
            {loading ? 'Submitting...' : `${side.toUpperCase()} ${contractQty} Contract${contractQty !== 1 ? 's' : ''}`}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Options trading involves risk. Level 1 only supports covered calls and cash-secured puts.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
