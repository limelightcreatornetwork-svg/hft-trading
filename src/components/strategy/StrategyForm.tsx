"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StrategyData } from "./StrategyCard";

interface StrategyFormProps {
  initial?: StrategyData | null;
  onSubmit: (data: StrategyFormData) => void;
  onCancel: () => void;
}

export interface StrategyFormData {
  name: string;
  description: string;
  type: string;
  symbols: string[];
  allocatedCapital: number;
  maxPositionSize: number;
  riskPerTrade: number;
  entryConditions: Record<string, unknown>;
  exitConditions: Record<string, unknown>;
  positionSizing: Record<string, unknown>;
  riskParams: Record<string, unknown>;
}

export default function StrategyForm({
  initial,
  onSubmit,
  onCancel,
}: StrategyFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [type, setType] = useState(initial?.type || "momentum");
  const [symbolsInput, setSymbolsInput] = useState(
    initial?.symbols.join(", ") || ""
  );
  const [allocatedCapital, setAllocatedCapital] = useState(
    initial?.allocatedCapital || 10000
  );
  const [maxPositionSize, setMaxPositionSize] = useState(1000);
  const [riskPerTrade, setRiskPerTrade] = useState(0.02);
  const [stopLoss, setStopLoss] = useState(2);
  const [takeProfit, setTakeProfit] = useState(4);
  const [trailingStop, setTrailingStop] = useState(1.5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const symbols = symbolsInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    onSubmit({
      name,
      description,
      type,
      symbols,
      allocatedCapital,
      maxPositionSize,
      riskPerTrade,
      entryConditions: { indicators: ["RSI", "MACD"] },
      exitConditions: { stopLoss, takeProfit, trailingStop },
      positionSizing: { method: "percent", value: riskPerTrade * 100 },
      riskParams: { maxLoss: riskPerTrade, maxPositions: 5 },
    });
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-lg">
          {initial ? "Edit Strategy" : "New Strategy"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Strategy name"
                required
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-10 bg-gray-800 border border-gray-700 rounded-md px-3 text-sm"
              >
                <option value="manual">Manual</option>
                <option value="momentum">Momentum</option>
                <option value="meanReversion">Mean Reversion</option>
                <option value="breakout">Breakout</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm min-h-[60px]"
              placeholder="Describe the strategy..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbols">Symbols (comma-separated)</Label>
            <Input
              id="symbols"
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="AAPL, MSFT, TSLA"
              required
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capital">Allocated Capital ($)</Label>
              <Input
                id="capital"
                type="number"
                value={allocatedCapital}
                onChange={(e) => setAllocatedCapital(Number(e.target.value))}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="posSize">Max Position Size ($)</Label>
              <Input
                id="posSize"
                type="number"
                value={maxPositionSize}
                onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk">Risk per Trade (%)</Label>
              <Input
                id="risk"
                type="number"
                step="0.01"
                value={(riskPerTrade * 100).toFixed(1)}
                onChange={(e) =>
                  setRiskPerTrade(Number(e.target.value) / 100)
                }
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>

          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium mb-3">Exit Conditions</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sl">Stop Loss (%)</Label>
                <Input
                  id="sl"
                  type="number"
                  step="0.1"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp">Take Profit (%)</Label>
                <Input
                  id="tp"
                  type="number"
                  step="0.1"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ts">Trailing Stop (%)</Label>
                <Input
                  id="ts"
                  type="number"
                  step="0.1"
                  value={trailingStop}
                  onChange={(e) => setTrailingStop(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {initial ? "Update" : "Create"} Strategy
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
