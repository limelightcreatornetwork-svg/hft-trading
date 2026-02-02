'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
  impliedVolatility: number;
}

interface GreeksDisplayProps {
  greeks: Greeks | null;
  contractSize?: number;
  quantity?: number;
  showExplanations?: boolean;
}

export function GreeksDisplay({ 
  greeks, 
  contractSize = 100,
  quantity = 1,
  showExplanations = true,
}: GreeksDisplayProps) {
  if (!greeks) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Greeks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Select an option contract to view Greeks
          </p>
        </CardContent>
      </Card>
    );
  }

  const greekItems = [
    {
      name: 'Delta (Δ)',
      value: greeks.delta,
      format: (v: number) => v.toFixed(4),
      notional: greeks.delta * contractSize * quantity,
      notionalFormat: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} shares`,
      color: greeks.delta >= 0 ? 'text-green-600' : 'text-red-600',
      explanation: 'How much the option price changes for a $1 move in the underlying.',
      gauge: Math.abs(greeks.delta) * 100,
    },
    {
      name: 'Gamma (Γ)',
      value: greeks.gamma,
      format: (v: number) => v.toFixed(4),
      notional: greeks.gamma * contractSize * quantity,
      notionalFormat: (v: number) => `${v.toFixed(2)} Δ/$1`,
      color: 'text-purple-600',
      explanation: 'Rate of change in delta for a $1 move in the underlying.',
      gauge: Math.min(greeks.gamma * 1000, 100),
    },
    {
      name: 'Theta (Θ)',
      value: greeks.theta,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.theta * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/day`,
      color: 'text-red-600',
      explanation: 'Daily time decay - how much value the option loses each day.',
      gauge: Math.min(Math.abs(greeks.theta) * 10, 100),
    },
    {
      name: 'Vega (ν)',
      value: greeks.vega,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.vega * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/1% IV`,
      color: 'text-blue-600',
      explanation: 'Sensitivity to a 1% change in implied volatility.',
      gauge: Math.min(greeks.vega * 5, 100),
    },
  ];

  if (greeks.rho !== undefined) {
    greekItems.push({
      name: 'Rho (ρ)',
      value: greeks.rho,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.rho * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/1% rate`,
      color: 'text-orange-600',
      explanation: 'Sensitivity to a 1% change in interest rates.',
      gauge: Math.min(Math.abs(greeks.rho) * 20, 100),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Greeks</span>
          <span className="text-sm font-normal text-muted-foreground">
            IV: {(greeks.impliedVolatility * 100).toFixed(1)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* IV Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Implied Volatility</span>
            <span className="font-bold">{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{ width: `${Math.min(greeks.impliedVolatility * 200, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Greeks Grid */}
        <div className="grid grid-cols-2 gap-4">
          {greekItems.map((item) => (
            <div 
              key={item.name}
              className="p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium">{item.name}</span>
                <span className={`font-mono font-bold ${item.color}`}>
                  {item.format(item.value)}
                </span>
              </div>
              
              {/* Visual gauge */}
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div 
                  className={`h-full rounded-full ${
                    item.name.includes('Theta') ? 'bg-red-500' : 
                    item.name.includes('Delta') ? (item.value >= 0 ? 'bg-green-500' : 'bg-red-500') :
                    'bg-blue-500'
                  }`}
                  style={{ width: `${item.gauge}%` }}
                />
              </div>

              <div className="text-xs text-muted-foreground">
                Position: <span className="font-mono">{item.notionalFormat(item.notional)}</span>
              </div>

              {showExplanations && (
                <p className="text-xs text-muted-foreground mt-1 leading-tight">
                  {item.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        {quantity > 1 && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Totals for <strong>{quantity}</strong> contract{quantity !== 1 ? 's' : ''}:
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
              <div>Delta Exposure: <span className="font-mono">{(greeks.delta * contractSize * quantity).toFixed(0)} shares</span></div>
              <div>Daily Theta: <span className="font-mono text-red-600">${(greeks.theta * contractSize * quantity).toFixed(2)}</span></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
