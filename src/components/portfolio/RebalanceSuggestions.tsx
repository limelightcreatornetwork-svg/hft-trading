"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RebalanceSuggestion {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  currentValue: number;
  targetValue: number;
  action: 'buy' | 'sell' | 'hold';
  sharesChange: number;
  dollarChange: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

interface RebalanceSuggestionsProps {
  suggestions: RebalanceSuggestion[];
  portfolioValue?: number; // Reserved for future use
  loading?: boolean;
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'buy': return 'text-green-600';
    case 'sell': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

function getActionBadge(action: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (action) {
    case 'buy': return { label: 'BUY', variant: 'default' };
    case 'sell': return { label: 'SELL', variant: 'destructive' };
    default: return { label: 'HOLD', variant: 'outline' };
  }
}

export function RebalanceSuggestions({ suggestions, portfolioValue, loading }: RebalanceSuggestionsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rebalancing Suggestions</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const actionableSuggestions = suggestions.filter(s => s.action !== 'hold');
  const totalBuyValue = suggestions
    .filter(s => s.action === 'buy')
    .reduce((sum, s) => sum + s.dollarChange, 0);
  const totalSellValue = suggestions
    .filter(s => s.action === 'sell')
    .reduce((sum, s) => sum + Math.abs(s.dollarChange), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Rebalancing Suggestions
          {actionableSuggestions.length > 0 && (
            <Badge variant="secondary">
              {actionableSuggestions.length} action{actionableSuggestions.length !== 1 ? 's' : ''} needed
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Based on equal-weight target allocation (adjust targets as needed)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {actionableSuggestions.length > 0 && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Total to Buy</p>
              <p className="text-xl font-bold text-green-600">
                +${totalBuyValue.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total to Sell</p>
              <p className="text-xl font-bold text-red-600">
                -${totalSellValue.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Suggestions List */}
        <div className="space-y-2">
          {suggestions.map((suggestion, idx) => {
            const actionBadge = getActionBadge(suggestion.action);
            
            return (
              <div 
                key={idx} 
                className={`p-3 rounded-lg border ${getPriorityColor(suggestion.priority)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={actionBadge.variant} className="w-12 justify-center">
                      {actionBadge.label}
                    </Badge>
                    <div>
                      <span className="font-bold">{suggestion.symbol}</span>
                      {suggestion.action !== 'hold' && (
                        <span className={`ml-2 ${getActionColor(suggestion.action)}`}>
                          {suggestion.action === 'buy' ? '+' : '-'}{suggestion.sharesChange} shares
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {suggestion.action !== 'hold' && (
                      <p className={`font-bold ${getActionColor(suggestion.action)}`}>
                        {suggestion.dollarChange >= 0 ? '+' : ''}${suggestion.dollarChange.toFixed(2)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Priority: {suggestion.priority}
                    </p>
                  </div>
                </div>
                
                {/* Weight comparison */}
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Current:</span>
                    <span className="font-mono">{(suggestion.currentWeight * 100).toFixed(1)}%</span>
                    <span className="text-muted-foreground">(${suggestion.currentValue.toFixed(2)})</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Target:</span>
                    <span className="font-mono">{(suggestion.targetWeight * 100).toFixed(1)}%</span>
                    <span className="text-muted-foreground">(${suggestion.targetValue.toFixed(2)})</span>
                  </div>
                </div>
                
                <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
              </div>
            );
          })}
        </div>

        {actionableSuggestions.length === 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="font-medium text-green-800">✓ Portfolio is Balanced</p>
            <p className="text-sm text-green-700 mt-1">
              All positions are within 5% of target allocation. No rebalancing needed.
            </p>
          </div>
        )}

        {/* Execute Button (placeholder) */}
        {actionableSuggestions.length > 0 && (
          <div className="pt-4 border-t">
            <Button disabled className="w-full">
              Auto-Rebalance (Coming Soon)
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Review suggestions and execute trades manually for now
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
