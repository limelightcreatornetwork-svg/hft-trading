"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface KellyCriterion {
  symbol: string;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  kellyFraction: number;
  halfKelly: number;
  quarterKelly: number;
  recommendedAllocation: number;
}

interface RiskParityWeight {
  symbol: string;
  volatility: number;
  inverseVolWeight: number;
  targetWeight: number;
  currentWeight: number;
  adjustmentNeeded: number;
}

interface PositionSizingProps {
  kellyAllocations: KellyCriterion[];
  riskParityWeights: RiskParityWeight[];
  portfolioValue: number;
  loading?: boolean;
}

type SizingMethod = 'kelly' | 'riskParity';

export function PositionSizing({ kellyAllocations, riskParityWeights, portfolioValue, loading }: PositionSizingProps) {
  const [method, setMethod] = useState<SizingMethod>('riskParity');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Position Sizing</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position Sizing Algorithms</CardTitle>
        <CardDescription>
          Optimal allocation based on risk-adjusted methods
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Method Toggle */}
        <div className="flex gap-2">
          <Button 
            variant={method === 'kelly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMethod('kelly')}
          >
            Kelly Criterion
          </Button>
          <Button 
            variant={method === 'riskParity' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMethod('riskParity')}
          >
            Risk Parity
          </Button>
        </div>

        {/* Kelly Criterion View */}
        {method === 'kelly' && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <p className="font-medium text-blue-800">Kelly Criterion</p>
              <p className="text-blue-700 mt-1">
                Calculates optimal bet size based on win rate and payoff ratio.
                Using Half-Kelly for more conservative sizing.
              </p>
              <p className="text-blue-600 mt-1 font-mono text-xs">
                Kelly % = W - [(1-W) / R] where W = win rate, R = win/loss ratio
              </p>
            </div>

            <div className="space-y-2">
              {kellyAllocations.map((kelly, idx) => (
                <div key={idx} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {kelly.symbol}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Win Rate: {(kelly.winRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">
                        ${kelly.recommendedAllocation.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Half-Kelly: {(kelly.halfKelly * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-muted rounded">
                      <p className="text-muted-foreground">Full Kelly</p>
                      <p className="font-mono font-bold">{(kelly.kellyFraction * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-2 bg-green-50 rounded border border-green-200">
                      <p className="text-muted-foreground">Half Kelly</p>
                      <p className="font-mono font-bold text-green-700">{(kelly.halfKelly * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <p className="text-muted-foreground">Quarter Kelly</p>
                      <p className="font-mono font-bold">{(kelly.quarterKelly * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <p className="text-muted-foreground">Avg W/L Ratio</p>
                      <p className="font-mono font-bold">
                        {kelly.avgLoss > 0 ? (kelly.avgWin / kelly.avgLoss).toFixed(2) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Parity View */}
        {method === 'riskParity' && (
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
              <p className="font-medium text-purple-800">Risk Parity</p>
              <p className="text-purple-700 mt-1">
                Allocates inversely proportional to volatility so each position 
                contributes equal risk to the portfolio.
              </p>
              <p className="text-purple-600 mt-1 font-mono text-xs">
                Weight = (1/σᵢ) / Σ(1/σⱼ) where σ = volatility
              </p>
            </div>

            <div className="space-y-2">
              {riskParityWeights.map((rp, idx) => {
                const adjustment = rp.adjustmentNeeded * 100;
                const needsAdjustment = Math.abs(adjustment) > 2;
                
                return (
                  <div key={idx} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {rp.symbol}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Vol: {(rp.volatility * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {(rp.targetWeight * 100).toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ${(portfolioValue * rp.targetWeight).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress bar showing current vs target */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Current: {(rp.currentWeight * 100).toFixed(1)}%</span>
                        <span>Target: {(rp.targetWeight * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 transition-all"
                          style={{ width: `${Math.min((rp.currentWeight / rp.targetWeight) * 100, 100)}%` }}
                        />
                      </div>
                      {needsAdjustment && (
                        <p className={`text-xs mt-1 ${adjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {adjustment > 0 ? '↑' : '↓'} {Math.abs(adjustment).toFixed(1)}% adjustment needed
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="p-3 border-t pt-4">
              <h4 className="font-medium mb-2">Risk Parity Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Positions</p>
                  <p className="font-bold">{riskParityWeights.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg Position Vol</p>
                  <p className="font-bold">
                    {riskParityWeights.length > 0 
                      ? ((riskParityWeights.reduce((sum, rp) => sum + rp.volatility, 0) / riskParityWeights.length) * 100).toFixed(1)
                      : 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
