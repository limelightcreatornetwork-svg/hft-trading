'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface TradeFormProps {
  onSubmit: (data: {
    symbol: string;
    side: string;
    quantity: number;
    orderType: string;
    limitPrice?: number;
  }) => void;
  loading: boolean;
  allowedSymbols: string[];
}

export function TradeForm({ onSubmit, loading, allowedSymbols }: TradeFormProps) {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState('buy');
  const [quantity, setQuantity] = useState('');
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !quantity) return;

    onSubmit({
      symbol: symbol.toUpperCase(),
      side,
      quantity: parseInt(quantity),
      orderType,
      limitPrice: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Trade</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Symbol</label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="mt-1"
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Quantity</label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="100"
                min="1"
                className="mt-1"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Side</label>
              <Select
                value={side}
                onChange={(e) => setSide(e.target.value)}
                options={[
                  { value: 'buy', label: 'BUY' },
                  { value: 'sell', label: 'SELL' },
                ]}
                className="mt-1"
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Order Type</label>
              <Select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                options={[
                  { value: 'market', label: 'MARKET' },
                  { value: 'limit', label: 'LIMIT' },
                ]}
                className="mt-1"
                disabled={loading}
              />
            </div>
          </div>

          {orderType === 'limit' && (
            <div>
              <label className="text-sm text-muted-foreground">Limit Price</label>
              <Input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="150.00"
                step="0.01"
                min="0"
                className="mt-1"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || !symbol || !quantity}
            >
              {loading ? 'Submitting...' : 'Submit Order'}
            </Button>
          </div>

          {allowedSymbols.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Allowed symbols:</p>
              <div className="flex flex-wrap gap-1">
                {allowedSymbols.map(s => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => setSymbol(s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
