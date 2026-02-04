"use client";

import { useState } from "react";

interface Strategy {
  id: string;
  name: string;
  type: string;
  description: string;
  isActive: boolean;
  symbols: string[];
  entryConditions: {
    indicator: string;
    condition: string;
    value: number;
  }[];
  exitConditions: {
    stopLoss: number;
    takeProfit: number;
    trailingStop: number;
  };
  positionSizing: {
    method: string;
    value: number;
  };
  backtestResults?: {
    returns: number;
    sharpe: number;
    winRate: number;
    maxDrawdown: number;
  };
}

const defaultStrategies: Strategy[] = [
  {
    id: "1",
    name: "RSI Reversal",
    type: "meanReversion",
    description: "Buy oversold, sell overbought based on RSI signals",
    isActive: false,
    symbols: ["AAPL", "MSFT", "GOOGL"],
    entryConditions: [
      { indicator: "RSI", condition: "below", value: 30 },
    ],
    exitConditions: { stopLoss: 3, takeProfit: 5, trailingStop: 2 },
    positionSizing: { method: "percent", value: 5 },
    backtestResults: { returns: 12.5, sharpe: 1.4, winRate: 58, maxDrawdown: 8 },
  },
  {
    id: "2",
    name: "Momentum Breakout",
    type: "momentum",
    description: "Enter on price breakout above resistance with volume confirmation",
    isActive: true,
    symbols: ["NVDA", "AMD", "TSLA"],
    entryConditions: [
      { indicator: "Price", condition: "above", value: 0 },
      { indicator: "Volume", condition: "above", value: 150 },
    ],
    exitConditions: { stopLoss: 5, takeProfit: 10, trailingStop: 3 },
    positionSizing: { method: "kelly", value: 25 },
    backtestResults: { returns: 24.3, sharpe: 1.8, winRate: 45, maxDrawdown: 15 },
  },
];

export default function StrategyPage() {
  const [strategies, setStrategies] = useState<Strategy[]>(defaultStrategies);
  // Strategy editing is implemented in /strategies page (see src/app/strategies/page.tsx)
  const [_editingStrategy, _setEditingStrategy] = useState<Strategy | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const [newStrategy, setNewStrategy] = useState<Partial<Strategy>>({
    name: "",
    type: "manual",
    description: "",
    symbols: [],
    entryConditions: [{ indicator: "RSI", condition: "below", value: 30 }],
    exitConditions: { stopLoss: 5, takeProfit: 10, trailingStop: 3 },
    positionSizing: { method: "percent", value: 5 },
  });

  const [riskCalc, setRiskCalc] = useState({
    accountSize: 10000,
    riskPercent: 2,
    entryPrice: 150,
    stopLoss: 145,
  });

  const toggleStrategy = (id: string) => {
    setStrategies(
      strategies.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      )
    );
  };

  const calculatePositionSize = () => {
    const riskAmount = riskCalc.accountSize * (riskCalc.riskPercent / 100);
    const riskPerShare = riskCalc.entryPrice - riskCalc.stopLoss;
    if (riskPerShare <= 0) return { shares: 0, dollarValue: 0 };
    const shares = Math.floor(riskAmount / riskPerShare);
    return { shares, dollarValue: shares * riskCalc.entryPrice };
  };

  const positionSize = calculatePositionSize();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎯 Strategy Management</h1>
        <button
          onClick={() => setShowBuilder(!showBuilder)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {showBuilder ? "Hide Builder" : "+ New Strategy"}
        </button>
      </div>

      {/* Strategy Builder */}
      {showBuilder && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
          <h3 className="text-lg font-medium">Strategy Builder</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Strategy Name</label>
              <input
                type="text"
                value={newStrategy.name}
                onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                placeholder="My Strategy"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select
                value={newStrategy.type}
                onChange={(e) => setNewStrategy({ ...newStrategy, type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              >
                <option value="manual">Manual</option>
                <option value="momentum">Momentum</option>
                <option value="meanReversion">Mean Reversion</option>
                <option value="breakout">Breakout</option>
                <option value="scalping">Scalping</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={newStrategy.description}
              onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 h-20"
              placeholder="Describe your strategy..."
            />
          </div>

          {/* Entry Conditions */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-medium mb-3">Entry Conditions</h4>
            {newStrategy.entryConditions?.map((condition, idx) => (
              <div key={idx} className="flex items-center space-x-2 mb-2">
                <select
                  value={condition.indicator}
                  onChange={(e) => {
                    const updated = [...(newStrategy.entryConditions || [])];
                    updated[idx].indicator = e.target.value;
                    setNewStrategy({ ...newStrategy, entryConditions: updated });
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
                >
                  <option value="RSI">RSI</option>
                  <option value="MACD">MACD</option>
                  <option value="Price">Price vs SMA</option>
                  <option value="Volume">Volume %</option>
                </select>
                <select
                  value={condition.condition}
                  onChange={(e) => {
                    const updated = [...(newStrategy.entryConditions || [])];
                    updated[idx].condition = e.target.value;
                    setNewStrategy({ ...newStrategy, entryConditions: updated });
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
                >
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                  <option value="crosses">Crosses</option>
                </select>
                <input
                  type="number"
                  value={condition.value}
                  onChange={(e) => {
                    const updated = [...(newStrategy.entryConditions || [])];
                    updated[idx].value = Number(e.target.value);
                    setNewStrategy({ ...newStrategy, entryConditions: updated });
                  }}
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1"
                />
              </div>
            ))}
            <button
              onClick={() =>
                setNewStrategy({
                  ...newStrategy,
                  entryConditions: [
                    ...(newStrategy.entryConditions || []),
                    { indicator: "RSI", condition: "below", value: 30 },
                  ],
                })
              }
              className="text-blue-400 text-sm hover:underline"
            >
              + Add Condition
            </button>
          </div>

          {/* Exit Conditions */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-medium mb-3">Exit Conditions</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stop Loss %</label>
                <input
                  type="number"
                  value={newStrategy.exitConditions?.stopLoss}
                  onChange={(e) =>
                    setNewStrategy({
                      ...newStrategy,
                      exitConditions: { ...newStrategy.exitConditions!, stopLoss: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Take Profit %</label>
                <input
                  type="number"
                  value={newStrategy.exitConditions?.takeProfit}
                  onChange={(e) =>
                    setNewStrategy({
                      ...newStrategy,
                      exitConditions: { ...newStrategy.exitConditions!, takeProfit: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Trailing Stop %</label>
                <input
                  type="number"
                  value={newStrategy.exitConditions?.trailingStop}
                  onChange={(e) =>
                    setNewStrategy({
                      ...newStrategy,
                      exitConditions: { ...newStrategy.exitConditions!, trailingStop: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                />
              </div>
            </div>
          </div>

          <div className="flex space-x-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
              Save Strategy
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium">
              Run Backtest
            </button>
          </div>
        </div>
      )}

      {/* Position Size Calculator */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">📐 Position Size Calculator</h3>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Account Size</label>
            <input
              type="number"
              value={riskCalc.accountSize}
              onChange={(e) => setRiskCalc({ ...riskCalc, accountSize: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Risk %</label>
            <input
              type="number"
              value={riskCalc.riskPercent}
              onChange={(e) => setRiskCalc({ ...riskCalc, riskPercent: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Entry Price</label>
            <input
              type="number"
              value={riskCalc.entryPrice}
              onChange={(e) => setRiskCalc({ ...riskCalc, entryPrice: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Stop Loss</label>
            <input
              type="number"
              value={riskCalc.stopLoss}
              onChange={(e) => setRiskCalc({ ...riskCalc, stopLoss: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-800">
            <div className="text-xs text-blue-400 mb-1">Position Size</div>
            <div className="text-xl font-bold">{positionSize.shares} shares</div>
            <div className="text-xs text-gray-400">${positionSize.dollarValue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Active Strategies */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Your Strategies</h3>
        {strategies.map((strategy) => (
          <div
            key={strategy.id}
            className={`bg-gray-900 rounded-xl p-4 border ${
              strategy.isActive ? "border-green-700" : "border-gray-800"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="font-bold text-lg">{strategy.name}</h4>
                  <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                    {strategy.type}
                  </span>
                  {strategy.isActive && (
                    <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mb-3">{strategy.description}</p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {strategy.symbols.map((symbol) => (
                    <span key={symbol} className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                      {symbol}
                    </span>
                  ))}
                </div>

                {strategy.backtestResults && (
                  <div className="grid grid-cols-4 gap-4 p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <div className="text-xs text-gray-400">Returns</div>
                      <div className={`font-bold ${strategy.backtestResults.returns > 0 ? "text-green-400" : "text-red-400"}`}>
                        {strategy.backtestResults.returns > 0 ? "+" : ""}{strategy.backtestResults.returns}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Sharpe</div>
                      <div className="font-bold">{strategy.backtestResults.sharpe}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Win Rate</div>
                      <div className="font-bold">{strategy.backtestResults.winRate}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Max DD</div>
                      <div className="font-bold text-red-400">-{strategy.backtestResults.maxDrawdown}%</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => toggleStrategy(strategy.id)}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    strategy.isActive
                      ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                      : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                  }`}
                >
                  {strategy.isActive ? "Disable" : "Enable"}
                </button>
                <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Edit
                </button>
                <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Backtest
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
