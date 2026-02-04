"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { StrategyData } from "./StrategyCard";

interface StrategyStatsProps {
  strategies: StrategyData[];
}

export default function StrategyStats({ strategies }: StrategyStatsProps) {
  const totalPnl = strategies.reduce((sum, s) => sum + s.totalPnl, 0);
  const totalTrades = strategies.reduce((sum, s) => sum + s.totalTrades, 0);
  const totalWins = strategies.reduce((sum, s) => sum + s.winningTrades, 0);
  const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const enabledCount = strategies.filter((s) => s.enabled).length;
  const totalCapital = strategies.reduce(
    (sum, s) => sum + s.allocatedCapital,
    0
  );

  const stats = [
    {
      label: "Total P&L",
      value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`,
      color: totalPnl >= 0 ? "text-green-400" : "text-red-400",
    },
    {
      label: "Win Rate",
      value: `${overallWinRate.toFixed(1)}%`,
      color: "text-white",
    },
    {
      label: "Enabled",
      value: `${enabledCount} / ${strategies.length}`,
      color: "text-white",
    },
    {
      label: "Total Capital",
      value: `$${totalCapital.toLocaleString()}`,
      color: "text-white",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className={`text-xl font-bold ${stat.color}`}>
              {stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
