"use client";

import { useState, useMemo } from "react";

interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: number;
}

interface WatchlistItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

interface TechnicalData {
  symbol: string;
  rsi: number;
  macd: number;
  sma20: number;
  sma50: number;
  sma200: number;
}

// Demo watchlist symbols
const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA", "META", "AMZN", "AMD"];

// Generate demo data functions
function generateDemoWatchlist(): WatchlistItem[] {
  return DEFAULT_WATCHLIST.map((symbol) => ({
    symbol,
    price: 100 + Math.random() * 400,
    change: (Math.random() - 0.5) * 20,
    changePercent: (Math.random() - 0.5) * 10,
    volume: Math.floor(Math.random() * 50000000),
  }));
}

function generateDemoTechnicals(): TechnicalData[] {
  return DEFAULT_WATCHLIST.map((symbol) => ({
    symbol,
    rsi: 30 + Math.random() * 40,
    macd: (Math.random() - 0.5) * 5,
    sma20: 100 + Math.random() * 400,
    sma50: 100 + Math.random() * 400,
    sma200: 100 + Math.random() * 400,
  }));
}

function generateDemoNews(): NewsItem[] {
  const now = new Date().toISOString();
  return [
    { id: "1", headline: "Tech Stocks Rally on AI Optimism", summary: "Major tech companies see gains as AI investments pay off.", source: "Reuters", url: "#", publishedAt: now, sentiment: 0.7 },
    { id: "2", headline: "Fed Signals Potential Rate Cuts", summary: "Federal Reserve hints at possible rate reductions in coming months.", source: "Bloomberg", url: "#", publishedAt: now, sentiment: 0.5 },
    { id: "3", headline: "NVIDIA Beats Earnings Expectations", summary: "Chip maker reports record revenue driven by AI demand.", source: "CNBC", url: "#", publishedAt: now, sentiment: 0.9 },
    { id: "4", headline: "Market Volatility Expected to Rise", summary: "Analysts warn of increased volatility ahead of earnings season.", source: "MarketWatch", url: "#", publishedAt: now, sentiment: -0.3 },
  ];
}

export default function ResearchPage() {
  // Initialize state with demo data directly
  const initialWatchlist = useMemo(() => generateDemoWatchlist(), []);
  const initialTechnicals = useMemo(() => generateDemoTechnicals(), []);
  const initialNews = useMemo(() => generateDemoNews(), []);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(initialWatchlist);
  const [news] = useState<NewsItem[]>(initialNews);
  const [technicals] = useState<TechnicalData[]>(initialTechnicals);
  const [newSymbol, setNewSymbol] = useState("");
  const [loading] = useState(false);
  const [activeTab, setActiveTab] = useState<"watchlist" | "screener" | "news">("watchlist");

  const addToWatchlist = () => {
    if (newSymbol && !watchlist.find((w) => w.symbol === newSymbol.toUpperCase())) {
      setWatchlist([
        ...watchlist,
        {
          symbol: newSymbol.toUpperCase(),
          price: 100 + Math.random() * 200,
          change: (Math.random() - 0.5) * 10,
          changePercent: (Math.random() - 0.5) * 5,
          volume: Math.floor(Math.random() * 10000000),
        },
      ]);
      setNewSymbol("");
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter((w) => w.symbol !== symbol));
  };

  const getSentimentColor = (sentiment?: number) => {
    if (!sentiment) return "text-gray-400";
    if (sentiment > 0.3) return "text-green-400";
    if (sentiment < -0.3) return "text-red-400";
    return "text-yellow-400";
  };

  const getRsiSignal = (rsi: number) => {
    if (rsi < 30) return { signal: "OVERSOLD", color: "text-green-400" };
    if (rsi > 70) return { signal: "OVERBOUGHT", color: "text-red-400" };
    return { signal: "NEUTRAL", color: "text-gray-400" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔬 Research Center</h1>
        <div className="flex space-x-2">
          {(["watchlist", "screener", "news"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "watchlist" && (
        <div className="space-y-4">
          {/* Add Symbol */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && addToWatchlist()}
                placeholder="Add symbol (e.g., AAPL)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addToWatchlist}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Watchlist Table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Symbol</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Change</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Volume</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">RSI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Signal</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {watchlist.map((item) => {
                  const tech = technicals.find((t) => t.symbol === item.symbol);
                  const rsiSignal = tech ? getRsiSignal(tech.rsi) : null;
                  return (
                    <tr key={item.symbol} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{item.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono">${item.price.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${item.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)} ({item.changePercent.toFixed(2)}%)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">
                        {(item.volume / 1000000).toFixed(2)}M
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {tech?.rsi.toFixed(1) || "-"}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${rsiSignal?.color || ""}`}>
                        {rsiSignal?.signal || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeFromWatchlist(item.symbol)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "screener" && (
        <div className="space-y-4">
          {/* Screener Filters */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-lg font-medium mb-4">Stock Screener</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">RSI Range</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <option value="all">All</option>
                  <option value="oversold">Oversold (&lt;30)</option>
                  <option value="overbought">Overbought (&gt;70)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Price vs SMA</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <option value="all">All</option>
                  <option value="above50">Above SMA50</option>
                  <option value="below50">Below SMA50</option>
                  <option value="above200">Above SMA200</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">MACD</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <option value="all">All</option>
                  <option value="bullish">Bullish Cross</option>
                  <option value="bearish">Bearish Cross</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Volume</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <option value="all">All</option>
                  <option value="high">High Volume</option>
                  <option value="low">Low Volume</option>
                </select>
              </div>
            </div>
            <button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
              Run Screener
            </button>
          </div>

          {/* Technical Analysis Cards */}
          <div className="grid grid-cols-2 gap-4">
            {technicals.map((tech) => (
              <div key={tech.symbol} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-lg">{tech.symbol}</span>
                  <span className={getRsiSignal(tech.rsi).color + " text-sm font-medium"}>
                    {getRsiSignal(tech.rsi).signal}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400 block">RSI</span>
                    <span className="font-mono">{tech.rsi.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">MACD</span>
                    <span className={`font-mono ${tech.macd >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {tech.macd.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">SMA 50</span>
                    <span className="font-mono">${tech.sma50.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "news" && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium">Market News</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {news.map((item) => (
                <div key={item.id} className="p-4 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{item.headline}</h4>
                      <p className="text-sm text-gray-400 mb-2">{item.summary}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{item.source}</span>
                        <span>{new Date(item.publishedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${getSentimentColor(item.sentiment)}`}>
                      {item.sentiment !== undefined && item.sentiment > 0 ? "📈 Bullish" : item.sentiment !== undefined && item.sentiment < 0 ? "📉 Bearish" : "➡️ Neutral"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
