"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RegimeIndicator } from "@/components/trading/RegimeIndicator";
import { ManagedPositionsTable } from "@/components/trading/ManagedPositionsTable";
import { AlertsPanel } from "@/components/trading/AlertsPanel";
import { TradingStats } from "@/components/trading/TradingStats";
import { ConfidenceTradeForm } from "@/components/trading/ConfidenceTradeForm";
import { ConfidenceIndicator } from "@/components/trading/ConfidenceIndicator";

export default function DashboardPage() {
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'positions' | 'trade' | 'history'>('positions');
  
  // Default symbols to monitor for regime
  const watchlistSymbols = ['SPY', 'QQQ', 'AAPL'];

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const response = await fetch('/api/account');
        if (response.ok) {
          const data = await response.json();
          setAccount(data);
        }
      } catch (err) {
        console.error('Failed to fetch account:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAccount();
  }, []);

  const portfolioValue = account?.portfolio_value || 100000;
  const dayPL = account?.equity ? (parseFloat(account.equity) - parseFloat(account.last_equity || account.equity)) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">HFT Trading Dashboard</h1>
          <RegimeIndicator symbol="SPY" compact />
        </div>
        <Badge variant="outline" className="text-red-500 border-red-500">
          PAPER TRADING
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Portfolio Value</CardDescription>
            <CardTitle className="text-2xl">
              ${loading ? '---' : parseFloat(portfolioValue).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Day P&L</CardDescription>
            <CardTitle className={`text-2xl ${dayPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {dayPL >= 0 ? '+' : ''}${dayPL.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Buying Power</CardDescription>
            <CardTitle className="text-2xl">
              ${loading ? '---' : parseFloat(account?.buying_power || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash</CardDescription>
            <CardTitle className="text-2xl">
              ${loading ? '---' : parseFloat(account?.cash || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Market Regime Detection */}
      <Card>
        <CardHeader>
          <CardTitle>Market Regime Detection</CardTitle>
          <CardDescription>Real-time market condition classification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {watchlistSymbols.map((symbol) => (
              <RegimeIndicator key={symbol} symbol={symbol} refreshInterval={30000} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'positions' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('positions')}
        >
          Managed Positions
        </Button>
        <Button
          variant={activeTab === 'trade' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('trade')}
        >
          Place Trade
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('history')}
        >
          Statistics
        </Button>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {activeTab === 'positions' && (
            <ManagedPositionsTable refreshInterval={10000} />
          )}
          {activeTab === 'trade' && (
            <ConfidenceTradeForm />
          )}
          {activeTab === 'history' && (
            <TradingStats refreshInterval={60000} />
          )}
        </div>
        
        {/* Alerts Panel (always visible) */}
        <div className="lg:col-span-1">
          <AlertsPanel refreshInterval={15000} maxAlerts={15} />
        </div>
      </div>

      {/* Position Sizing Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Confidence-Based Position Sizing</CardTitle>
          <CardDescription>Automatic position sizing based on trade confidence score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <ConfidenceIndicator score={9} showLabel={false} size="sm" />
                <span className="font-semibold">8-10</span>
              </div>
              <p className="text-sm text-green-700">20% of portfolio</p>
              <p className="text-xs text-green-600 mt-1">Full position</p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-2 mb-2">
                <ConfidenceIndicator score={7} showLabel={false} size="sm" />
                <span className="font-semibold">6-7</span>
              </div>
              <p className="text-sm text-yellow-700">10% of portfolio</p>
              <p className="text-xs text-yellow-600 mt-1">Medium position</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center gap-2 mb-2">
                <ConfidenceIndicator score={5} showLabel={false} size="sm" />
                <span className="font-semibold">4-5</span>
              </div>
              <p className="text-sm text-orange-700">5% of portfolio</p>
              <p className="text-xs text-orange-600 mt-1">Small position</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <ConfidenceIndicator score={2} showLabel={false} size="sm" />
                <span className="font-semibold">1-3</span>
              </div>
              <p className="text-sm text-red-700">Skip trade</p>
              <p className="text-xs text-red-600 mt-1">Too risky</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Controls</CardTitle>
          <CardDescription>Trade management and risk limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Default TP</p>
              <p className="text-lg font-semibold text-green-600">+2% (ATR-based)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Default SL</p>
              <p className="text-lg font-semibold text-red-600">-1% (ATR-based)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Time Stop</p>
              <p className="text-lg font-semibold">4 hours</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trailing Stop</p>
              <p className="text-lg font-semibold">Optional</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kill Switch</p>
              <Button variant="destructive" size="sm">HALT TRADING</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
