'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';

interface OptionContract {
  symbol: string;
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  delta: number;
  theta: number;
  iv: number;
  openInterest: number;
  volume: number;
}

interface SmartContractPickerProps {
  contracts: OptionContract[];
  currentPrice: number;
  symbol: string;
  strategy: 'covered_call' | 'csp' | 'long_call' | 'long_put' | 'custom';
  onSelect: (contract: OptionContract) => void;
}

// Strategy presets
const STRATEGY_PRESETS = {
  covered_call: {
    name: 'Covered Call',
    emoji: '📞',
    targetDelta: { min: 0.15, max: 0.35 },
    targetDTE: { min: 21, max: 45 },
    description: 'Sell OTM calls for income on shares you own',
    tips: [
      'Target 0.20-0.30 delta for balance of premium vs assignment risk',
      '30-45 DTE captures most theta decay',
      'Avoid earnings dates within the expiration period',
    ],
  },
  csp: {
    name: 'Cash-Secured Put',
    emoji: '💵',
    targetDelta: { min: -0.35, max: -0.20 },
    targetDTE: { min: 21, max: 45 },
    description: 'Sell OTM puts to collect premium or buy stock cheaper',
    tips: [
      'Target 0.25-0.30 delta for ~70% win rate',
      '30-45 DTE optimal theta decay',
      'Only sell on stocks you want to own',
    ],
  },
  long_call: {
    name: 'Long Call',
    emoji: '📈',
    targetDelta: { min: 0.50, max: 0.70 },
    targetDTE: { min: 45, max: 90 },
    description: 'Buy calls for bullish directional bet with limited risk',
    tips: [
      'Higher delta (0.50-0.70) reduces time decay impact',
      'Longer DTE gives trade time to work',
      'Look for low IV to get cheaper premium',
    ],
  },
  long_put: {
    name: 'Long Put',
    emoji: '📉',
    targetDelta: { min: -0.70, max: -0.50 },
    targetDTE: { min: 45, max: 90 },
    description: 'Buy puts for bearish directional bet or portfolio hedge',
    tips: [
      'Higher delta (0.50-0.70) for directional trades',
      'Lower delta for cheap portfolio insurance',
      'Longer DTE reduces theta decay impact',
    ],
  },
  custom: {
    name: 'Custom',
    emoji: '⚙️',
    targetDelta: { min: 0, max: 1 },
    targetDTE: { min: 0, max: 365 },
    description: 'Set your own criteria',
    tips: [],
  },
};

// Score a contract based on strategy criteria
function scoreContract(
  contract: OptionContract,
  preset: typeof STRATEGY_PRESETS.covered_call,
  currentPrice: number,
): number {
  let score = 100;
  
  const dte = Math.ceil(
    (new Date(contract.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const absDelta = Math.abs(contract.delta);
  
  // Delta score (most important)
  const targetDeltaMid = (preset.targetDelta.max + preset.targetDelta.min) / 2;
  const deltaDeviation = Math.abs(absDelta - targetDeltaMid) / targetDeltaMid;
  score -= deltaDeviation * 40;
  
  // DTE score
  const targetDTEMid = (preset.targetDTE.max + preset.targetDTE.min) / 2;
  if (dte < preset.targetDTE.min || dte > preset.targetDTE.max) {
    score -= 20;
  } else {
    const dteDeviation = Math.abs(dte - targetDTEMid) / targetDTEMid;
    score -= dteDeviation * 15;
  }
  
  // Liquidity bonus (narrow spread, high OI)
  const spread = contract.ask - contract.bid;
  const spreadPct = contract.bid > 0 ? (spread / contract.bid) * 100 : 100;
  if (spreadPct < 5) score += 10;
  else if (spreadPct > 20) score -= 15;
  
  if (contract.openInterest > 1000) score += 5;
  if (contract.openInterest < 100) score -= 10;
  
  // Volume bonus
  if (contract.volume > 100) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

export function SmartContractPicker({
  contracts,
  currentPrice,
  symbol,
  strategy,
  onSelect,
}: SmartContractPickerProps) {
  const [customDelta, setCustomDelta] = useState<[number, number]>([0.20, 0.35]);
  const [customDTE, setCustomDTE] = useState<[number, number]>([30, 45]);
  const [showAll, setShowAll] = useState(false);

  const preset = STRATEGY_PRESETS[strategy];

  // Score and rank contracts
  const rankedContracts = useMemo(() => {
    const targetPreset = strategy === 'custom' 
      ? { ...preset, targetDelta: { min: customDelta[0], max: customDelta[1] }, targetDTE: { min: customDTE[0], max: customDTE[1] } }
      : preset;

    return contracts
      .map(contract => ({
        ...contract,
        score: scoreContract(contract, targetPreset, currentPrice),
        dte: Math.ceil((new Date(contract.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.score - a.score);
  }, [contracts, currentPrice, strategy, preset, customDelta, customDTE]);

  const topPicks = showAll ? rankedContracts : rankedContracts.slice(0, 5);
  const bestPick = rankedContracts[0];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-900/30';
    if (score >= 60) return 'text-yellow-400 bg-yellow-900/30';
    return 'text-red-400 bg-red-900/30';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { text: '⭐ Excellent', variant: 'success' as const };
    if (score >= 80) return { text: '✓ Great', variant: 'success' as const };
    if (score >= 70) return { text: '👍 Good', variant: 'secondary' as const };
    if (score >= 60) return { text: '⚠️ Fair', variant: 'warning' as const };
    return { text: '❌ Poor', variant: 'destructive' as const };
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>🎯 Smart Contract Picker</span>
          <Badge variant="outline" className="text-sm">
            {preset.emoji} {preset.name}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Info */}
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-sm text-gray-300">{preset.description}</p>
          {preset.tips.length > 0 && (
            <div className="mt-2 space-y-1">
              {preset.tips.map((tip, i) => (
                <p key={i} className="text-xs text-gray-500 flex items-start gap-1">
                  <span className="text-blue-400">💡</span>
                  <span>{tip}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Custom Criteria (for custom strategy) */}
        {strategy === 'custom' && (
          <div className="space-y-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Target Delta</span>
                <span className="text-gray-300">
                  {customDelta[0].toFixed(2)} - {customDelta[1].toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Slider
                  value={customDelta[0]}
                  onChange={(v) => setCustomDelta([v, Math.max(v, customDelta[1])])}
                  min={0}
                  max={1}
                  step={0.05}
                  showValue={false}
                />
                <Slider
                  value={customDelta[1]}
                  onChange={(v) => setCustomDelta([Math.min(customDelta[0], v), v])}
                  min={0}
                  max={1}
                  step={0.05}
                  showValue={false}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Target DTE</span>
                <span className="text-gray-300">
                  {customDTE[0]} - {customDTE[1]} days
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Slider
                  value={customDTE[0]}
                  onChange={(v) => setCustomDTE([v, Math.max(v, customDTE[1])])}
                  min={0}
                  max={180}
                  step={7}
                  showValue={false}
                />
                <Slider
                  value={customDTE[1]}
                  onChange={(v) => setCustomDTE([Math.min(customDTE[0], v), v])}
                  min={0}
                  max={180}
                  step={7}
                  showValue={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Best Pick Highlight */}
        {bestPick && (
          <div className="p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏆</span>
                <span className="font-bold text-white">Top Pick</span>
                <Badge variant={getScoreBadge(bestPick.score).variant}>
                  {getScoreBadge(bestPick.score).text}
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={() => onSelect(bestPick)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Select
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Strike</div>
                <div className="font-mono font-bold text-white">${bestPick.strike}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Expiry</div>
                <div className="font-mono text-white">
                  {new Date(bestPick.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  <span className="text-gray-500 ml-1">({bestPick.dte}d)</span>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Delta</div>
                <div className={`font-mono ${bestPick.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bestPick.delta.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Bid</div>
                <div className="font-mono text-green-400">${bestPick.bid.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Premium: </span>
                <span className="text-white">${(bestPick.bid * 100).toFixed(0)}</span>
              </div>
              <div>
                <span className="text-gray-500">Theta: </span>
                <span className="text-red-400">${bestPick.theta.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-500">IV: </span>
                <span className="text-blue-400">{(bestPick.iv * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-gray-500">OI: </span>
                <span className="text-gray-300">{bestPick.openInterest.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Alternatives List */}
        {topPicks.length > 1 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {showAll ? 'All Matches' : 'Top Alternatives'}
              </span>
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showAll ? 'Show Less' : `Show All (${rankedContracts.length})`}
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {topPicks.slice(1).map((contract, i) => (
                <div
                  key={contract.symbol}
                  className="flex items-center justify-between p-2 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors cursor-pointer"
                  onClick={() => onSelect(contract)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${getScoreColor(contract.score)}`}>
                      {contract.score.toFixed(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white">${contract.strike}</span>
                        <Badge variant={contract.type === 'call' ? 'success' : 'destructive'} className="text-[10px]">
                          {contract.type.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(contract.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ({contract.dte}d)
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-green-400 text-sm">${contract.bid.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Δ {contract.delta.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Matches */}
        {rankedContracts.length === 0 && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-gray-400">No contracts match your criteria</p>
            <p className="text-xs text-gray-500 mt-1">
              Try adjusting the strategy or loading more data
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">
            <strong>Score factors:</strong> Delta fit (40%), DTE fit (15%), spread tightness, 
            open interest, and volume. Higher scores indicate better matches for your strategy.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
