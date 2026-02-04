"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export interface StrategyData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  symbols: string[];
  enabled: boolean;
  allocatedCapital: number;
  totalPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

interface StrategyCardProps {
  strategy: StrategyData;
  onToggle: (id: string) => void;
  onEdit: (strategy: StrategyData) => void;
  onDelete: (id: string) => void;
}

const typeColors: Record<string, string> = {
  momentum: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  meanReversion: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  breakout: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  manual: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function StrategyCard({
  strategy,
  onToggle,
  onEdit,
  onDelete,
}: StrategyCardProps) {
  const winRate =
    strategy.totalTrades > 0
      ? ((strategy.winningTrades / strategy.totalTrades) * 100).toFixed(1)
      : "0.0";

  return (
    <Card
      className={`bg-gray-900 border ${
        strategy.enabled ? "border-green-700/50" : "border-gray-800"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{strategy.name}</CardTitle>
            <span
              className={`px-2 py-0.5 rounded text-xs border ${
                typeColors[strategy.type] || typeColors.manual
              }`}
            >
              {strategy.type}
            </span>
          </div>
          <Switch
            checked={strategy.enabled}
            onCheckedChange={() => onToggle(strategy.id)}
          />
        </div>
        {strategy.description && (
          <p className="text-sm text-muted-foreground">{strategy.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">P&L</div>
            <div
              className={`font-semibold ${
                strategy.totalPnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {strategy.totalPnl >= 0 ? "+" : ""}$
              {strategy.totalPnl.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Win Rate</div>
            <div className="font-semibold">{winRate}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Capital</div>
            <div className="font-semibold">
              ${strategy.allocatedCapital.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {strategy.symbols.map((symbol) => (
            <Badge key={symbol} variant="secondary" className="text-xs">
              {symbol}
            </Badge>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(strategy)}
          >
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(strategy.id)}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
