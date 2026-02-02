'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfidenceBreakdown, ConfidenceIndicator } from './ConfidenceIndicator';

interface ConfidencePreview {
  total: number;
  technical: number;
  riskReward: number;
  marketConditions: number;
  timeOfDay: number;
  recommendation: string;
  positionSizePct: number;
  reasoning: string[];
  breakdown: {
    regime: string;
    regimeConfidence: number;
    vixLevel: number;
    marketHour: string;
  };
}

interface SuggestedLevels {
  takeProfit: number;
  takeProfitPct: number;
  stopLoss: number;
  stopLossPct: number;
  atrBased: boolean;
}

export function ConfidenceTradeForm() {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [takeProfitPct, setTakeProfitPct] = useState('');
  const [stopLossPct, setStopLossPct] = useState('');
  const [timeStopHours, setTimeStopHours] = useState('4');
  const [trailingStopPct, setTrailingStopPct] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ConfidencePreview | null>(null);
  const [suggestedLevels, setSuggestedLevels] = useState<SuggestedLevels | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const previewConfidence = async () => {
    if (!symbol || !entryPrice) {
      setError('Symbol and entry price are required');
      return;
    }
    
    setPreviewing(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/trade?symbol=${symbol}&side=${side}&entryPrice=${entryPrice}`
      );
      if (!response.ok) throw new Error('Failed to preview');
      
      const data = await response.json();
      setPreview(data.confidence);
      setSuggestedLevels(data.suggestedLevels);
      
      // Auto-fill suggested levels if not already set
      if (!takeProfitPct && data.suggestedLevels) {
        setTakeProfitPct(data.suggestedLevels.takeProfitPct.toFixed(1));
      }
      if (!stopLossPct && data.suggestedLevels) {
        setStopLossPct(data.suggestedLevels.stopLossPct.toFixed(1));
      }
    } catch (err) {
      setError('Failed to preview confidence');
      console.error(err);
    } finally {
      setPreviewing(false);
    }
  };

  const submitTrade = async () => {
    if (!symbol || !quantity || !entryPrice) {
      setError('Symbol, quantity, and entry price are required');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          quantity: parseFloat(quantity),
          entryPrice: parseFloat(entryPrice),
          takeProfitPct: takeProfitPct ? parseFloat(takeProfitPct) : undefined,
          stopLossPct: stopLossPct ? parseFloat(stopLossPct) : undefined,
          timeStopHours: timeStopHours ? parseFloat(timeStopHours) : undefined,
          trailingStopPct: trailingStopPct ? parseFloat(trailingStopPct) : undefined,
        }),
      });
      
      const data = await response.json();
      
      if (data.skipped) {
        setResult({ 
          type: 'skipped', 
          message: data.reason,
          confidence: data.confidence,
        });
      } else if (data.success) {
        setResult({ 
          type: 'success', 
          position: data.position,
          confidence: data.confidence,
        });
        // Reset form
        setSymbol('');
        setQuantity('');
        setEntryPrice('');
        setTakeProfitPct('');
        setStopLossPct('');
        setTrailingStopPct('');
        setPreview(null);
        setSuggestedLevels(null);
      } else {
        setError(data.error || 'Failed to submit trade');
      }
    } catch (err) {
      setError('Failed to submit trade');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place Trade with Confidence Scoring</CardTitle>
        <CardDescription>
          Trades are automatically scored 1-10 based on market conditions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form Section */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Symbol</label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  onBlur={previewConfidence}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Side</label>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant={side === 'buy' ? 'default' : 'outline'}
                    onClick={() => setSide('buy')}
                    className={side === 'buy' ? 'bg-green-600' : ''}
                  >
                    BUY
                  </Button>
                  <Button
                    size="sm"
                    variant={side === 'sell' ? 'default' : 'outline'}
                    onClick={() => setSide('sell')}
                    className={side === 'sell' ? 'bg-red-600' : ''}
                  >
                    SELL
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Entry Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="150.00"
                  onBlur={previewConfidence}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Take Profit %</label>
                <Input
                  type="number"
                  step="0.1"
                  value={takeProfitPct}
                  onChange={(e) => setTakeProfitPct(e.target.value)}
                  placeholder={suggestedLevels?.takeProfitPct.toFixed(1) || '2.0'}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Stop Loss %</label>
                <Input
                  type="number"
                  step="0.1"
                  value={stopLossPct}
                  onChange={(e) => setStopLossPct(e.target.value)}
                  placeholder={suggestedLevels?.stopLossPct.toFixed(1) || '1.0'}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Time Stop (hours)</label>
                <Input
                  type="number"
                  step="0.5"
                  value={timeStopHours}
                  onChange={(e) => setTimeStopHours(e.target.value)}
                  placeholder="4"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Trailing Stop % (optional)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={trailingStopPct}
                  onChange={(e) => setTrailingStopPct(e.target.value)}
                  placeholder="1.5"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={previewConfidence}
                disabled={previewing || !symbol}
              >
                {previewing ? 'Analyzing...' : 'Preview Confidence'}
              </Button>
              <Button 
                onClick={submitTrade}
                disabled={loading || !symbol || !quantity || !entryPrice}
              >
                {loading ? 'Submitting...' : 'Submit Trade'}
              </Button>
            </div>
            
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            
            {result && (
              <div className={`p-4 rounded-lg ${
                result.type === 'success' ? 'bg-green-50 border border-green-200' :
                result.type === 'skipped' ? 'bg-yellow-50 border border-yellow-200' :
                'bg-red-50 border border-red-200'
              }`}>
                {result.type === 'success' && (
                  <>
                    <p className="font-semibold text-green-700">✓ Trade Created</p>
                    <p className="text-sm text-green-600">
                      {result.position.symbol} {result.position.side.toUpperCase()} x{result.position.quantity}
                    </p>
                  </>
                )}
                {result.type === 'skipped' && (
                  <>
                    <p className="font-semibold text-yellow-700">⚠ Trade Skipped</p>
                    <p className="text-sm text-yellow-600">{result.message}</p>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Preview Section */}
          <div className="space-y-4">
            {preview ? (
              <>
                <ConfidenceBreakdown
                  total={preview.total}
                  technical={preview.technical}
                  riskReward={preview.riskReward}
                  marketConditions={preview.marketConditions}
                  timeOfDay={preview.timeOfDay}
                />
                
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Recommendation</span>
                    <Badge className={
                      preview.recommendation === 'FULL' ? 'bg-green-500' :
                      preview.recommendation === 'MEDIUM' ? 'bg-yellow-500' :
                      preview.recommendation === 'SMALL' ? 'bg-orange-500' :
                      'bg-red-500'
                    }>
                      {preview.recommendation}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Position Size: <strong>{preview.positionSizePct}%</strong> of portfolio
                  </p>
                </div>
                
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Analysis:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {preview.reasoning.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
                
                {suggestedLevels && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-700 mb-2">
                      Suggested Levels {suggestedLevels.atrBased ? '(ATR-based)' : '(Default)'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p className="text-green-600">
                        TP: ${suggestedLevels.takeProfit.toFixed(2)} (+{suggestedLevels.takeProfitPct.toFixed(1)}%)
                      </p>
                      <p className="text-red-600">
                        SL: ${suggestedLevels.stopLoss.toFixed(2)} (-{suggestedLevels.stopLossPct.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Enter symbol and price to preview confidence score
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
