"use client";

import { useState } from "react";

interface TradeRecord {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  strategy: string;
  entryDate: string;
  exitDate: string;
}

interface PerformanceMetrics {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradesCount: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  avgHoldingTime: string;
}

const demoMetrics: PerformanceMetrics = {
  totalValue: 12450.32,
  totalPnl: 2450.32,
  totalPnlPercent: 24.5,
  winRate: 62.5,
  avgWin: 245.80,
  avgLoss: -128.45,
  sharpeRatio: 1.85,
  maxDrawdown: 8.3,
  tradesCount: 48,
  winningTrades: 30,
  losingTrades: 18,
  profitFactor: 2.1,
  avgHoldingTime: "2.4 days",
};

const demoTrades: TradeRecord[] = [
  { id: "1", symbol: "NVDA", side: "BUY", quantity: 10, entryPrice: 485.20, exitPrice: 512.45, pnl: 272.50, pnlPercent: 5.6, strategy: "Momentum", entryDate: "2024-01-28", exitDate: "2024-01-30" },
  { id: "2", symbol: "AAPL", side: "BUY", quantity: 20, entryPrice: 188.50, exitPrice: 185.20, pnl: -66.00, pnlPercent: -1.8, strategy: "RSI Reversal", entryDate: "2024-01-27", exitDate: "2024-01-29" },
  { id: "3", symbol: "TSLA", side: "BUY", quantity: 15, entryPrice: 182.40, exitPrice: 195.80, pnl: 201.00, pnlPercent: 7.3, strategy: "Breakout", entryDate: "2024-01-25", exitDate: "2024-01-28" },
  { id: "4", symbol: "AMD", side: "BUY", quantity: 25, entryPrice: 165.30, exitPrice: 172.15, pnl: 171.25, pnlPercent: 4.1, strategy: "Momentum", entryDate: "2024-01-24", exitDate: "2024-01-26" },
  { id: "5", symbol: "MSFT", side: "BUY", quantity: 8, entryPrice: 398.50, exitPrice: 392.20, pnl: -50.40, pnlPercent: -1.6, strategy: "RSI Reversal", entryDate: "2024-01-23", exitDate: "2024-01-25" },
  { id: "6", symbol: "GOOGL", side: "BUY", quantity: 30, entryPrice: 142.80, exitPrice: 148.50, pnl: 171.00, pnlPercent: 4.0, strategy: "Breakout", entryDate: "2024-01-22", exitDate: "2024-01-24" },
];

const dailyPnl = [
  { date: "Jan 22", pnl: 85 },
  { date: "Jan 23", pnl: -42 },
  { date: "Jan 24", pnl: 156 },
  { date: "Jan 25", pnl: 72 },
  { date: "Jan 26", pnl: 201 },
  { date: "Jan 27", pnl: -66 },
  { date: "Jan 28", pnl: 189 },
  { date: "Jan 29", pnl: 134 },
  { date: "Jan 30", pnl: 272 },
];

export default function AnalysisPage() {
  const [metrics] = useState<PerformanceMetrics>(demoMetrics);
  const [trades] = useState<TradeRecord[]>(demoTrades);
  const [timeframe, setTimeframe] = useState<"1W" | "1M" | "3M" | "YTD" | "ALL">("1M");
  const [filterStrategy, setFilterStrategy] = useState<string>("all");

  const filteredTrades = filterStrategy === "all" 
    ? trades 
    : trades.filter(t => t.strategy === filterStrategy);

  const strategies = [...new Set(trades.map(t => t.strategy))];
  
  // Calculate strategy breakdown
  const strategyStats = strategies.map(strategy => {
    const strategyTrades = trades.filter(t => t.strategy === strategy);
    const wins = strategyTrades.filter(t => t.pnl > 0).length;
    const totalPnl = strategyTrades.reduce((sum, t) => sum + t.pnl, 0);
    return {
      strategy,
      trades: strategyTrades.length,
      winRate: (wins / strategyTrades.length * 100).toFixed(1),
      totalPnl,
    };
  });

  const maxPnl = Math.max(...dailyPnl.map(d => Math.abs(d.pnl)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📈 Performance Analysis</h1>
        <div className="flex space-x-2">
          {(["1W", "1M", "3M", "YTD", "ALL"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                timeframe === tf
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Portfolio Value</div>
          <div className="text-2xl font-bold">${metrics.totalValue.toLocaleString()}</div>
          <div className={`text-sm ${metrics.totalPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {metrics.totalPnlPercent >= 0 ? "+" : ""}{metrics.totalPnlPercent}% all time
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Total P&L</div>
          <div className={`text-2xl font-bold ${metrics.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {metrics.totalPnl >= 0 ? "+" : ""}${metrics.totalPnl.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">{metrics.tradesCount} trades</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Win Rate</div>
          <div className="text-2xl font-bold">{metrics.winRate}%</div>
          <div className="text-sm text-gray-400">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Sharpe Ratio</div>
          <div className="text-2xl font-bold">{metrics.sharpeRatio}</div>
          <div className="text-sm text-gray-400">Profit Factor: {metrics.profitFactor}</div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Avg Win</div>
          <div className="text-lg font-bold text-green-400">+${metrics.avgWin.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Avg Loss</div>
          <div className="text-lg font-bold text-red-400">${metrics.avgLoss.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
          <div className="text-lg font-bold text-red-400">-{metrics.maxDrawdown}%</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Avg Holding</div>
          <div className="text-lg font-bold">{metrics.avgHoldingTime}</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Profit Factor</div>
          <div className="text-lg font-bold">{metrics.profitFactor}x</div>
        </div>
      </div>

      {/* P&L Chart */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">Daily P&L</h3>
        <div className="flex items-end h-48 space-x-2">
          {dailyPnl.map((day, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full rounded-t ${day.pnl >= 0 ? "bg-green-500" : "bg-red-500"}`}
                style={{
                  height: `${(Math.abs(day.pnl) / maxPnl) * 100}%`,
                  minHeight: "4px",
                }}
              />
              <div className="text-xs text-gray-500 mt-2">{day.date}</div>
              <div className={`text-xs ${day.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {day.pnl >= 0 ? "+" : ""}{day.pnl}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy Breakdown */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">Strategy Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          {strategyStats.map((stat) => (
            <div key={stat.strategy} className="bg-gray-800 rounded-lg p-4">
              <div className="font-medium mb-2">{stat.strategy}</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-gray-400">Trades</div>
                  <div className="font-bold">{stat.trades}</div>
                </div>
                <div>
                  <div className="text-gray-400">Win Rate</div>
                  <div className="font-bold">{stat.winRate}%</div>
                </div>
                <div>
                  <div className="text-gray-400">P&L</div>
                  <div className={`font-bold ${stat.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {stat.totalPnl >= 0 ? "+" : ""}${stat.totalPnl.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-medium">Trade History</h3>
          <div className="flex items-center space-x-2">
            <select
              value={filterStrategy}
              onChange={(e) => setFilterStrategy(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
            >
              <option value="all">All Strategies</option>
              {strategies.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-sm">
              Export CSV
            </button>
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Side</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Entry</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Exit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">P&L</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Strategy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filteredTrades.map((trade) => (
              <tr key={trade.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    trade.side === "BUY" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                  }`}>
                    {trade.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{trade.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">${trade.exitPrice.toFixed(2)}</td>
                <td className={`px-4 py-3 text-right font-mono ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)} ({trade.pnlPercent > 0 ? "+" : ""}{trade.pnlPercent}%)
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{trade.strategy}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{trade.exitDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
