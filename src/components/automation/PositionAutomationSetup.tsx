"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Position {
  symbol: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

interface PositionAutomationSetupProps {
  position: Position;
  onSetupComplete?: () => void;
}

export function PositionAutomationSetup({ position, onSetupComplete }: PositionAutomationSetupProps) {
  const [setupType, setSetupType] = useState<'oco' | 'stop_loss' | 'take_profit' | 'both'>('oco');
  const [stopLossAmount, setStopLossAmount] = useState<string>('2');
  const [takeProfitAmount, setTakeProfitAmount] = useState<string>('3');
  const [isPercent, setIsPercent] = useState(true);
  const [usePartialQty, setUsePartialQty] = useState(false);
  const [partialQty, setPartialQty] = useState<string>(String(Math.floor(position.quantity / 2)));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const calculatePrices = () => {
    const slAmount = parseFloat(stopLossAmount) || 0;
    const tpAmount = parseFloat(takeProfitAmount) || 0;
    const entry = position.avgEntryPrice;
    const isLong = position.side === 'long' || position.quantity > 0;

    let stopLossPrice: number;
    let takeProfitPrice: number;

    if (isPercent) {
      stopLossPrice = isLong 
        ? entry * (1 - slAmount / 100)
        : entry * (1 + slAmount / 100);
      takeProfitPrice = isLong
        ? entry * (1 + tpAmount / 100)
        : entry * (1 - tpAmount / 100);
    } else {
      stopLossPrice = isLong ? entry - slAmount : entry + slAmount;
      takeProfitPrice = isLong ? entry + tpAmount : entry - tpAmount;
    }

    return { stopLossPrice, takeProfitPrice };
  };

  const { stopLossPrice, takeProfitPrice } = calculatePrices();

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        setupType,
        isPercent,
      };

      if (usePartialQty) {
        body.quantity = parseFloat(partialQty);
      }

      if (setupType === 'stop_loss' || setupType === 'both' || setupType === 'oco') {
        body.stopLossAmount = parseFloat(stopLossAmount);
      }

      if (setupType === 'take_profit' || setupType === 'both' || setupType === 'oco') {
        body.takeProfitAmount = parseFloat(takeProfitAmount);
      }

      const response = await fetch(`/api/automation/position/${position.symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Automation rules created for ${position.symbol}!`,
        });
        onSetupComplete?.();
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to create automation rules',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }

    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Automation Setup - {position.symbol}
        </CardTitle>
        <CardDescription>
          Configure automated stop-loss and take-profit orders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Position Summary */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Entry Price</p>
              <p className="font-mono font-bold">${position.avgEntryPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Current Price</p>
              <p className="font-mono font-bold">${position.currentPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Quantity</p>
              <p className="font-mono font-bold">{position.quantity}</p>
            </div>
            <div>
              <p className="text-muted-foreground">P&L</p>
              <p className={`font-mono font-bold ${position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)} 
                ({position.unrealizedPLPercent >= 0 ? '+' : ''}{position.unrealizedPLPercent.toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>

        {/* Setup Type Selection */}
        <div>
          <Label className="mb-3 block">Automation Type</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              variant={setupType === 'oco' ? 'default' : 'outline'}
              className="w-full"
              onClick={() => setSetupType('oco')}
            >
              OCO (Recommended)
            </Button>
            <Button
              variant={setupType === 'stop_loss' ? 'default' : 'outline'}
              className="w-full"
              onClick={() => setSetupType('stop_loss')}
            >
              Stop Loss Only
            </Button>
            <Button
              variant={setupType === 'take_profit' ? 'default' : 'outline'}
              className="w-full"
              onClick={() => setSetupType('take_profit')}
            >
              Take Profit Only
            </Button>
            <Button
              variant={setupType === 'both' ? 'default' : 'outline'}
              className="w-full"
              onClick={() => setSetupType('both')}
            >
              Both (Separate)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            OCO = One-Cancels-Other: When one triggers, the other is automatically cancelled
          </p>
        </div>

        {/* Amount Type Toggle */}
        <div className="flex items-center gap-4">
          <Label>Amount Type:</Label>
          <div className="flex items-center gap-2">
            <span className={!isPercent ? 'font-bold' : 'text-muted-foreground'}>Dollar ($)</span>
            <Switch checked={isPercent} onCheckedChange={setIsPercent} />
            <span className={isPercent ? 'font-bold' : 'text-muted-foreground'}>Percent (%)</span>
          </div>
        </div>

        {/* Stop Loss & Take Profit Inputs */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Stop Loss */}
          {(setupType === 'stop_loss' || setupType === 'both' || setupType === 'oco') && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Stop Loss
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{isPercent ? '' : '$'}</span>
                <Input
                  type="number"
                  value={stopLossAmount}
                  onChange={(e) => setStopLossAmount(e.target.value)}
                  className="font-mono"
                  step={isPercent ? '0.5' : '0.01'}
                  min="0"
                />
                <span className="text-muted-foreground">{isPercent ? '%' : ''}</span>
              </div>
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                <p className="text-red-700">
                  Trigger: <span className="font-mono font-bold">${stopLossPrice.toFixed(2)}</span>
                </p>
                <p className="text-red-600 text-xs">
                  Max loss: ${(Math.abs(position.avgEntryPrice - stopLossPrice) * (usePartialQty ? parseFloat(partialQty) : position.quantity)).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Take Profit */}
          {(setupType === 'take_profit' || setupType === 'both' || setupType === 'oco') && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                Take Profit
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{isPercent ? '' : '$'}</span>
                <Input
                  type="number"
                  value={takeProfitAmount}
                  onChange={(e) => setTakeProfitAmount(e.target.value)}
                  className="font-mono"
                  step={isPercent ? '0.5' : '0.01'}
                  min="0"
                />
                <span className="text-muted-foreground">{isPercent ? '%' : ''}</span>
              </div>
              <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                <p className="text-green-700">
                  Target: <span className="font-mono font-bold">${takeProfitPrice.toFixed(2)}</span>
                </p>
                <p className="text-green-600 text-xs">
                  Potential gain: ${(Math.abs(takeProfitPrice - position.avgEntryPrice) * (usePartialQty ? parseFloat(partialQty) : position.quantity)).toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Partial Quantity Option */}
        <div className="flex items-center gap-4">
          <Switch checked={usePartialQty} onCheckedChange={setUsePartialQty} />
          <Label>Use partial quantity</Label>
          {usePartialQty && (
            <Input
              type="number"
              value={partialQty}
              onChange={(e) => setPartialQty(e.target.value)}
              className="w-24 font-mono"
              max={position.quantity}
              min="1"
            />
          )}
        </div>

        {/* Risk/Reward Summary */}
        {(setupType === 'oco' || setupType === 'both') && (
          <div className="p-4 border rounded-lg">
            <p className="font-medium mb-2">Risk/Reward Ratio</p>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-lg px-3 py-1">
                1 : {((parseFloat(takeProfitAmount) || 0) / (parseFloat(stopLossAmount) || 1)).toFixed(2)}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {((parseFloat(takeProfitAmount) || 0) / (parseFloat(stopLossAmount) || 1)) >= 2 
                  ? '✅ Good risk/reward ratio'
                  : '⚠️ Consider increasing take profit or decreasing stop loss'}
              </p>
            </div>
          </div>
        )}

        {/* Result Message */}
        {result && (
          <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={result.success ? 'text-green-700' : 'text-red-700'}>
              {result.success && <CheckCircle2 className="h-4 w-4 inline mr-2" />}
              {!result.success && <AlertTriangle className="h-4 w-4 inline mr-2" />}
              {result.message}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button 
          onClick={handleSubmit} 
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? 'Creating Rules...' : `Create ${setupType.toUpperCase().replace('_', ' ')} Automation`}
        </Button>
      </CardContent>
    </Card>
  );
}
