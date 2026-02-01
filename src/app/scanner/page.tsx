"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { MiniChart } from "@/components/scanner/MiniChart";
import { 
  type ScannerHit, 
  type ScannerConfig, 
  type Alert,
  generateDemoScannerHits,
  generateDemoAlerts 
} from "@/lib/momentum-scanner";

type SortField = 'signalStrength' | 'symbol' | 'changePercent' | 'relativeVolume' | 'rsi' | 'profitFactor' | 'timestamp';
type SortDirection = 'asc' | 'desc';

export default function ScannerPage() {
  const [scannerHits, setScannerHits] = useState<ScannerHit[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'scanner' | 'alerts' | 'backtest'>('scanner');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('signalStrength');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showConfig, setShowConfig] = useState(false);
  
  const [config, setConfig] = useState<ScannerConfig>({
    timeframe: '5m',
    rsiOversold: 30,
    rsiOverbought: 70,
    volumeMultiplier: 1.5,
    breakoutThreshold: 0.5,
    macdSensitivity: 0.5,
    minSignalStrength: 60,
    regimeFilter: true,
    showBullish: true,
    showBearish: true,
  });

  // Load initial data
  useEffect(() => {
    const hits = generateDemoScannerHits(25);
    setScannerHits(hits);
    setAlerts(generateDemoAlerts(hits));
    setLoading(false);
  }, []);

  // Auto-refresh simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isScanning) {
        // Update prices slightly to simulate real-time
        setScannerHits(prev => prev.map(hit => ({
          ...hit,
          price: hit.price * (1 + (Math.random() - 0.5) * 0.002),
          change: hit.change + (Math.random() - 0.5) * 0.1,
          signalStrength: Math.min(100, Math.max(0, hit.signalStrength + (Math.random() - 0.5) * 2)),
        })));
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isScanning]);

  // Run scanner
  const runScanner = useCallback(() => {
    setIsScanning(true);
    setTimeout(() => {
      const hits = generateDemoScannerHits(30);
      setScannerHits(hits);
      setAlerts(generateDemoAlerts(hits));
      setIsScanning(false);
    }, 1500);
  }, []);

  // Filter and sort hits
  const filteredHits = useMemo(() => {
    let hits = scannerHits.filter(hit => {
      if (searchFilter && !hit.symbol.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }
      if (!config.showBullish && hit.breakoutType === 'bullish') return false;
      if (!config.showBearish && hit.breakoutType === 'bearish') return false;
      if (hit.signalStrength < config.minSignalStrength) return false;
      if (hit.relativeVolume < config.volumeMultiplier) return false;
      return true;
    });

    // Sort
    hits.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      
      if (sortField === 'timestamp') {
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
      } else if (sortField === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else {
        aVal = a[sortField] as number;
        bVal = b[sortField] as number;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return hits;
  }, [scannerHits, searchFilter, config, sortField, sortDirection]);

  // Dismiss alert
  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, dismissed: true } : a));
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get regime badge
  const getRegimeBadge = (regime: string) => {
    switch (regime) {
      case 'trending_up':
        return <Badge variant="success" className="text-xs">📈 Trending Up</Badge>;
      case 'trending_down':
        return <Badge variant="destructive" className="text-xs">📉 Trending Down</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">↔️ Ranging</Badge>;
    }
  };

  // Get signal strength color
  const getSignalColor = (strength: number) => {
    if (strength >= 80) return 'text-green-400';
    if (strength >= 60) return 'text-yellow-400';
    return 'text-gray-400';
  };

  // Get alert severity color
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-500 bg-red-500/10';
      case 'medium': return 'border-yellow-500 bg-yellow-500/10';
      default: return 'border-gray-600 bg-gray-600/10';
    }
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎯 Momentum Scanner</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time breakout detection with momentum indicators
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
          <Button
            onClick={() => setShowConfig(!showConfig)}
            variant="outline"
            size="sm"
            className="bg-gray-800 border-gray-700"
          >
            ⚙️ Config
          </Button>
          <Button
            onClick={runScanner}
            disabled={isScanning}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isScanning ? '🔄 Scanning...' : '🔍 Run Scanner'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2">
        {(['scanner', 'alerts', 'backtest'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {tab === 'scanner' && '📊 Scanner'}
            {tab === 'alerts' && `🔔 Alerts (${alerts.filter(a => !a.dismissed).length})`}
            {tab === 'backtest' && '📈 Backtest'}
          </button>
        ))}
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Scanner Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              {/* Timeframe */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Timeframe</label>
                <select
                  value={config.timeframe}
                  onChange={(e) => setConfig({ ...config, timeframe: e.target.value as ScannerConfig['timeframe'] })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="1m">1 Minute</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">Daily</option>
                </select>
              </div>

              {/* RSI Oversold */}
              <div>
                <Slider
                  label="RSI Oversold"
                  value={config.rsiOversold}
                  onChange={(v) => setConfig({ ...config, rsiOversold: v })}
                  min={10}
                  max={40}
                />
              </div>

              {/* RSI Overbought */}
              <div>
                <Slider
                  label="RSI Overbought"
                  value={config.rsiOverbought}
                  onChange={(v) => setConfig({ ...config, rsiOverbought: v })}
                  min={60}
                  max={90}
                />
              </div>

              {/* Volume Multiplier */}
              <div>
                <Slider
                  label="Min Relative Volume"
                  value={config.volumeMultiplier * 10}
                  onChange={(v) => setConfig({ ...config, volumeMultiplier: v / 10 })}
                  min={10}
                  max={50}
                />
                <span className="text-xs text-gray-500">{config.volumeMultiplier.toFixed(1)}x</span>
              </div>

              {/* Min Signal Strength */}
              <div>
                <Slider
                  label="Min Signal Strength"
                  value={config.minSignalStrength}
                  onChange={(v) => setConfig({ ...config, minSignalStrength: v })}
                  min={0}
                  max={100}
                />
              </div>

              {/* Filters */}
              <div className="col-span-3 flex items-center space-x-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showBullish}
                    onChange={(e) => setConfig({ ...config, showBullish: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600"
                  />
                  <span className="text-sm text-green-400">Show Bullish</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showBearish}
                    onChange={(e) => setConfig({ ...config, showBearish: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600"
                  />
                  <span className="text-sm text-red-400">Show Bearish</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.regimeFilter}
                    onChange={(e) => setConfig({ ...config, regimeFilter: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600"
                  />
                  <span className="text-sm">Regime Filter</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scanner Tab */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          {/* Search & Stats */}
          <div className="flex items-center justify-between">
            <Input
              placeholder="Search symbols..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-64 bg-gray-800 border-gray-700"
            />
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-gray-400">
                <span className="text-white font-medium">{filteredHits.length}</span> hits
              </span>
              <span className="text-green-400">
                {filteredHits.filter(h => h.breakoutType === 'bullish').length} bullish
              </span>
              <span className="text-red-400">
                {filteredHits.filter(h => h.breakoutType === 'bearish').length} bearish
              </span>
            </div>
          </div>

          {/* Scanner Table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('symbol')}
                    >
                      Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">
                      Chart
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                      Price
                    </th>
                    <th 
                      className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('changePercent')}
                    >
                      Change {sortField === 'changePercent' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('relativeVolume')}
                    >
                      Rel Vol {sortField === 'relativeVolume' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('rsi')}
                    >
                      RSI {sortField === 'rsi' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">
                      MACD
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">
                      MA Cross
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">
                      Regime
                    </th>
                    <th 
                      className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('signalStrength')}
                    >
                      Signal {sortField === 'signalStrength' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('profitFactor')}
                    >
                      PF {sortField === 'profitFactor' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredHits.map((hit) => (
                    <tr 
                      key={hit.id} 
                      className={`hover:bg-gray-800/50 transition-colors ${
                        hit.breakoutType === 'bullish' ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500'
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold">{hit.symbol}</span>
                          {hit.breakoutType === 'bullish' ? (
                            <span className="text-green-400 text-xs">▲</span>
                          ) : (
                            <span className="text-red-400 text-xs">▼</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <MiniChart
                          priceData={hit.priceHistory}
                          volumeData={hit.volumeHistory}
                          breakoutType={hit.breakoutType}
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        ${hit.price.toFixed(2)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono ${
                        hit.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {hit.changePercent >= 0 ? '+' : ''}{hit.changePercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <div 
                            className="h-3 bg-blue-500 rounded-sm"
                            style={{ width: `${Math.min(hit.relativeVolume * 15, 50)}px` }}
                          />
                          <span className={`text-xs font-mono ${
                            hit.relativeVolume >= 2 ? 'text-yellow-400' : 'text-gray-400'
                          }`}>
                            {hit.relativeVolume.toFixed(1)}x
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono text-sm ${
                          hit.rsi < 30 ? 'text-green-400' : 
                          hit.rsi > 70 ? 'text-red-400' : 'text-gray-300'
                        }`}>
                          {hit.rsi.toFixed(0)}
                        </span>
                        {hit.rsiDivergence !== 'none' && (
                          <span className={`ml-1 text-xs ${
                            hit.rsiDivergence === 'bullish' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            ⚡
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {hit.macdCrossover === 'bullish' && (
                          <Badge variant="success" className="text-xs">Cross ↑</Badge>
                        )}
                        {hit.macdCrossover === 'bearish' && (
                          <Badge variant="destructive" className="text-xs">Cross ↓</Badge>
                        )}
                        {hit.macdCrossover === 'none' && (
                          <span className={`text-xs font-mono ${
                            hit.macdHistogram >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {hit.macdHistogram >= 0 ? '+' : ''}{hit.macdHistogram.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {hit.maCrossover === 'golden' && (
                          <Badge className="bg-yellow-500 text-black text-xs">Golden</Badge>
                        )}
                        {hit.maCrossover === 'death' && (
                          <Badge variant="destructive" className="text-xs">Death</Badge>
                        )}
                        {hit.maCrossover === 'none' && (
                          <span className="text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {getRegimeBadge(hit.regime)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                hit.signalStrength >= 80 ? 'bg-green-500' :
                                hit.signalStrength >= 60 ? 'bg-yellow-500' : 'bg-gray-500'
                              }`}
                              style={{ width: `${hit.signalStrength}%` }}
                            />
                          </div>
                          <span className={`ml-2 text-xs font-mono ${getSignalColor(hit.signalStrength)}`}>
                            {hit.signalStrength}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono text-sm ${
                          hit.profitFactor >= 2 ? 'text-green-400' :
                          hit.profitFactor >= 1.5 ? 'text-yellow-400' : 'text-gray-400'
                        }`}>
                          {hit.profitFactor.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Active Alerts</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlerts(prev => prev.map(a => ({ ...a, dismissed: true })))}
              className="bg-gray-800 border-gray-700"
            >
              Clear All
            </Button>
          </div>
          
          <div className="space-y-3">
            {alerts.filter(a => !a.dismissed).length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No active alerts. Run the scanner to detect breakouts.
              </div>
            ) : (
              alerts.filter(a => !a.dismissed).map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${getAlertColor(alert.severity)}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl">
                      {alert.type === 'breakout' && '🚀'}
                      {alert.type === 'rsi' && '📊'}
                      {alert.type === 'macd' && '📈'}
                      {alert.type === 'volume' && '📢'}
                      {alert.type === 'regime' && '🎯'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold">{alert.symbol}</span>
                        <Badge 
                          variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'warning' : 'secondary'}
                          className="text-xs"
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Backtest Tab */}
      {activeTab === 'backtest' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400">Total Signals</div>
                <div className="text-2xl font-bold mt-1">
                  {filteredHits.reduce((acc, h) => acc + h.historicalSignals, 0)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400">Avg Win Rate</div>
                <div className="text-2xl font-bold mt-1 text-green-400">
                  {(filteredHits.reduce((acc, h) => acc + h.winRate, 0) / (filteredHits.length || 1)).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400">Avg Profit Factor</div>
                <div className="text-2xl font-bold mt-1 text-blue-400">
                  {(filteredHits.reduce((acc, h) => acc + h.profitFactor, 0) / (filteredHits.length || 1)).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400">Avg Win/Loss</div>
                <div className="text-2xl font-bold mt-1">
                  <span className="text-green-400">
                    +{(filteredHits.reduce((acc, h) => acc + h.avgWin, 0) / (filteredHits.length || 1)).toFixed(1)}%
                  </span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-red-400">
                    -{(filteredHits.reduce((acc, h) => acc + h.avgLoss, 0) / (filteredHits.length || 1)).toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Backtest Results Table */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg">Historical Performance by Symbol</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Symbol</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Signals</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Win Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Profit Factor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Avg Win</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Avg Loss</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredHits.slice(0, 15).map((hit) => (
                    <tr key={hit.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium">{hit.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono">{hit.historicalSignals}</td>
                      <td className={`px-4 py-3 text-right font-mono ${
                        hit.winRate >= 55 ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {hit.winRate.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${
                        hit.profitFactor >= 1.5 ? 'text-green-400' : 
                        hit.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {hit.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green-400">
                        +{hit.avgWin.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-400">
                        -{hit.avgLoss.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hit.profitFactor >= 2 && hit.winRate >= 55 ? (
                          <Badge variant="success">⭐ Excellent</Badge>
                        ) : hit.profitFactor >= 1.5 ? (
                          <Badge className="bg-blue-500">Good</Badge>
                        ) : hit.profitFactor >= 1 ? (
                          <Badge variant="secondary">Average</Badge>
                        ) : (
                          <Badge variant="destructive">Poor</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
