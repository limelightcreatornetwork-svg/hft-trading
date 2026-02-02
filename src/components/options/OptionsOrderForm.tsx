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
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📝 Options Order</span>
          <Badge 
            variant={side === 'sell' ? 'destructive' : 'success'}
            className={side === 'sell' ? 'bg-red-900/50 text-red-400 border-red-700' : 'bg-green-900/50 text-green-400 border-green-700'}
          >
            {side === 'sell' ? '🔽 SELL' : '🔼 BUY'} TO OPEN
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Strategy Selection */}
          <div>
            <label className="text-sm text-gray-400">Strategy (Level 1)</label>
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
              className="mt-1 bg-gray-800 border-gray-700"
            />
          </div>

          {/* Contract Symbol */}
          <div>
            <label className="text-sm text-gray-400">Option Contract</label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL240119C00100000"
              className="mt-1 font-mono bg-gray-800 border-gray-700 text-white"
              disabled={loading}
            />
            {selectedContract && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedContract.contract.name}
              </p>
            )}
          </div>

          {/* Side and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400">Side</label>
              <Select
                value={side}
                onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
                options={[
                  { value: 'sell', label: '🔽 SELL' },
                  { value: 'buy', label: '🔼 BUY' },
                ]}
                className="mt-1 bg-gray-800 border-gray-700"
                disabled={loading || strategy !== 'custom'}
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Contracts</label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                step="1"
                className="mt-1 bg-gray-800 border-gray-700 text-white"
                disabled={loading}
              />
            </div>
          </div>

          {/* Order Type and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400">Order Type</label>
              <Select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
                options={[
                  { value: 'limit', label: '📊 LIMIT' },
                  { value: 'market', label: '⚡ MARKET' },
                ]}
                className="mt-1 bg-gray-800 border-gray-700"
                disabled={loading}
              />
            </div>
            {orderType === 'limit' && (
              <div>
                <label className="text-sm text-gray-400">Limit Price</label>
                <Input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="mt-1 bg-gray-800 border-gray-700 text-white"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Quote Info */}
          {selectedContract?.quote && (
            <div className="p-3 bg-gray-800 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Bid × Ask:</span>
                <span className="font-mono text-white">
                  <span className="text-green-400">${selectedContract.quote.bid.toFixed(2)}</span>
                  <span className="text-gray-500"> × </span>
                  <span className="text-red-400">${selectedContract.quote.ask.toFixed(2)}</span>
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Spread:</span>
                <span className={`font-mono ${(selectedContract.quote.ask - selectedContract.quote.bid) < 0.10 ? 'text-green-400' : 'text-yellow-400'}`}>
                  ${(selectedContract.quote.ask - selectedContract.quote.bid).toFixed(2)}
                  {(selectedContract.quote.ask - selectedContract.quote.bid) < 0.10 && ' ✓'}
                </span>
              </div>
              {selectedContract.greeks && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-700">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Delta</div>
                    <div className={`font-mono text-sm ${selectedContract.greeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedContract.greeks.delta.toFixed(3)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Theta</div>
                    <div className="font-mono text-sm text-red-400">
                      ${selectedContract.greeks.theta.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">IV</div>
                    <div className="font-mono text-sm text-blue-400">
                      {(selectedContract.greeks.iv * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Requirements Check */}
          {side === 'sell' && selectedContract && (
            <div className={`p-3 rounded-lg border ${
              (selectedContract.contract.type === 'call' && contractQty <= maxCoveredCalls) ||
              (selectedContract.contract.type === 'put' && hasSufficientCash)
                ? 'bg-green-900/30 border-green-700/50 text-green-300'
                : 'bg-red-900/30 border-red-700/50 text-red-300'
            }`}>
              {selectedContract.contract.type === 'call' ? (
                <div className="text-sm">
                  <strong className="flex items-center gap-1">
                    📞 Covered Call Requirements
                    {contractQty <= maxCoveredCalls && <span className="text-green-400">✓</span>}
                  </strong>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Shares owned:</span>
                      <span className="font-mono">{availableShares} ({maxCoveredCalls} contracts)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Requested:</span>
                      <span className="font-mono">{contractQty}</span>
                    </div>
                  </div>
                  {contractQty > maxCoveredCalls && (
                    <div className="text-red-400 font-medium mt-2 flex items-center gap-1">
                      ⚠️ Need {(contractQty - maxCoveredCalls) * 100} more shares
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm">
                  <strong className="flex items-center gap-1">
                    💵 Cash-Secured Put Requirements
                    {hasSufficientCash && <span className="text-green-400">✓</span>}
                  </strong>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cash required:</span>
                      <span className="font-mono">${cashRequired.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Buying power:</span>
                      <span className="font-mono">${buyingPower.toLocaleString()}</span>
                    </div>
                  </div>
                  {!hasSufficientCash && (
                    <div className="text-red-400 font-medium mt-2 flex items-center gap-1">
                      ⚠️ Need ${(cashRequired - buyingPower).toLocaleString()} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Premium Preview */}
          {estimatedPremium > 0 && (
            <div className={`p-4 rounded-lg border ${
              side === 'sell' 
                ? 'bg-green-900/30 border-green-700/50' 
                : 'bg-blue-900/30 border-blue-700/50'
            }`}>
              <div className="flex justify-between items-center">
                <span className={side === 'sell' ? 'text-green-300' : 'text-blue-300'}>
                  {side === 'sell' ? '💰 Premium Received:' : '💸 Total Cost:'}
                </span>
                <span className={`font-bold text-xl ${side === 'sell' ? 'text-green-400' : 'text-blue-400'}`}>
                  ${estimatedPremium.toFixed(2)}
                </span>
              </div>
              {side === 'sell' && (
                <p className="text-xs text-gray-500 mt-1">
                  This premium is credited to your account immediately
                </p>
              )}
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg text-sm flex items-center gap-2">
              <span>❌</span> {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm flex items-center gap-2">
              <span>✅</span> {success}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className={`w-full h-12 text-lg font-bold ${
              side === 'sell' 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
            disabled={loading || !canSubmit()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Submitting...
              </span>
            ) : (
              <span>
                {side === 'sell' ? '🔽' : '🔼'} {side.toUpperCase()} {contractQty} Contract{contractQty !== 1 ? 's' : ''}
              </span>
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            ⚠️ Options trading involves risk. Level 1 only supports covered calls and cash-secured puts.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
