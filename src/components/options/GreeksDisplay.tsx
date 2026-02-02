'use client';

import { useState } from 'react';
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
  compact?: boolean;
}

// Tooltip component for Greeks explanations
function GreekTooltip({ 
  children, 
  content, 
  visible, 
  onToggle 
}: { 
  children: React.ReactNode; 
  content: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <div 
        onClick={onToggle}
        className="cursor-help"
      >
        {children}
      </div>
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-lg w-64 text-sm text-gray-300">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
}

export function GreeksDisplay({ 
  greeks, 
  contractSize = 100,
  quantity = 1,
  showExplanations = true,
  compact = false,
}: GreeksDisplayProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  if (!greeks) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">Greeks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-gray-400">
              Select an option contract to view Greeks
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const greekItems = [
    {
      key: 'delta',
      name: 'Delta (Δ)',
      emoji: '📈',
      value: greeks.delta,
      format: (v: number) => v.toFixed(4),
      notional: greeks.delta * contractSize * quantity,
      notionalFormat: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} shares`,
      color: greeks.delta >= 0 ? 'text-green-400' : 'text-red-400',
      bgColor: greeks.delta >= 0 ? 'bg-green-500' : 'bg-red-500',
      explanation: 'Delta measures how much the option price changes for every $1 move in the stock. A delta of 0.50 means the option gains $0.50 when the stock rises $1. For calls, delta is positive (0 to 1); for puts, it\'s negative (-1 to 0).',
      gauge: Math.abs(greeks.delta) * 100,
    },
    {
      key: 'gamma',
      name: 'Gamma (Γ)',
      emoji: '⚡',
      value: greeks.gamma,
      format: (v: number) => v.toFixed(4),
      notional: greeks.gamma * contractSize * quantity,
      notionalFormat: (v: number) => `${v.toFixed(2)} Δ/$1`,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500',
      explanation: 'Gamma measures how fast delta changes. High gamma means delta will shift rapidly with price moves - great for speculation, risky for sellers. Gamma is highest for at-the-money options near expiration.',
      gauge: Math.min(greeks.gamma * 1000, 100),
    },
    {
      key: 'theta',
      name: 'Theta (Θ)',
      emoji: '⏱️',
      value: greeks.theta,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.theta * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/day`,
      color: greeks.theta >= 0 ? 'text-green-400' : 'text-red-400',
      bgColor: 'bg-red-500',
      explanation: 'Theta is time decay - how much value the option loses each day. It\'s usually negative for buyers (you lose money daily) and positive for sellers (you profit from decay). Theta accelerates as expiration approaches.',
      gauge: Math.min(Math.abs(greeks.theta) * 10, 100),
    },
    {
      key: 'vega',
      name: 'Vega (ν)',
      emoji: '🌊',
      value: greeks.vega,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.vega * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/1% IV`,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500',
      explanation: 'Vega measures sensitivity to volatility changes. When IV rises 1%, the option price increases by vega. High vega options benefit from volatility expansion, making them good plays before earnings or events.',
      gauge: Math.min(greeks.vega * 5, 100),
    },
  ];

  if (greeks.rho !== undefined) {
    greekItems.push({
      key: 'rho',
      name: 'Rho (ρ)',
      emoji: '💵',
      value: greeks.rho,
      format: (v: number) => `$${v.toFixed(2)}`,
      notional: greeks.rho * contractSize * quantity,
      notionalFormat: (v: number) => `$${v.toFixed(2)}/1% rate`,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500',
      explanation: 'Rho measures sensitivity to interest rate changes. It\'s typically small and less important for short-term options. Calls have positive rho (benefit from rate hikes), puts have negative rho.',
      gauge: Math.min(Math.abs(greeks.rho) * 20, 100),
    });
  }

  // IV Rank simulation (would need historical data for real calculation)
  const ivRank = Math.min(100, Math.max(0, (greeks.impliedVolatility - 0.15) / 0.5 * 100));
  const ivLevel = ivRank > 70 ? 'High' : ivRank > 30 ? 'Normal' : 'Low';
  const ivColor = ivRank > 70 ? 'text-red-400' : ivRank > 30 ? 'text-yellow-400' : 'text-green-400';

  if (compact) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            {greekItems.slice(0, 4).map((item) => (
              <div key={item.key} className="text-center">
                <div className="text-xs text-gray-500">{item.name.split(' ')[0]}</div>
                <div className={`font-mono font-bold ${item.color}`}>
                  {item.format(item.value)}
                </div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-xs text-gray-500">IV</div>
              <div className={`font-mono font-bold ${ivColor}`}>
                {(greeks.impliedVolatility * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📊 Greeks</span>
          <span className={`text-sm font-normal ${ivColor}`}>
            IV: {(greeks.impliedVolatility * 100).toFixed(1)}% ({ivLevel})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* IV Visualization */}
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400 flex items-center gap-1">
              <span>📉</span> Implied Volatility
            </span>
            <span className={`font-bold ${ivColor}`}>{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
          </div>
          <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-yellow-500 to-red-600 opacity-30" />
            {/* IV marker */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg"
              style={{ left: `${Math.min(greeks.impliedVolatility * 200, 100)}%` }}
            />
            {/* Fill */}
            <div 
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full"
              style={{ width: `${Math.min(greeks.impliedVolatility * 200, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%+</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {ivLevel === 'High' && '⚠️ IV is elevated - options are expensive. Good time to sell premium.'}
            {ivLevel === 'Normal' && '✓ IV is in normal range. Neutral conditions.'}
            {ivLevel === 'Low' && '💡 IV is low - options are cheap. Good time to buy premium.'}
          </p>
        </div>

        {/* Greeks Grid */}
        <div className="grid grid-cols-2 gap-3">
          {greekItems.map((item) => (
            <GreekTooltip
              key={item.key}
              content={item.explanation}
              visible={activeTooltip === item.key}
              onToggle={() => setActiveTooltip(activeTooltip === item.key ? null : item.key)}
            >
              <div className="bg-gray-800 rounded-lg p-3 hover:bg-gray-750 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-300 flex items-center gap-1">
                    <span>{item.emoji}</span>
                    <span>{item.name}</span>
                    <span className="text-gray-600 text-xs">ⓘ</span>
                  </span>
                  <span className={`font-mono font-bold text-lg ${item.color}`}>
                    {item.format(item.value)}
                  </span>
                </div>
                
                {/* Visual gauge */}
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div 
                    className={`h-full rounded-full ${item.bgColor} transition-all duration-300`}
                    style={{ width: `${item.gauge}%` }}
                  />
                </div>

                <div className="text-xs text-gray-400">
                  Position: <span className="font-mono text-gray-300">{item.notionalFormat(item.notional)}</span>
                </div>
              </div>
            </GreekTooltip>
          ))}
        </div>

        {/* Summary */}
        {quantity > 1 && (
          <div className="pt-4 border-t border-gray-700">
            <p className="text-sm text-gray-400 mb-2">
              📋 Position totals for <strong className="text-white">{quantity}</strong> contract{quantity !== 1 ? 's' : ''}:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500">Delta Exposure</div>
                <div className={`font-mono font-bold ${greeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(greeks.delta * contractSize * quantity).toFixed(0)} shares
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500">Daily Theta</div>
                <div className={`font-mono font-bold ${greeks.theta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${(greeks.theta * contractSize * quantity).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Tips */}
        {showExplanations && (
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
            <p className="mb-1"><strong>💡 Quick Tips:</strong></p>
            <ul className="space-y-1 ml-3">
              <li>• <strong>Selling options?</strong> High theta + low delta = ideal for income</li>
              <li>• <strong>Buying options?</strong> Watch theta decay; aim for higher delta</li>
              <li>• Click any Greek for a detailed explanation</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
