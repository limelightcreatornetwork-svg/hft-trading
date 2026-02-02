'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface PLSimulatorProps {
  currentPrice: number;
  strike: number;
  premium: number;
  optionType: 'call' | 'put';
  side: 'long' | 'short';
  quantity: number;
  daysToExpiry: number;
  greeks?: Greeks | null;
}

// Scenario presets
const SCENARIOS = [
  { name: '📈 Bull +5%', priceChange: 5, ivChange: -5, days: 0 },
  { name: '📉 Bear -5%', priceChange: -5, ivChange: 5, days: 0 },
  { name: '🦘 Vol Spike', priceChange: 0, ivChange: 20, days: 0 },
  { name: '😴 Time Decay', priceChange: 0, ivChange: 0, days: 7 },
  { name: '🎯 At Expiry', priceChange: 0, ivChange: 0, days: -1 }, // -1 means max DTE
  { name: '🔄 Reset', priceChange: 0, ivChange: 0, days: 0 },
];

export function PLSimulator({
  currentPrice,
  strike,
  premium,
  optionType,
  side,
  quantity,
  daysToExpiry,
  greeks,
}: PLSimulatorProps) {
  const [priceChange, setPriceChange] = useState(0);
  const [daysForward, setDaysForward] = useState(0);
  const [ivChange, setIvChange] = useState(0);
  const [activeTab, setActiveTab] = useState<'sliders' | 'scenarios' | 'table'>('sliders');

  const contractSize = 100;
  const totalPremium = premium * contractSize * quantity;
  const sign = side === 'long' ? 1 : -1;

  const scenarios = useMemo(() => {
    const simulatedPrice = currentPrice * (1 + priceChange / 100);
    const effectiveDays = daysForward === -1 ? daysToExpiry : daysForward;
    const remainingDays = Math.max(0, daysToExpiry - effectiveDays);
    
    // Intrinsic value at simulated price
    const intrinsic = optionType === 'call'
      ? Math.max(0, simulatedPrice - strike)
      : Math.max(0, strike - simulatedPrice);

    // Time value factor (simplified)
    const timeValueFactor = remainingDays > 0 ? Math.sqrt(remainingDays / 365) : 0;
    
    // Estimate time value decay
    const timeDecay = greeks?.theta 
      ? greeks.theta * effectiveDays * contractSize * quantity
      : 0;

    // Delta P&L from price change
    const priceMove = simulatedPrice - currentPrice;
    const deltaEffect = greeks?.delta
      ? greeks.delta * priceMove * contractSize * quantity * sign
      : 0;

    // Gamma effect (second order)
    const gammaEffect = greeks?.gamma
      ? 0.5 * greeks.gamma * Math.pow(priceMove, 2) * contractSize * quantity * sign
      : 0;

    // Vega effect from IV change
    const vegaEffect = greeks?.vega
      ? greeks.vega * (ivChange / 100) * contractSize * quantity * sign
      : 0;

    // Total estimated P&L
    const estimatedPL = deltaEffect + gammaEffect + timeDecay + vegaEffect;

    // Intrinsic-based P&L at expiration
    const atExpiryPL = side === 'long'
      ? (intrinsic * contractSize * quantity) - totalPremium
      : totalPremium - (intrinsic * contractSize * quantity);

    // Breakeven price
    const breakeven = optionType === 'call'
      ? strike + premium
      : strike - premium;

    // Max profit/loss
    const maxProfit = side === 'long'
      ? (optionType === 'call' ? Infinity : (strike - premium) * contractSize * quantity)
      : totalPremium;

    const maxLoss = side === 'long'
      ? totalPremium
      : (optionType === 'call' ? Infinity : (strike - premium) * contractSize * quantity);

    // Probability estimates (simplified using delta as proxy)
    const probITM = greeks?.delta ? Math.abs(greeks.delta) : 0.5;
    const probProfit = side === 'long' ? probITM : 1 - probITM;

    // Risk/Reward ratio
    const expectedProfit = maxProfit === Infinity ? totalPremium * 2 : maxProfit;
    const expectedLoss = maxLoss === Infinity ? totalPremium * 2 : maxLoss;
    const riskRewardRatio = expectedProfit / Math.max(expectedLoss, 1);

    return {
      simulatedPrice,
      intrinsic,
      estimatedPL,
      atExpiryPL,
      breakeven,
      maxProfit,
      maxLoss,
      deltaEffect,
      gammaEffect,
      timeDecay,
      vegaEffect,
      remainingDays,
      probITM,
      probProfit,
      riskRewardRatio,
      timeValueFactor,
    };
  }, [currentPrice, strike, premium, optionType, side, quantity, daysToExpiry, priceChange, daysForward, ivChange, greeks, totalPremium, contractSize, sign]);

  // Generate price levels for visualization
  const priceLevels = useMemo(() => {
    const levels: { price: number; pl: number; isBreakeven?: boolean }[] = [];
    const minPrice = currentPrice * 0.85;
    const maxPrice = currentPrice * 1.15;
    const step = (maxPrice - minPrice) / 30;

    for (let price = minPrice; price <= maxPrice; price += step) {
      const intrinsic = optionType === 'call'
        ? Math.max(0, price - strike)
        : Math.max(0, strike - price);
      
      const pl = side === 'long'
        ? (intrinsic * contractSize * quantity) - totalPremium
        : totalPremium - (intrinsic * contractSize * quantity);

      levels.push({ 
        price, 
        pl,
        isBreakeven: Math.abs(price - scenarios.breakeven) < step / 2,
      });
    }
    return levels;
  }, [currentPrice, strike, optionType, side, quantity, totalPremium, contractSize, scenarios.breakeven]);

  // Generate scenario table data
  const scenarioTable = useMemo(() => {
    const priceChanges = [-10, -5, -2, 0, 2, 5, 10];
    const daysOptions = [0, 7, 14, Math.min(30, daysToExpiry), daysToExpiry];
    
    return priceChanges.map(pct => {
      const simPrice = currentPrice * (1 + pct / 100);
      const row: { pct: number; price: number; pls: number[] } = {
        pct,
        price: simPrice,
        pls: [],
      };
      
      for (const days of daysOptions) {
        const remaining = Math.max(0, daysToExpiry - days);
        const intrinsic = optionType === 'call'
          ? Math.max(0, simPrice - strike)
          : Math.max(0, strike - simPrice);
        
        // Simplified time value calculation
        const timeValue = premium * Math.sqrt(remaining / daysToExpiry);
        const optionValue = days >= daysToExpiry ? intrinsic : intrinsic + timeValue * 0.5;
        
        const pl = side === 'long'
          ? (optionValue * contractSize * quantity) - totalPremium
          : totalPremium - (optionValue * contractSize * quantity);
        
        row.pls.push(pl);
      }
      
      return row;
    });
  }, [currentPrice, strike, optionType, side, quantity, daysToExpiry, premium, totalPremium, contractSize]);

  const maxPL = Math.max(...priceLevels.map(l => l.pl));
  const minPL = Math.min(...priceLevels.map(l => l.pl));
  const plRange = maxPL - minPL || 1;

  const applyScenario = (scenario: typeof SCENARIOS[0]) => {
    setPriceChange(scenario.priceChange);
    setIvChange(scenario.ivChange);
    setDaysForward(scenario.days === -1 ? daysToExpiry : scenario.days);
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📈 P&L Simulator</span>
          <div className="flex items-center gap-2">
            <Badge variant={side === 'long' ? 'success' : 'destructive'} className="text-xs">
              {side === 'long' ? '🔼 Long' : '🔽 Short'} {optionType.toUpperCase()}
            </Badge>
            <span className={`text-sm font-normal ${scenarios.estimatedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              Est. P&L: {scenarios.estimatedPL >= 0 ? '+' : ''}${scenarios.estimatedPL.toFixed(2)}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Position Summary */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <div className="text-gray-500">Position</div>
            <div className="font-bold text-white">{quantity} × {optionType === 'call' ? '📈' : '📉'}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <div className="text-gray-500">Strike</div>
            <div className="font-bold text-yellow-400">${strike}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <div className="text-gray-500">Premium</div>
            <div className="font-bold text-white">${premium.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <div className="text-gray-500">Total Cost</div>
            <div className="font-bold text-white">${totalPremium.toFixed(0)}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-gray-700 pb-2">
          {(['sliders', 'scenarios', 'table'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'sliders' ? '🎚️ Sliders' : tab === 'scenarios' ? '🎯 Scenarios' : '📊 Table'}
            </button>
          ))}
        </div>

        {/* Sliders Tab */}
        {activeTab === 'sliders' && (
          <div className="space-y-4">
            {/* P&L Chart - Visual Payoff Diagram */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Payoff at Expiration</span>
                <span>
                  Simulated: <span className="text-white">${scenarios.simulatedPrice.toFixed(2)}</span>
                </span>
              </div>
              <div className="relative h-36">
                {/* Zero line */}
                <div 
                  className="absolute w-full h-px bg-gray-600"
                  style={{ top: `${(maxPL / plRange) * 100}%` }}
                >
                  <span className="absolute -left-8 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">$0</span>
                </div>
                
                {/* Strike line */}
                <div 
                  className="absolute h-full w-px bg-yellow-500/50"
                  style={{ left: `${((strike - currentPrice * 0.85) / (currentPrice * 0.3)) * 100}%` }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-yellow-400">
                    K=${strike}
                  </span>
                </div>
                
                {/* Current price line */}
                <div 
                  className="absolute h-full w-px bg-blue-500/70"
                  style={{ left: `${((currentPrice - currentPrice * 0.85) / (currentPrice * 0.3)) * 100}%` }}
                >
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-blue-400">
                    Now
                  </span>
                </div>

                {/* Breakeven line */}
                <div 
                  className="absolute h-full w-px bg-orange-500/50 border-dashed"
                  style={{ left: `${((scenarios.breakeven - currentPrice * 0.85) / (currentPrice * 0.3)) * 100}%` }}
                >
                  <span className="absolute top-1/4 left-1 text-[10px] text-orange-400">
                    BE
                  </span>
                </div>

                {/* Simulated price marker */}
                <div 
                  className="absolute h-full w-0.5 bg-purple-500"
                  style={{ left: `${((scenarios.simulatedPrice - currentPrice * 0.85) / (currentPrice * 0.3)) * 100}%` }}
                />

                {/* P&L curve */}
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                  {/* Profit fill */}
                  <path
                    d={[
                      ...priceLevels.map((level, i) => {
                        const x = (i / (priceLevels.length - 1)) * 100;
                        const y = ((maxPL - Math.max(0, level.pl)) / plRange) * 100;
                        return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                      }),
                      `L 100% ${(maxPL / plRange) * 100}%`,
                      `L 0% ${(maxPL / plRange) * 100}%`,
                      'Z'
                    ].join(' ')}
                    fill="rgba(16, 185, 129, 0.2)"
                  />
                  {/* Loss fill */}
                  <path
                    d={[
                      ...priceLevels.map((level, i) => {
                        const x = (i / (priceLevels.length - 1)) * 100;
                        const y = ((maxPL - Math.min(0, level.pl)) / plRange) * 100;
                        return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                      }),
                      `L 100% ${(maxPL / plRange) * 100}%`,
                      `L 0% ${(maxPL / plRange) * 100}%`,
                      'Z'
                    ].join(' ')}
                    fill="rgba(239, 68, 68, 0.2)"
                  />
                  {/* P&L curve line */}
                  <path
                    d={priceLevels.map((level, i) => {
                      const x = (i / (priceLevels.length - 1)) * 100;
                      const y = ((maxPL - level.pl) / plRange) * 100;
                      return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                    }).join(' ')}
                    fill="none"
                    stroke={side === 'long' ? '#10b981' : '#ef4444'}
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>${(currentPrice * 0.85).toFixed(0)}</span>
                <span>${currentPrice.toFixed(0)}</span>
                <span>${(currentPrice * 1.15).toFixed(0)}</span>
              </div>
            </div>

            {/* Sliders for scenarios */}
            <div className="space-y-4">
              {/* Price Change Slider */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Stock Price Change</span>
                  <span className={priceChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {priceChange >= 0 ? '+' : ''}{priceChange}% → ${scenarios.simulatedPrice.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={priceChange}
                  onChange={setPriceChange}
                  min={-20}
                  max={20}
                  step={1}
                  showValue={false}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>-20%</span>
                  <span>0%</span>
                  <span>+20%</span>
                </div>
              </div>

              {/* Days Forward Slider */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Time Forward</span>
                  <span className="text-purple-400">
                    +{daysForward} days → {scenarios.remainingDays} DTE
                  </span>
                </div>
                <Slider
                  value={daysForward}
                  onChange={setDaysForward}
                  min={0}
                  max={daysToExpiry}
                  step={1}
                  showValue={false}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>Now</span>
                  <span>{Math.floor(daysToExpiry / 2)}d</span>
                  <span>Expiry</span>
                </div>
              </div>

              {/* IV Change Slider */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">IV Change</span>
                  <span className={ivChange >= 0 ? 'text-blue-400' : 'text-orange-400'}>
                    {ivChange >= 0 ? '+' : ''}{ivChange}%
                    {greeks?.iv && ` → ${((greeks.iv * 100) + ivChange).toFixed(1)}% IV`}
                  </span>
                </div>
                <Slider
                  value={ivChange}
                  onChange={setIvChange}
                  min={-30}
                  max={30}
                  step={1}
                  showValue={false}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>IV Crush</span>
                  <span>No Change</span>
                  <span>Vol Spike</span>
                </div>
              </div>
            </div>

            {/* P&L Breakdown */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Delta Effect (Δ)</div>
                <div className={`font-bold ${scenarios.deltaEffect >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {scenarios.deltaEffect >= 0 ? '+' : ''}${scenarios.deltaEffect.toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-500">From price move</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Gamma Effect (Γ)</div>
                <div className={`font-bold ${scenarios.gammaEffect >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {scenarios.gammaEffect >= 0 ? '+' : ''}${scenarios.gammaEffect.toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-500">Acceleration</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Theta Effect (Θ)</div>
                <div className={`font-bold ${scenarios.timeDecay >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {scenarios.timeDecay >= 0 ? '+' : ''}${scenarios.timeDecay.toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-500">Time decay</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Vega Effect (ν)</div>
                <div className={`font-bold ${scenarios.vegaEffect >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {scenarios.vegaEffect >= 0 ? '+' : ''}${scenarios.vegaEffect.toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-500">From IV change</div>
              </div>
            </div>
          </div>
        )}

        {/* Scenarios Tab */}
        {activeTab === 'scenarios' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {SCENARIOS.map((scenario) => (
                <Button
                  key={scenario.name}
                  variant="outline"
                  size="sm"
                  onClick={() => applyScenario(scenario)}
                  className="border-gray-700 text-xs h-auto py-2"
                >
                  <div className="text-center">
                    <div className="font-medium">{scenario.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {scenario.priceChange !== 0 && `${scenario.priceChange > 0 ? '+' : ''}${scenario.priceChange}% price`}
                      {scenario.ivChange !== 0 && ` ${scenario.ivChange > 0 ? '+' : ''}${scenario.ivChange}% IV`}
                      {scenario.days !== 0 && ` +${scenario.days === -1 ? daysToExpiry : scenario.days}d`}
                    </div>
                  </div>
                </Button>
              ))}
            </div>

            {/* Scenario Results */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-300 mb-3">Scenario Result</div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-gray-500">New Price</div>
                  <div className="text-lg font-bold text-white">${scenarios.simulatedPrice.toFixed(2)}</div>
                  <div className={`text-xs ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {priceChange >= 0 ? '+' : ''}{priceChange}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Est. P&L</div>
                  <div className={`text-lg font-bold ${scenarios.estimatedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {scenarios.estimatedPL >= 0 ? '+' : ''}${scenarios.estimatedPL.toFixed(0)}
                  </div>
                  <div className={`text-xs ${scenarios.estimatedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {((scenarios.estimatedPL / totalPremium) * 100).toFixed(0)}% return
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Days Left</div>
                  <div className="text-lg font-bold text-purple-400">{scenarios.remainingDays}</div>
                  <div className="text-xs text-gray-500">DTE</div>
                </div>
              </div>
            </div>

            {/* Quick Facts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-700/50">
                <div className="text-xs text-blue-400 mb-1">🎯 Prob. of Profit</div>
                <div className="text-xl font-bold text-white">
                  {(scenarios.probProfit * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-400">Based on delta</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-700/50">
                <div className="text-xs text-purple-400 mb-1">⚖️ Risk/Reward</div>
                <div className="text-xl font-bold text-white">
                  1:{scenarios.riskRewardRatio.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">Max loss : Max profit</div>
              </div>
            </div>
          </div>
        )}

        {/* Table Tab */}
        {activeTab === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400">Price Δ</th>
                  <th className="text-right py-2 text-gray-400">Price</th>
                  <th className="text-right py-2 text-gray-400">Now</th>
                  <th className="text-right py-2 text-gray-400">+7d</th>
                  <th className="text-right py-2 text-gray-400">+14d</th>
                  <th className="text-right py-2 text-gray-400">+{Math.min(30, daysToExpiry)}d</th>
                  <th className="text-right py-2 text-gray-400">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {scenarioTable.map((row) => (
                  <tr 
                    key={row.pct} 
                    className={`border-b border-gray-800 ${row.pct === 0 ? 'bg-blue-900/20' : ''}`}
                  >
                    <td className={`py-2 ${row.pct > 0 ? 'text-green-400' : row.pct < 0 ? 'text-red-400' : 'text-white'}`}>
                      {row.pct > 0 ? '+' : ''}{row.pct}%
                    </td>
                    <td className="text-right py-2 text-white">${row.price.toFixed(0)}</td>
                    {row.pls.map((pl, i) => (
                      <td 
                        key={i} 
                        className={`text-right py-2 font-mono ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {pl >= 0 ? '+' : ''}${pl.toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-gray-500 mt-2 text-center">
              P&L estimates based on simplified time decay model
            </div>
          </div>
        )}

        {/* Key Metrics - Always visible */}
        <div className="border-t border-gray-700 pt-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-[10px] text-gray-400">Breakeven</div>
              <div className="font-bold text-yellow-400">${scenarios.breakeven.toFixed(2)}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-[10px] text-gray-400">Max Profit</div>
              <div className="font-bold text-green-400">
                {scenarios.maxProfit === Infinity ? '∞' : `$${scenarios.maxProfit.toFixed(0)}`}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-[10px] text-gray-400">Max Loss</div>
              <div className="font-bold text-red-400">
                {scenarios.maxLoss === Infinity ? '∞' : `$${scenarios.maxLoss.toFixed(0)}`}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-[10px] text-gray-400">At Expiry</div>
              <div className={`font-bold ${scenarios.atExpiryPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {scenarios.atExpiryPL >= 0 ? '+' : ''}${scenarios.atExpiryPL.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
