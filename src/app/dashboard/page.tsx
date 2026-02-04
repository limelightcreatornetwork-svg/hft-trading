"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RegimeIndicator } from "@/components/trading/RegimeIndicator";
import { AlertsPanel } from "@/components/trading/AlertsPanel";
import { ConfidenceIndicator } from "@/components/trading/ConfidenceIndicator";
import { PLDisplay } from "@/components/dashboard/PLDisplay";
import { TradeHistory } from "@/components/dashboard/TradeHistory";
import { PositionCardsGrid } from "@/components/dashboard/PositionCard";
import { QuickTradePanel } from "@/components/dashboard/QuickTradePanel";
import { CollapsiblePanel } from "@/components/dashboard/CollapsiblePanel";
import { RealTimeConnectionStatus, useRealTimePriceContext } from "@/components/providers/RealTimePriceProvider";
import {
  RefreshCw,
  TrendingUp,
  History,
  Wallet,
  Activity,
  AlertTriangle,
  Menu,
  X,
  Wifi
} from 'lucide-react';

interface AccountData {
  success: boolean;
  data: {
    id: string;
    status: string;
    currency: string;
    buyingPower: number;
    cash: number;
    portfolioValue: number;
    equity: number;
    lastEquity: number;
    longMarketValue: number;
    shortMarketValue: number;
    initialMargin: number;
    maintenanceMargin: number;
    daytradeCount: number;
    patternDayTrader: boolean;
    dailyPL: number;
    dailyPLPercent: number;
  };
}

interface Position {
  symbol: string;
  quantity: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
  assetType?: 'stock' | 'option';
}

type TabType = 'positions' | 'trade' | 'history';

export default function DashboardPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Real-time price context
  const { isConnected, subscribe, getPrice, getPriceHistory } = useRealTimePriceContext();

  const watchlistSymbols = useMemo(() => ['SPY', 'QQQ', 'AAPL'], []);

  // Subscribe to position symbols for real-time updates
  useEffect(() => {
    if (isConnected && positions.length > 0) {
      const symbols = positions.map(p => p.symbol);
      subscribe([...symbols, ...watchlistSymbols]);
    }
  }, [isConnected, positions, subscribe, watchlistSymbols]);

  // Merge real-time prices with positions
  const positionsWithRealTimePrices = useMemo(() => {
    return positions.map(position => {
      const realTimePrice = getPrice(position.symbol);
      const priceHistory = getPriceHistory(position.symbol);

      if (realTimePrice) {
        const currentPrice = realTimePrice.price;
        const costBasis = position.avgEntryPrice * position.quantity;
        const marketValue = currentPrice * position.quantity;
        const unrealizedPL = position.side === 'long'
          ? marketValue - costBasis
          : costBasis - marketValue;
        const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;

        return {
          ...position,
          currentPrice,
          marketValue,
          unrealizedPL,
          unrealizedPLPercent,
          priceHistory: priceHistory.length > 1 ? priceHistory : undefined,
        };
      }

      return position;
    });
  }, [positions, getPrice, getPriceHistory]);

  const fetchData = useCallback(async () => {
    try {
      const [accountRes, positionsRes] = await Promise.all([
        fetch('/api/account'),
        fetch('/api/positions'),
      ]);
      
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccount(accountData);
      }
      
      if (positionsRes.ok) {
        const positionsData = await positionsRes.json();
        if (positionsData.success) {
          setPositions(positionsData.data.positions || []);
        }
      }
      
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleClosePosition = async (symbol: string) => {
    try {
      const position = positions.find(p => p.symbol === symbol);
      if (!position) return;
      
      await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side: position.side === 'long' ? 'sell' : 'buy',
          quantity: position.quantity,
          orderType: 'market',
          strategy: 'manual_close',
          autoExecute: true,
        }),
      });
      
      await fetchData();
    } catch (error) {
      console.error('Error closing position:', error);
    }
  };

  const handleAddPosition = async (_symbol: string) => {
    setActiveTab('trade');
    // Pre-populate trade form would go here
  };

  const handleReducePosition = async (symbol: string) => {
    try {
      const position = positions.find(p => p.symbol === symbol);
      if (!position) return;
      
      const reduceQty = Math.floor(position.quantity / 2);
      if (reduceQty < 1) return;
      
      await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side: position.side === 'long' ? 'sell' : 'buy',
          quantity: reduceQty,
          orderType: 'market',
          strategy: 'manual_reduce',
          autoExecute: true,
        }),
      });
      
      await fetchData();
    } catch (error) {
      console.error('Error reducing position:', error);
    }
  };

  const handleQuickTrade = async (order: { symbol: string; side: 'buy' | 'sell'; type: string; quantity: number; limitPrice?: number }) => {
    try {
      await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...order,
          orderType: order.type,
          strategy: 'quick_trade',
          autoExecute: true,
        }),
      });
      
      await fetchData();
    } catch (error) {
      console.error('Error submitting trade:', error);
      throw error;
    }
  };

  const portfolioValue = account?.data?.portfolioValue || 100000;

  const tabs = [
    { id: 'positions' as const, label: 'Positions', icon: Wallet, count: positions.length },
    { id: 'trade' as const, label: 'Trade', icon: TrendingUp },
    { id: 'history' as const, label: 'History', icon: History },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-card border-b md:hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">HFT Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-red-500 border-red-500 text-xs">
              PAPER
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-9 w-9 p-0"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="p-4 pt-0 border-t bg-card">
            <div className="grid grid-cols-3 gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className="h-10"
                  >
                    <Icon className="h-4 w-4 mr-1" />
                    {tab.label}
                    {tab.count !== undefined && (
                      <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                        {tab.count}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Desktop Header */}
      <header className="hidden md:block sticky top-0 z-50 bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">HFT Trading Dashboard</h1>
              </div>
              <RegimeIndicator symbol="SPY" compact />
              <Badge variant="outline" className="text-red-500 border-red-500">
                PAPER TRADING
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
                <Wifi className={`h-4 w-4 ${isConnected ? 'text-green-500' : 'text-muted-foreground'}`} />
                <RealTimeConnectionStatus showLabel={true} />
              </div>
              {lastUpdate && (
                <span className="text-sm text-muted-foreground">
                  Updated {lastUpdate.toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* P&L Display - Always visible */}
        <PLDisplay refreshInterval={5000} />

        {/* Market Regime - Collapsible on mobile */}
        <CollapsiblePanel
          title="Market Regime"
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {watchlistSymbols.map((symbol) => (
              <RegimeIndicator key={symbol} symbol={symbol} refreshInterval={30000} />
            ))}
          </div>
        </CollapsiblePanel>

        {/* Desktop Tab Navigation */}
        <div className="hidden md:flex gap-2 border-b pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                onClick={() => setActiveTab(tab.id)}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <Badge variant={activeTab === tab.id ? 'secondary' : 'outline'} className="ml-1">
                    {tab.count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Positions View */}
            {activeTab === 'positions' && (
              <div>
                <div className="flex items-center justify-between mb-4 md:hidden">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Positions
                  </h2>
                  <Badge variant="outline">{positions.length}</Badge>
                </div>
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-4">
                          <div className="h-6 bg-muted rounded w-1/2 mb-3"></div>
                          <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
                          <div className="h-4 bg-muted rounded w-full"></div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <PositionCardsGrid
                    positions={positionsWithRealTimePrices}
                    onClose={handleClosePosition}
                    onAdd={handleAddPosition}
                    onReduce={handleReducePosition}
                  />
                )}
              </div>
            )}

            {/* Trade View */}
            {activeTab === 'trade' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <QuickTradePanel
                  portfolioValue={portfolioValue}
                  onSubmit={handleQuickTrade}
                />
                {/* Confidence Guide */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Position Sizing Guide</CardTitle>
                    <CardDescription>Based on confidence score</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { score: 9, label: '8-10', pct: '20%', desc: 'Full position', color: 'green' },
                        { score: 7, label: '6-7', pct: '10%', desc: 'Medium position', color: 'yellow' },
                        { score: 5, label: '4-5', pct: '5%', desc: 'Small position', color: 'orange' },
                        { score: 2, label: '1-3', pct: 'Skip', desc: 'Too risky', color: 'red' },
                      ].map((item) => (
                        <div
                          key={item.score}
                          className={`flex items-center justify-between p-3 rounded-lg border
                            ${item.color === 'green' ? 'bg-green-50 border-green-200 dark:bg-green-950/30' : ''}
                            ${item.color === 'yellow' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30' : ''}
                            ${item.color === 'orange' ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/30' : ''}
                            ${item.color === 'red' ? 'bg-red-50 border-red-200 dark:bg-red-950/30' : ''}
                          `}
                        >
                          <div className="flex items-center gap-3">
                            <ConfidenceIndicator score={item.score} showLabel={false} size="sm" />
                            <div>
                              <span className="font-semibold">{item.label}</span>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                          <span className="font-bold">{item.pct}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* History View */}
            {activeTab === 'history' && (
              <TradeHistory pageSize={10} />
            )}
          </div>

          {/* Sidebar - Alerts */}
          <div className="lg:col-span-1">
            <CollapsiblePanel
              title="Alerts"
              icon={<AlertTriangle className="h-5 w-5 text-yellow-500" />}
              defaultOpen={true}
            >
              <AlertsPanel refreshInterval={15000} maxAlerts={10} />
            </CollapsiblePanel>
          </div>
        </div>

        {/* Risk Controls - Collapsible on mobile */}
        <CollapsiblePanel
          title="Risk Controls"
          icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Default TP</p>
              <p className="text-lg font-semibold text-green-600">+2% (ATR)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Default SL</p>
              <p className="text-lg font-semibold text-red-600">-1% (ATR)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Time Stop</p>
              <p className="text-lg font-semibold">4 hours</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trailing Stop</p>
              <p className="text-lg font-semibold">Optional</p>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-sm text-muted-foreground mb-1">Kill Switch</p>
              <Button variant="destructive" size="sm" className="w-full md:w-auto">
                HALT TRADING
              </Button>
            </div>
          </div>
        </CollapsiblePanel>
      </main>
    </div>
  );
}
