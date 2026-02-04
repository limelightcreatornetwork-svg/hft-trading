"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutomationRulesPanel } from "@/components/automation/AutomationRulesPanel";
import { PositionAutomationSetup } from "@/components/automation/PositionAutomationSetup";
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Position {
  symbol: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  costBasis: number;
}

interface PositionWithAutomation extends Position {
  hasAutomation?: boolean;
  rulesCount?: number;
}

export default function AutomationPage() {
  const [positions, setPositions] = useState<PositionWithAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, _setSelectedPosition] = useState<string | null>(null);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  const fetchPositions = async () => {
    try {
      const posResponse = await fetch('/api/positions');
      const posData = await posResponse.json();
      
      if (posData.success && posData.data?.positions) {
        const positionsWithAutomation: PositionWithAutomation[] = await Promise.all(
          posData.data.positions.map(async (pos: Position) => {
            try {
              const autoResponse = await fetch(`/api/automation/position/${pos.symbol}`);
              const autoData = await autoResponse.json();
              return {
                ...pos,
                side: pos.quantity > 0 ? 'long' : 'short',
                avgEntryPrice: pos.avgEntryPrice || (pos as unknown as { avgEntryPrice?: number }).avgEntryPrice || 0,
                hasAutomation: autoData.success && autoData.data.rulesCount > 0,
                rulesCount: autoData.success ? autoData.data.rulesCount : 0,
              };
            } catch {
              return {
                ...pos,
                side: pos.quantity > 0 ? 'long' : 'short',
                avgEntryPrice: pos.avgEntryPrice || 0,
                hasAutomation: false,
                rulesCount: 0,
              };
            }
          })
        );
        setPositions(positionsWithAutomation);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Data fetching pattern
    fetchPositions();
  }, []);

  const toggleExpand = (symbol: string) => {
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Trading Bot Automation</h1>
        <Card>
          <CardContent className="p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading positions and automation rules...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Trading Bot Automation</h1>
          <p className="text-muted-foreground">
            Configure automated stop-loss, take-profit, and OCO orders for your positions
          </p>
        </div>
        <Button onClick={fetchPositions} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Positions with Automation Setup */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Positions List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Positions</CardTitle>
            <CardDescription>
              {positions.length} position(s) • Click to configure automation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No open positions</p>
                <p className="text-sm mt-2">Open a position to configure automation</p>
              </div>
            ) : (
              <div className="space-y-2">
                {positions.map((position) => (
                  <div key={position.symbol}>
                    <div 
                      className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedPosition === position.symbol 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleExpand(position.symbol)}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{position.symbol}</span>
                            <Badge variant={position.side === 'long' ? 'default' : 'secondary'}>
                              {position.side}
                            </Badge>
                            {position.hasAutomation ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                {position.rulesCount} rule(s)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                No automation
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {position.quantity} shares @ ${position.avgEntryPrice.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`font-mono ${position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {position.unrealizedPLPercent >= 0 ? '+' : ''}{position.unrealizedPLPercent.toFixed(2)}%
                          </p>
                        </div>
                        {expandedPositions.has(position.symbol) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded Setup Form */}
                    {expandedPositions.has(position.symbol) && (
                      <div className="mt-2 ml-4 border-l-2 pl-4">
                        <PositionAutomationSetup 
                          position={position}
                          onSetupComplete={fetchPositions}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Automation Rules Panel */}
        <AutomationRulesPanel />
      </div>

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>How Automation Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">🛑 Stop Loss</h4>
              <p className="text-sm text-muted-foreground">
                Automatically sell when price drops by a set % or $ amount to limit losses.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">🎯 Take Profit</h4>
              <p className="text-sm text-muted-foreground">
                Automatically sell when price rises by a set % or $ amount to lock in gains.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">⚖️ OCO Orders</h4>
              <p className="text-sm text-muted-foreground">
                One-Cancels-Other: Set both stop-loss and take-profit. When one triggers, the other cancels.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">📈 Limit Orders</h4>
              <p className="text-sm text-muted-foreground">
                Set price targets to automatically buy or sell when a specific price is reached.
              </p>
            </div>
          </div>
          
          <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Important:</strong> The position monitor service checks prices periodically. 
              For the best execution, ensure the monitor is running during market hours. 
              You can trigger a manual check from the Bot Monitor panel above.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
