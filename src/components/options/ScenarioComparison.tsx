'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface OptionLeg {
  type: 'call' | 'put';
  strike: number;
  premium: number;
  quantity: number;
  side: 'long' | 'short';
  delta?: number;
  theta?: number;
  iv?: number;
}

interface Scenario {
  id: string;
  name: string;
  priceChange: number; // percentage
  ivChange: number; // percentage points
  daysForward: number;
}

interface ScenarioComparisonProps {
  legs: OptionLeg[];
  currentPrice: number;
  daysToExpiry: number;
  symbol: string;
}

// Pre-built scenario templates
const SCENARIO_TEMPLATES: Scenario[] = [
  { id: 'bull-5', name: '📈 Bull +5%', priceChange: 5, ivChange: -3, daysForward: 0 },
  { id: 'bull-10', name: '🚀 Bull +10%', priceChange: 10, ivChange: -5, daysForward: 0 },
  { id: 'bear-5', name: '📉 Bear -5%', priceChange: -5, ivChange: 5, daysForward: 0 },
  { id: 'bear-10', name: '💥 Bear -10%', priceChange: -10, ivChange: 10, daysForward: 0 },
  { id: 'flat-week', name: '😴 Flat +7d', priceChange: 0, ivChange: 0, daysForward: 7 },
  { id: 'flat-month', name: '⏱️ Flat +30d', priceChange: 0, ivChange: 0, daysForward: 30 },
  { id: 'vol-spike', name: '🌊 Vol Spike', priceChange: 0, ivChange: 15, daysForward: 0 },
  { id: 'vol-crush', name: '💨 Vol Crush', priceChange: 0, ivChange: -20, daysForward: 0 },
  { id: 'expiry', name: '📅 At Expiry', priceChange: 0, ivChange: 0, daysForward: -1 },
];

// Calculate P&L for a position under a scenario
function calculateScenarioPL(
  legs: OptionLeg[],
  currentPrice: number,
  daysToExpiry: number,
  scenario: Scenario,
): {
  totalPL: number;
  legPLs: number[];
  newPrice: number;
  daysRemaining: number;
  greekContributions: {
    delta: number;
    theta: number;
    vega: number;
  };
} {
  const contractSize = 100;
  const newPrice = currentPrice * (1 + scenario.priceChange / 100);
  const effectiveDays = scenario.daysForward === -1 ? daysToExpiry : scenario.daysForward;
  const daysRemaining = Math.max(0, daysToExpiry - effectiveDays);
  const priceMove = newPrice - currentPrice;

  let totalPL = 0;
  const legPLs: number[] = [];
  const greekContributions = { delta: 0, theta: 0, vega: 0 };

  for (const leg of legs) {
    const sign = leg.side === 'long' ? 1 : -1;
    const positionSize = leg.quantity * contractSize;

    // Calculate intrinsic value
    let intrinsic: number;
    if (leg.type === 'call') {
      intrinsic = Math.max(0, newPrice - leg.strike);
    } else {
      intrinsic = Math.max(0, leg.strike - newPrice);
    }

    // Time value (simplified decay model)
    const timeValueFactor = daysRemaining > 0 ? Math.sqrt(daysRemaining / daysToExpiry) : 0;
    const originalTimeValue = leg.premium - Math.max(0, 
      leg.type === 'call' ? currentPrice - leg.strike : leg.strike - currentPrice
    );
    const remainingTimeValue = originalTimeValue * timeValueFactor;

    // Estimated new option value
    const newOptionValue = intrinsic + Math.max(0, remainingTimeValue);

    // P&L calculation
    const entryValue = leg.premium * positionSize;
    const exitValue = newOptionValue * positionSize;
    const legPL = leg.side === 'long' 
      ? exitValue - entryValue 
      : entryValue - exitValue;

    legPLs.push(legPL);
    totalPL += legPL;

    // Greek contributions
    if (leg.delta !== undefined) {
      const deltaEffect = leg.delta * priceMove * positionSize * sign;
      greekContributions.delta += deltaEffect;
    }
    if (leg.theta !== undefined) {
      const thetaEffect = leg.theta * effectiveDays * positionSize * sign;
      greekContributions.theta += thetaEffect;
    }
    if (leg.iv !== undefined && scenario.ivChange !== 0) {
      // Simplified vega effect
      const vegaEstimate = leg.premium * 0.04; // Rough vega estimate
      const vegaEffect = vegaEstimate * (scenario.ivChange / 1) * positionSize * sign;
      greekContributions.vega += vegaEffect;
    }
  }

  return {
    totalPL,
    legPLs,
    newPrice,
    daysRemaining,
    greekContributions,
  };
}

export function ScenarioComparison({
  legs,
  currentPrice,
  daysToExpiry,
  symbol,
}: ScenarioComparisonProps) {
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    new Set(['bull-5', 'bear-5', 'flat-week', 'expiry'])
  );
  const [customScenario, setCustomScenario] = useState<Scenario | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('Custom');
  const [customPriceChange, setCustomPriceChange] = useState(0);
  const [customIvChange, setCustomIvChange] = useState(0);
  const [customDays, setCustomDays] = useState(0);

  // Calculate results for all selected scenarios
  const scenarioResults = useMemo(() => {
    const scenarios = SCENARIO_TEMPLATES.filter(s => selectedScenarios.has(s.id));
    if (customScenario) {
      scenarios.push(customScenario);
    }

    return scenarios.map(scenario => ({
      scenario,
      result: calculateScenarioPL(legs, currentPrice, daysToExpiry, scenario),
    }));
  }, [legs, currentPrice, daysToExpiry, selectedScenarios, customScenario]);

  // Calculate max profit and max loss from scenarios
  const { maxProfit, maxLoss, bestScenario, worstScenario } = useMemo(() => {
    if (scenarioResults.length === 0) {
      return { maxProfit: 0, maxLoss: 0, bestScenario: null, worstScenario: null };
    }

    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    let bestScenario: typeof scenarioResults[0] | null = null;
    let worstScenario: typeof scenarioResults[0] | null = null;

    for (const sr of scenarioResults) {
      if (sr.result.totalPL > maxProfit) {
        maxProfit = sr.result.totalPL;
        bestScenario = sr;
      }
      if (sr.result.totalPL < maxLoss) {
        maxLoss = sr.result.totalPL;
        worstScenario = sr;
      }
    }

    return { maxProfit, maxLoss, bestScenario, worstScenario };
  }, [scenarioResults]);

  // Calculate initial position cost
  const initialCost = useMemo(() => {
    return legs.reduce((total, leg) => {
      const cost = leg.premium * leg.quantity * 100;
      return total + (leg.side === 'long' ? cost : -cost);
    }, 0);
  }, [legs]);

  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addCustomScenario = () => {
    setCustomScenario({
      id: 'custom',
      name: `🎯 ${customName}`,
      priceChange: customPriceChange,
      ivChange: customIvChange,
      daysForward: customDays,
    });
    setShowCustomForm(false);
  };

  if (legs.length === 0) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle>📊 Scenario Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            Add option legs to compare scenarios
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📊 Scenario Comparison</span>
          <div className="flex items-center gap-2 text-sm font-normal">
            <span className="text-gray-400">{symbol}</span>
            <span className="text-white">${currentPrice.toFixed(2)}</span>
            <span className="text-gray-500">|</span>
            <span className="text-purple-400">{daysToExpiry}d</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Position Summary */}
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2">Position</div>
          <div className="flex flex-wrap gap-2">
            {legs.map((leg, i) => (
              <Badge 
                key={i}
                variant={leg.side === 'long' ? 'success' : 'destructive'}
                className="font-mono"
              >
                {leg.side === 'long' ? '+' : '-'}{leg.quantity} 
                {' '}${leg.strike} {leg.type.toUpperCase()}
                {' '}@${leg.premium.toFixed(2)}
              </Badge>
            ))}
          </div>
          <div className="mt-2 text-sm">
            <span className="text-gray-400">Initial {initialCost >= 0 ? 'Debit' : 'Credit'}: </span>
            <span className={initialCost >= 0 ? 'text-red-400' : 'text-green-400'}>
              ${Math.abs(initialCost).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Scenario Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Select Scenarios</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="text-xs border-gray-700"
            >
              {showCustomForm ? 'Cancel' : '+ Custom'}
            </Button>
          </div>

          {/* Custom Scenario Form */}
          {showCustomForm && (
            <div className="mb-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-gray-500">Name</label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="h-8 text-xs bg-gray-800 border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">Price %</label>
                  <Input
                    type="number"
                    value={customPriceChange}
                    onChange={(e) => setCustomPriceChange(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-gray-800 border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">IV %pts</label>
                  <Input
                    type="number"
                    value={customIvChange}
                    onChange={(e) => setCustomIvChange(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-gray-800 border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">Days</label>
                  <Input
                    type="number"
                    value={customDays}
                    onChange={(e) => setCustomDays(parseInt(e.target.value) || 0)}
                    className="h-8 text-xs bg-gray-800 border-gray-700"
                  />
                </div>
              </div>
              <Button size="sm" onClick={addCustomScenario} className="w-full h-7 text-xs">
                Add Scenario
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {SCENARIO_TEMPLATES.map(s => (
              <button
                key={s.id}
                onClick={() => toggleScenario(s.id)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedScenarios.has(s.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s.name}
              </button>
            ))}
            {customScenario && (
              <button
                onClick={() => setCustomScenario(null)}
                className="px-2 py-1 text-xs rounded bg-purple-600 text-white"
              >
                {customScenario.name} ✕
              </button>
            )}
          </div>
        </div>

        {/* Best/Worst Overview */}
        {scenarioResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3">
              <div className="text-xs text-green-400 mb-1">Best Case</div>
              <div className="text-xl font-bold text-green-400">
                +${maxProfit.toFixed(0)}
              </div>
              <div className="text-xs text-gray-400">
                {bestScenario?.scenario.name}
              </div>
            </div>
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
              <div className="text-xs text-red-400 mb-1">Worst Case</div>
              <div className="text-xl font-bold text-red-400">
                ${maxLoss.toFixed(0)}
              </div>
              <div className="text-xs text-gray-400">
                {worstScenario?.scenario.name}
              </div>
            </div>
          </div>
        )}

        {/* Scenario Results Table */}
        {scenarioResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-700">
                  <th className="text-left py-2 px-2">Scenario</th>
                  <th className="text-right py-2 px-2">New Price</th>
                  <th className="text-right py-2 px-2">Days Left</th>
                  <th className="text-right py-2 px-2">Δ Effect</th>
                  <th className="text-right py-2 px-2">Θ Effect</th>
                  <th className="text-right py-2 px-2 font-bold">Total P&L</th>
                  <th className="text-right py-2 px-2">ROI</th>
                </tr>
              </thead>
              <tbody>
                {scenarioResults.map(({ scenario, result }) => {
                  const roi = initialCost !== 0 
                    ? (result.totalPL / Math.abs(initialCost)) * 100 
                    : 0;
                  
                  return (
                    <tr 
                      key={scenario.id}
                      className="border-b border-gray-800 hover:bg-gray-800/50"
                    >
                      <td className="py-2 px-2">
                        <span className="font-medium">{scenario.name}</span>
                        <div className="text-[10px] text-gray-500">
                          {scenario.priceChange !== 0 && `${scenario.priceChange > 0 ? '+' : ''}${scenario.priceChange}% `}
                          {scenario.ivChange !== 0 && `IV ${scenario.ivChange > 0 ? '+' : ''}${scenario.ivChange}% `}
                          {scenario.daysForward !== 0 && `+${scenario.daysForward === -1 ? daysToExpiry : scenario.daysForward}d`}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 font-mono">
                        <span className={scenario.priceChange > 0 ? 'text-green-400' : scenario.priceChange < 0 ? 'text-red-400' : 'text-gray-300'}>
                          ${result.newPrice.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2 text-purple-400">
                        {result.daysRemaining}
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={result.greekContributions.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {result.greekContributions.delta >= 0 ? '+' : ''}${result.greekContributions.delta.toFixed(0)}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={result.greekContributions.theta >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {result.greekContributions.theta >= 0 ? '+' : ''}${result.greekContributions.theta.toFixed(0)}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2 font-bold">
                        <span className={result.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {result.totalPL >= 0 ? '+' : ''}${result.totalPL.toFixed(0)}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Visual Comparison Bar */}
        {scenarioResults.length > 0 && (
          <div className="pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400 mb-3">P&L Distribution</div>
            <div className="space-y-2">
              {scenarioResults.map(({ scenario, result }) => {
                const maxAbs = Math.max(Math.abs(maxProfit), Math.abs(maxLoss)) || 1;
                const width = (Math.abs(result.totalPL) / maxAbs) * 50;
                const isProfit = result.totalPL >= 0;
                
                return (
                  <div key={scenario.id} className="flex items-center gap-2">
                    <div className="w-24 text-xs text-gray-400 truncate">
                      {scenario.name.replace(/[📈📉🚀💥😴⏱️🌊💨📅🎯]/g, '').trim()}
                    </div>
                    <div className="flex-1 h-6 bg-gray-800 rounded relative flex">
                      {/* Center line */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
                      
                      {/* Bar */}
                      <div 
                        className={`absolute top-1 bottom-1 rounded ${
                          isProfit ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{
                          [isProfit ? 'left' : 'right']: '50%',
                          width: `${width}%`,
                        }}
                      />
                    </div>
                    <div className={`w-16 text-right text-xs font-mono ${
                      result.totalPL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {result.totalPL >= 0 ? '+' : ''}${result.totalPL.toFixed(0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-gray-500 pt-4 border-t border-gray-700">
          <strong>💡 Tips:</strong> Compare scenarios to understand your position&apos;s risk profile.
          Look for strategies with positive outcomes in most scenarios and limited worst-case losses.
        </div>
      </CardContent>
    </Card>
  );
}
