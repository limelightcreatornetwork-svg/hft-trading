'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

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

  const contractSize = 100;
  const totalPremium = premium * contractSize * quantity;
  const sign = side === 'long' ? 1 : -1;

  const scenarios = useMemo(() => {
    const simulatedPrice = currentPrice * (1 + priceChange / 100);
    const remainingDays = Math.max(0, daysToExpiry - daysForward);
    
    // Intrinsic value at simulated price
    const intrinsic = optionType === 'call'
      ? Math.max(0, simulatedPrice - strike)
      : Math.max(0, strike - simulatedPrice);

    // Estimate time value decay (simplified Black-Scholes approximation)
    const timeDecay = greeks?.theta 
      ? greeks.theta * daysForward * contractSize * quantity
      : 0;

    // Delta P&L from price change
    const deltaEffect = greeks?.delta
      ? greeks.delta * (simulatedPrice - currentPrice) * contractSize * quantity * sign
      : 0;

    // Gamma effect (second order)
    const gammaEffect = greeks?.gamma
      ? 0.5 * greeks.gamma * Math.pow(simulatedPrice - currentPrice, 2) * contractSize * quantity * sign
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
      ? (side === 'long' ? strike + premium : strike + premium)
      : (side === 'long' ? strike - premium : strike - premium);

    // Max profit/loss
    const maxProfit = side === 'long'
      ? (optionType === 'call' ? Infinity : (strike - premium) * contractSize * quantity)
      : totalPremium;

    const maxLoss = side === 'long'
      ? totalPremium
      : (optionType === 'call' ? Infinity : (strike - premium) * contractSize * quantity);

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
    };
  }, [currentPrice, strike, premium, optionType, side, quantity, daysToExpiry, priceChange, daysForward, ivChange, greeks, totalPremium, contractSize, sign]);

  // Generate price levels for visualization
  const priceLevels = useMemo(() => {
    const levels: { price: number; pl: number }[] = [];
    const minPrice = currentPrice * 0.8;
    const maxPrice = currentPrice * 1.2;
    const step = (maxPrice - minPrice) / 20;

    for (let price = minPrice; price <= maxPrice; price += step) {
      const intrinsic = optionType === 'call'
        ? Math.max(0, price - strike)
        : Math.max(0, strike - price);
      
      const pl = side === 'long'
        ? (intrinsic * contractSize * quantity) - totalPremium
        : totalPremium - (intrinsic * contractSize * quantity);

      levels.push({ price, pl });
    }
    return levels;
  }, [currentPrice, strike, optionType, side, quantity, totalPremium, contractSize]);

  const maxPL = Math.max(...priceLevels.map(l => l.pl));
  const minPL = Math.min(...priceLevels.map(l => l.pl));
  const plRange = maxPL - minPL || 1;

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📈 P&L Simulator</span>
          <span className={`text-sm font-normal ${scenarios.estimatedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            Est. P&L: {scenarios.estimatedPL >= 0 ? '+' : ''}${scenarios.estimatedPL.toFixed(2)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* P&L Chart - Visual Payoff Diagram */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-2">Payoff at Expiration</div>
          <div className="relative h-32">
            {/* Zero line */}
            <div 
              className="absolute w-full h-px bg-gray-600"
              style={{ top: `${(maxPL / plRange) * 100}%` }}
            />
            {/* Strike line */}
            <div 
              className="absolute h-full w-px bg-yellow-500/50"
              style={{ left: `${((strike - currentPrice * 0.8) / (currentPrice * 0.4)) * 100}%` }}
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-yellow-400">
                Strike
              </span>
            </div>
            {/* Current price line */}
            <div 
              className="absolute h-full w-px bg-blue-500/50"
              style={{ left: `${((currentPrice - currentPrice * 0.8) / (currentPrice * 0.4)) * 100}%` }}
            >
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-blue-400">
                Now
              </span>
            </div>
            {/* P&L curve */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <path
                d={priceLevels.map((level, i) => {
                  const x = (i / (priceLevels.length - 1)) * 100;
                  const y = ((maxPL - level.pl) / plRange) * 100;
                  return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                }).join(' ')}
                fill="none"
                stroke={side === 'long' ? '#10b981' : '#ef4444'}
                strokeWidth="2"
              />
              {/* Fill area */}
              <path
                d={[
                  ...priceLevels.map((level, i) => {
                    const x = (i / (priceLevels.length - 1)) * 100;
                    const y = ((maxPL - level.pl) / plRange) * 100;
                    return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                  }),
                  `L 100% ${(maxPL / plRange) * 100}%`,
                  `L 0% ${(maxPL / plRange) * 100}%`,
                  'Z'
                ].join(' ')}
                fill={side === 'long' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
              />
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>${(currentPrice * 0.8).toFixed(0)}</span>
            <span>${(currentPrice * 1.2).toFixed(0)}</span>
          </div>
        </div>

        {/* Sliders for scenarios */}
        <div className="space-y-4">
          {/* Price Change Slider */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Price Change</span>
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
              max={Math.min(daysToExpiry, 30)}
              step={1}
              showValue={false}
            />
          </div>

          {/* IV Change Slider */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">IV Change</span>
              <span className={ivChange >= 0 ? 'text-blue-400' : 'text-orange-400'}>
                {ivChange >= 0 ? '+' : ''}{ivChange}%
                {greeks?.iv && ` → ${((greeks.iv + ivChange/100) * 100).toFixed(1)}%`}
              </span>
            </div>
            <Slider
              value={ivChange}
              onChange={setIvChange}
              min={-20}
              max={20}
              step={1}
              showValue={false}
            />
          </div>
        </div>

        {/* P&L Breakdown */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Delta Effect</div>
            <div className={scenarios.deltaEffect >= 0 ? 'text-green-400' : 'text-red-400'}>
              {scenarios.deltaEffect >= 0 ? '+' : ''}${scenarios.deltaEffect.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Gamma Effect</div>
            <div className={scenarios.gammaEffect >= 0 ? 'text-green-400' : 'text-red-400'}>
              {scenarios.gammaEffect >= 0 ? '+' : ''}${scenarios.gammaEffect.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Time Decay</div>
            <div className={scenarios.timeDecay >= 0 ? 'text-green-400' : 'text-red-400'}>
              {scenarios.timeDecay >= 0 ? '+' : ''}${scenarios.timeDecay.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Vega Effect</div>
            <div className={scenarios.vegaEffect >= 0 ? 'text-green-400' : 'text-red-400'}>
              {scenarios.vegaEffect >= 0 ? '+' : ''}${scenarios.vegaEffect.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="border-t border-gray-700 pt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400">Breakeven</div>
              <div className="font-bold text-yellow-400">${scenarios.breakeven.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Max Profit</div>
              <div className="font-bold text-green-400">
                {scenarios.maxProfit === Infinity ? '∞' : `$${scenarios.maxProfit.toFixed(0)}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Max Loss</div>
              <div className="font-bold text-red-400">
                {scenarios.maxLoss === Infinity ? '∞' : `$${scenarios.maxLoss.toFixed(0)}`}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
