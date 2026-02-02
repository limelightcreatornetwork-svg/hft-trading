'use client';

import { useState, useEffect } from 'react';
import { 
  OptionsChainViewer, 
  OptionsOrderForm, 
  GreeksDisplay, 
  OptionsPositions 
} from '@/components/options';

interface Position {
  symbol: string;
  qty: string;
}

interface SelectedContract {
  contract: {
    symbol: string;
    name: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
    openInterest: number;
  };
  quote: {
    bid: number;
    ask: number;
    last: number;
    spread: number;
  } | null;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
  } | null;
}

interface AccountData {
  buyingPower: number;
}

export default function OptionsPage() {
  const [selectedContract, setSelectedContract] = useState<SelectedContract | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [activeTab, setActiveTab] = useState<'chain' | 'positions' | 'strategies'>('chain');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch account and positions data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountRes, positionsRes] = await Promise.all([
          fetch('/api/account'),
          fetch('/api/positions'),
        ]);

        const accountData = await accountRes.json();
        const positionsData = await positionsRes.json();

        if (accountData.success) {
          setAccount(accountData.data);
        }
        if (positionsData.success) {
          setPositions(positionsData.data.positions.map((p: { symbol: string; quantity: number }) => ({
            symbol: p.symbol,
            qty: p.quantity.toString(),
          })));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleContractSelect = (contract: SelectedContract) => {
    setSelectedContract(contract);
  };

  const handleOrderSubmit = (result: { success: boolean; data?: unknown; error?: string }) => {
    if (result.success) {
      setNotification({ type: 'success', message: 'Order submitted successfully!' });
    } else {
      setNotification({ type: 'error', message: result.error || 'Order failed' });
    }
    // Clear notification after 5 seconds
    setTimeout(() => setNotification(null), 5000);
  };

  const handleExercise = async (symbol: string) => {
    if (!confirm(`Are you sure you want to exercise ${symbol}? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/positions/${symbol}/exercise`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setNotification({ type: 'success', message: 'Exercise request submitted!' });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      setNotification({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Exercise failed' 
      });
    }
  };

  // Transform greeks for display component
  const greeksForDisplay = selectedContract?.greeks ? {
    delta: selectedContract.greeks.delta,
    gamma: selectedContract.greeks.gamma,
    theta: selectedContract.greeks.theta,
    vega: selectedContract.greeks.vega,
    impliedVolatility: selectedContract.greeks.iv,
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 Options Trading</h1>
          <p className="text-gray-400 text-sm mt-1">
            Level 1: Covered Calls & Cash-Secured Puts
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-400">Buying Power: </span>
            <span className="font-bold text-green-400">
              ${account?.buyingPower?.toLocaleString() || '—'}
            </span>
          </div>
          <div className="flex space-x-2">
            {(['chain', 'positions', 'strategies'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {tab === 'chain' ? '📈 Chain' : tab === 'positions' ? '💼 Positions' : '🎯 Strategies'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-lg ${
          notification.type === 'success' ? 'bg-green-900/50 text-green-400 border border-green-700' : 
          'bg-red-900/50 text-red-400 border border-red-700'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Main Content */}
      {activeTab === 'chain' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Options Chain - 2 columns */}
          <div className="col-span-2">
            <OptionsChainViewer
              onSelectContract={handleContractSelect}
              positions={positions}
            />
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-6">
            {/* Greeks Display */}
            <GreeksDisplay
              greeks={greeksForDisplay}
              quantity={1}
              showExplanations={true}
            />

            {/* Order Form */}
            <OptionsOrderForm
              selectedContract={selectedContract}
              positions={positions}
              buyingPower={account?.buyingPower || 0}
              onOrderSubmit={handleOrderSubmit}
            />
          </div>
        </div>
      )}

      {activeTab === 'positions' && (
        <OptionsPositions onExercise={handleExercise} />
      )}

      {activeTab === 'strategies' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Covered Call Strategy */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">📞</span>
              <div>
                <h3 className="text-lg font-bold">Covered Call</h3>
                <p className="text-sm text-gray-400">Generate income on stocks you own</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>Sell call options against 100+ shares you own</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>Collect premium as income</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-yellow-400">⚠</span>
                <span>Caps upside if stock rises above strike</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400">ℹ</span>
                <span>Best in sideways to moderately bullish markets</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">Your eligible positions:</p>
              <div className="flex flex-wrap gap-2">
                {positions.filter(p => parseInt(p.qty) >= 100).map(p => (
                  <span 
                    key={p.symbol} 
                    className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-sm cursor-pointer hover:bg-green-800/50"
                    onClick={() => setActiveTab('chain')}
                  >
                    {p.symbol} ({Math.floor(parseInt(p.qty) / 100)} contracts)
                  </span>
                ))}
                {positions.filter(p => parseInt(p.qty) >= 100).length === 0 && (
                  <span className="text-gray-500 text-sm">No positions with 100+ shares</span>
                )}
              </div>
            </div>
          </div>

          {/* Cash-Secured Put Strategy */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">💵</span>
              <div>
                <h3 className="text-lg font-bold">Cash-Secured Put</h3>
                <p className="text-sm text-gray-400">Get paid to buy stocks at lower prices</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>Sell put options with cash as collateral</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>Collect premium while waiting to buy</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-yellow-400">⚠</span>
                <span>May be assigned stock if price drops below strike</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400">ℹ</span>
                <span>Best when you want to own the stock anyway</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">Your buying power:</p>
              <p className="text-lg font-bold text-green-400">
                ${account?.buyingPower?.toLocaleString() || '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Can secure up to {account?.buyingPower ? Math.floor(account.buyingPower / 10000) : 0} contracts at $100 strike
              </p>
            </div>
          </div>

          {/* Strategy Tips */}
          <div className="col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold mb-4">📚 Options Trading Tips</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-gray-800 rounded-lg">
                <h4 className="font-medium text-blue-400 mb-2">Delta</h4>
                <p className="text-gray-400">
                  For covered calls, choose delta 0.20-0.35 for income with low assignment risk.
                  Higher delta = more premium but higher assignment chance.
                </p>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <h4 className="font-medium text-purple-400 mb-2">Time Decay</h4>
                <p className="text-gray-400">
                  Theta works in your favor when selling. Options lose ~⅓ of value in last month.
                  Consider 30-45 DTE for optimal theta decay.
                </p>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <h4 className="font-medium text-yellow-400 mb-2">Implied Volatility</h4>
                <p className="text-gray-400">
                  Sell when IV is high (more premium). Check IV Rank/Percentile.
                  Avoid selling before earnings when IV is artificially elevated.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
