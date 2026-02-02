'use client';

import { useState, useEffect, useCallback } from 'react';
import { AccountCard } from '@/components/trading/AccountCard';
import { PositionsTable } from '@/components/trading/PositionsTable';
import { OrdersTable } from '@/components/trading/OrdersTable';
import { IntentsLog } from '@/components/trading/IntentsLog';
import { TradeForm } from '@/components/trading/TradeForm';
import { KillSwitch } from '@/components/trading/KillSwitch';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccountData {
  equity: number;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  dailyPL: number;
  dailyPLPercent: number | null;
  status: string;
}

interface Position {
  symbol: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
}

interface Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  filledQuantity: number;
  limitPrice: number | null;
  status: string;
  submittedAt: string;
}

interface Intent {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  orderType: string;
  status: string;
  strategy: string;
  createdAt: string;
}

interface RiskData {
  config: {
    maxPositionSize: number;
    maxOrderSize: number;
    maxDailyLoss: number;
    allowedSymbols: string[];
    tradingEnabled: boolean;
  };
  headroom: {
    orderSizeRemaining: number;
    maxPositionHeadroom: number;
    dailyLossRemaining: number;
    tradingEnabled: boolean;
  };
  status: string;
}

export default function TradingDashboard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const [loadingAccount, setLoadingAccount] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingIntents, setLoadingIntents] = useState(true);
  const [loadingRisk, setLoadingRisk] = useState(true);
  const [submittingTrade, setSubmittingTrade] = useState(false);
  const [togglingKillSwitch, setTogglingKillSwitch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const data = await res.json();
      if (data.success) {
        setAccount(data.data);
      }
    } catch (error) {
      console.error('Error fetching account:', error);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/positions');
      const data = await res.json();
      if (data.success) {
        setPositions(data.data.positions);
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoadingPositions(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?status=open');
      const data = await res.json();
      if (data.success) {
        setOrders(data.data.orders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const fetchIntents = useCallback(async () => {
    try {
      const res = await fetch('/api/intents?limit=20');
      const data = await res.json();
      if (data.success) {
        setIntents(data.data.intents);
      }
    } catch (error) {
      console.error('Error fetching intents:', error);
    } finally {
      setLoadingIntents(false);
    }
  }, []);

  const fetchRisk = useCallback(async () => {
    try {
      const res = await fetch('/api/risk');
      const data = await res.json();
      if (data.success) {
        setRiskData(data.data);
        setKillSwitchActive(!data.data.config.tradingEnabled);
      }
    } catch (error) {
      console.error('Error fetching risk:', error);
    } finally {
      setLoadingRisk(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAccount(),
      fetchPositions(),
      fetchOrders(),
      fetchIntents(),
      fetchRisk(),
    ]);
    setLastUpdate(new Date());
    setRefreshing(false);
  }, [fetchAccount, fetchPositions, fetchOrders, fetchIntents, fetchRisk]);

  useEffect(() => {
    refreshAll();
    // Auto-refresh every 10 seconds
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handleCancelOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchOrders();
      } else {
        alert(`Failed to cancel order: ${data.error}`);
      }
    } catch (error) {
      console.error('Error canceling order:', error);
      alert('Failed to cancel order');
    }
  };

  const handleSubmitTrade = async (tradeData: {
    symbol: string;
    side: string;
    quantity: number;
    orderType: string;
    limitPrice?: number;
  }) => {
    setSubmittingTrade(true);
    try {
      const res = await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tradeData,
          strategy: 'manual',
          autoExecute: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.riskCheck.approved) {
          alert(`Order submitted: ${data.data.intent.status}`);
        } else {
          alert(`Order rejected: ${data.data.riskCheck.reason}`);
        }
        await Promise.all([fetchOrders(), fetchIntents(), fetchPositions()]);
      } else {
        alert(`Failed to submit trade: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting trade:', error);
      alert('Failed to submit trade');
    } finally {
      setSubmittingTrade(false);
    }
  };

  const handleToggleKillSwitch = async (activate: boolean) => {
    setTogglingKillSwitch(true);
    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: activate ? 'activate' : 'deactivate',
          cancelOrders: activate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKillSwitchActive(data.data.active);
        if (data.data.cancelledOrders > 0) {
          alert(`Kill switch activated. ${data.data.cancelledOrders} orders cancelled.`);
        }
        await Promise.all([fetchRisk(), fetchOrders()]);
      } else {
        alert(`Failed to toggle kill switch: ${data.error}`);
      }
    } catch (error) {
      console.error('Error toggling kill switch:', error);
      alert('Failed to toggle kill switch');
    } finally {
      setTogglingKillSwitch(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">HFT Trading System</h1>
            <Badge variant={killSwitchActive ? 'destructive' : 'success'}>
              {killSwitchActive ? 'TRADING DISABLED' : 'LIVE'}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdate && (
              <span className="text-sm text-muted-foreground">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Top Row: Account + Kill Switch */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ErrorBoundary sectionName="Account" compact>
            <AccountCard data={account} loading={loadingAccount} />
          </ErrorBoundary>
          <ErrorBoundary sectionName="Kill Switch" compact>
            <KillSwitch
              riskData={riskData}
              killSwitchActive={killSwitchActive}
              onToggleKillSwitch={handleToggleKillSwitch}
              loading={togglingKillSwitch || loadingRisk}
            />
          </ErrorBoundary>
        </div>

        {/* Middle Row: Positions + Trade Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ErrorBoundary sectionName="Positions">
              <PositionsTable positions={positions} loading={loadingPositions} />
            </ErrorBoundary>
          </div>
          <ErrorBoundary sectionName="Trade Form">
            <TradeForm
              onSubmit={handleSubmitTrade}
              loading={submittingTrade}
              allowedSymbols={riskData?.config.allowedSymbols || []}
            />
          </ErrorBoundary>
        </div>

        {/* Bottom Row: Orders + Intents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorBoundary sectionName="Orders">
            <OrdersTable
              orders={orders}
              loading={loadingOrders}
              onCancelOrder={handleCancelOrder}
            />
          </ErrorBoundary>
          <ErrorBoundary sectionName="Trade Intents">
            <IntentsLog intents={intents} loading={loadingIntents} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
