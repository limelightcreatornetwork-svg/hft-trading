'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OptionPosition {
  symbol: string;
  quantity: number;
  side: string;
  marketValue: number;
  unrealizedPL: number;
  underlying?: string;
  underlyingPrice?: number;
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
  };
}

interface PortfolioGreeksProps {
  positions?: OptionPosition[];
  showDetails?: boolean;
}

/**
 * Estimated beta values for common stocks relative to SPY.
 * These are approximate values - in production, you'd fetch real-time betas.
 */
const STOCK_BETAS: Record<string, number> = {
  // Mega-caps tend to move with market
  AAPL: 1.2,
  MSFT: 1.1,
  GOOGL: 1.15,
  GOOG: 1.15,
  AMZN: 1.25,
  META: 1.35,
  NVDA: 1.65,
  TSLA: 1.80,
  
  // Tech stocks
  AMD: 1.70,
  INTC: 1.10,
  CRM: 1.20,
  ADBE: 1.15,
  NFLX: 1.40,
  
  // Financial stocks
  JPM: 1.15,
  BAC: 1.35,
  GS: 1.30,
  MS: 1.35,
  
  // Energy stocks
  XOM: 0.90,
  CVX: 1.00,
  
  // Consumer stocks
  WMT: 0.55,
  KO: 0.60,
  PEP: 0.65,
  MCD: 0.70,
  
  // Healthcare
  JNJ: 0.65,
  PFE: 0.75,
  UNH: 0.85,
  
  // ETFs
  SPY: 1.00,
  QQQ: 1.10,
  IWM: 1.15,
  
  // Default for unknown stocks
  DEFAULT: 1.00,
};

/**
 * Get the beta for a stock symbol
 */
function getStockBeta(symbol: string): number {
  return STOCK_BETAS[symbol.toUpperCase()] ?? STOCK_BETAS.DEFAULT;
}

export function PortfolioGreeks({ positions: propPositions, showDetails = true }: PortfolioGreeksProps) {
  const [positions, setPositions] = useState<OptionPosition[]>(propPositions || []);
  const [loading, setLoading] = useState(!propPositions);
  const [expanded, setExpanded] = useState(false);
  const [spyPrice, setSpyPrice] = useState<number>(500); // Default SPY price

  const fetchSpyPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/quote?symbol=SPY');
      const data = await res.json();
      if (data.success && data.data?.price) {
        setSpyPrice(data.data.price);
      }
    } catch (e) {
      console.warn('Could not fetch SPY price:', e);
    }
  }, []);

  const fetchPositionsWithGreeks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/positions');
      const data = await res.json();

      if (data.success) {
        // Filter options and fetch greeks
        const optionPattern = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
        const optionPositions = data.data.positions.filter((p: { symbol: string }) =>
          optionPattern.test(p.symbol)
        );

        // Fetch greeks for all options
        if (optionPositions.length > 0) {
          const symbols = optionPositions.map((p: OptionPosition) => p.symbol);
          try {
            const quotesRes = await fetch(`/api/options/quotes?symbols=${symbols.join(',')}`);
            const quotesData = await quotesRes.json();

            if (quotesData.success) {
              const positionsWithGreeks = optionPositions.map((p: OptionPosition) => {
                const snapshot = quotesData.data.snapshots?.[p.symbol];
                const match = p.symbol.match(optionPattern);
                
                return {
                  ...p,
                  underlying: match?.[1],
                  optionType: match?.[3] === 'C' ? 'call' : 'put',
                  strike: match ? parseInt(match[4]) / 1000 : 0,
                  expiration: match ? `20${match[2].slice(0,2)}-${match[2].slice(2,4)}-${match[2].slice(4,6)}` : '',
                  greeks: snapshot?.greeks ? {
                    delta: snapshot.greeks.delta,
                    gamma: snapshot.greeks.gamma,
                    theta: snapshot.greeks.theta,
                    vega: snapshot.greeks.vega,
                    iv: snapshot.greeks.implied_volatility,
                  } : undefined,
                };
              });
              setPositions(positionsWithGreeks);
            }
          } catch (e) {
            console.warn('Could not fetch greeks:', e);
            setPositions(optionPositions);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpyPrice();
    if (!propPositions) {
      fetchPositionsWithGreeks();
    }
  }, [propPositions, fetchSpyPrice, fetchPositionsWithGreeks]);

  // Calculate portfolio-level Greeks
  const contractSize = 100;
  const portfolioGreeks = positions.reduce(
    (acc, pos) => {
      if (!pos.greeks) return acc;
      const qty = pos.side === 'long' ? pos.quantity : -pos.quantity;
      
      return {
        delta: acc.delta + (pos.greeks.delta * qty * contractSize),
        gamma: acc.gamma + (pos.greeks.gamma * qty * contractSize),
        theta: acc.theta + (pos.greeks.theta * qty * contractSize),
        vega: acc.vega + (pos.greeks.vega * qty * contractSize),
        totalValue: acc.totalValue + pos.marketValue,
        totalPL: acc.totalPL + pos.unrealizedPL,
      };
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0, totalValue: 0, totalPL: 0 }
  );

  /**
   * Calculate Beta-Weighted Delta
   * 
   * This normalizes all positions to SPY-equivalent delta, which helps
   * understand your true market exposure across different underlyings.
   * 
   * Formula: Σ (Position Delta × Underlying Price × Beta / SPY Price)
   * 
   * Note: For options, we use the strike as a proxy for underlying price
   * when the actual underlying price isn't available.
   */
  const betaWeightedDelta = positions.reduce((acc, pos) => {
    if (!pos.greeks) return acc;
    
    const underlying = pos.underlying || 'SPY';
    const beta = getStockBeta(underlying);
    const qty = pos.side === 'long' ? pos.quantity : -pos.quantity;
    const positionDelta = pos.greeks.delta * qty * contractSize;
    
    // Use underlying price if available, otherwise use strike as proxy
    const underlyingPrice = pos.underlyingPrice || pos.strike || 100;
    
    // Beta-weighted delta normalized to SPY
    const bwDelta = (positionDelta * underlyingPrice * beta) / spyPrice;
    
    return acc + bwDelta;
  }, 0);

  // Risk assessment
  const getRiskLevel = () => {
    const absDelta = Math.abs(portfolioGreeks.delta);
    const absGamma = Math.abs(portfolioGreeks.gamma);
    
    if (absDelta > 500 || absGamma > 50) return { level: 'High', color: 'bg-red-500' };
    if (absDelta > 200 || absGamma > 20) return { level: 'Medium', color: 'bg-yellow-500' };
    return { level: 'Low', color: 'bg-green-500' };
  };

  const risk = getRiskLevel();

  if (loading) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle>Portfolio Greeks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-800 rounded" />
            <div className="h-8 bg-gray-800 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle>Portfolio Greeks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-center py-4">No options positions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>📊 Portfolio Greeks</span>
          <div className="flex items-center gap-2">
            <Badge className={risk.color}>{risk.level} Risk</Badge>
            <span className={`text-sm ${portfolioGreeks.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolioGreeks.totalPL >= 0 ? '+' : ''}${portfolioGreeks.totalPL.toFixed(2)}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Greeks Display */}
        <div className="grid grid-cols-5 gap-3">
          {/* Delta */}
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Net Delta</div>
            <div className={`text-xl font-bold ${portfolioGreeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolioGreeks.delta >= 0 ? '+' : ''}{portfolioGreeks.delta.toFixed(0)}
            </div>
            <div className="text-[10px] text-gray-500">shares equiv.</div>
          </div>

          {/* Beta-Weighted Delta */}
          <div className="bg-gray-800 rounded-lg p-3 text-center border border-yellow-500/30">
            <div className="text-xs text-yellow-400 mb-1">β-Weighted Δ</div>
            <div className={`text-xl font-bold ${betaWeightedDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {betaWeightedDelta >= 0 ? '+' : ''}{betaWeightedDelta.toFixed(0)}
            </div>
            <div className="text-[10px] text-gray-500">SPY equiv.</div>
          </div>

          {/* Gamma */}
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Net Gamma</div>
            <div className="text-xl font-bold text-purple-400">
              {portfolioGreeks.gamma >= 0 ? '+' : ''}{portfolioGreeks.gamma.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-500">Δ per $1</div>
          </div>

          {/* Theta */}
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Net Theta</div>
            <div className={`text-xl font-bold ${portfolioGreeks.theta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolioGreeks.theta >= 0 ? '+' : ''}${portfolioGreeks.theta.toFixed(0)}
            </div>
            <div className="text-[10px] text-gray-500">per day</div>
          </div>

          {/* Vega */}
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Net Vega</div>
            <div className="text-xl font-bold text-blue-400">
              ${portfolioGreeks.vega.toFixed(0)}
            </div>
            <div className="text-[10px] text-gray-500">per 1% IV</div>
          </div>
        </div>

        {/* Risk Interpretation */}
        <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
          <div className="font-medium text-gray-300 mb-2">Risk Summary</div>
          <div className="space-y-1 text-gray-400">
            <div className="flex items-center gap-2">
              <span className={portfolioGreeks.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                {portfolioGreeks.delta > 0 ? '📈' : '📉'}
              </span>
              <span>
                {portfolioGreeks.delta > 0 ? 'Bullish' : portfolioGreeks.delta < 0 ? 'Bearish' : 'Neutral'} bias 
                ({Math.abs(portfolioGreeks.delta).toFixed(0)} share equivalent)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">🎯</span>
              <span>
                SPY-equivalent exposure: {Math.abs(betaWeightedDelta).toFixed(0)} shares
                <span className="text-gray-500 ml-1">
                  (β-adjusted, SPY @ ${spyPrice.toFixed(0)})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>⏱️</span>
              <span>
                Time decay: {portfolioGreeks.theta >= 0 ? 'Working for you' : 'Working against you'} 
                (${Math.abs(portfolioGreeks.theta).toFixed(0)}/day)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>💨</span>
              <span>
                {portfolioGreeks.vega > 0 ? 'Long' : 'Short'} volatility 
                (${Math.abs(portfolioGreeks.vega).toFixed(0)} per 1% IV move)
              </span>
            </div>
          </div>
        </div>

        {/* Position Breakdown */}
        {showDetails && (
          <>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-gray-400"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '▲ Hide Position Details' : '▼ Show Position Details'}
            </Button>

            {expanded && (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div 
                    key={pos.symbol}
                    className="bg-gray-800 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={pos.optionType === 'call' ? 'success' : 'destructive'} className="text-xs">
                          {pos.optionType?.toUpperCase()}
                        </Badge>
                        <span className="font-mono font-medium">{pos.underlying}</span>
                        <span className="text-gray-400">
                          ${pos.strike} {pos.expiration}
                        </span>
                      </div>
                      <Badge variant={pos.side === 'long' ? 'secondary' : 'outline'}>
                        {pos.side === 'long' ? '+' : '-'}{Math.abs(pos.quantity)}
                      </Badge>
                    </div>
                    {pos.greeks && (
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Δ </span>
                          <span className={pos.greeks.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {pos.greeks.delta.toFixed(3)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Γ </span>
                          <span className="text-purple-400">{pos.greeks.gamma.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Θ </span>
                          <span className="text-red-400">${pos.greeks.theta.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">IV </span>
                          <span className="text-blue-400">{(pos.greeks.iv * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
