'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Alert {
  id: string;
  positionId: string;
  symbol: string;
  type: string;
  message: string;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

interface AlertsPanelProps {
  refreshInterval?: number;
  maxAlerts?: number;
}

export function AlertsPanel({ 
  refreshInterval = 30000,
  maxAlerts = 10,
}: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`/api/alerts?limit=${maxAlerts}`);
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();
      setAlerts(data.alerts);
      setError(null);
    } catch (err) {
      setError('Failed to load alerts');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      });
      if (response.ok) {
        setAlerts(alerts.filter(a => a.id !== alertId));
      }
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const checkPositions = async () => {
    try {
      const response = await fetch('/api/alerts/check', { method: 'POST' });
      if (response.ok) {
        // Refresh alerts after check
        fetchAlerts();
      }
    } catch (err) {
      console.error('Failed to check positions:', err);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'TP_HIT': return 'bg-green-500';
      case 'SL_HIT': return 'bg-red-500';
      case 'TIME_STOP': return 'bg-orange-500';
      case 'TIME_WARNING': return 'bg-yellow-500';
      case 'TRAILING_TRIGGERED': return 'bg-blue-500';
      case 'REVIEW': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'TP_HIT': return '🎯';
      case 'SL_HIT': return '🛑';
      case 'TIME_STOP': return '⏰';
      case 'TIME_WARNING': return '⚠️';
      case 'TRAILING_TRIGGERED': return '📉';
      case 'REVIEW': return '👀';
      default: return '📢';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Alerts
          {alerts.filter(a => a.triggered).length > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {alerts.filter(a => a.triggered).length}
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={checkPositions}>
          Check Now
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-red-500 text-center">{error}</p>
        ) : alerts.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No alerts</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {alerts.map((alert) => (
              <div 
                key={alert.id}
                className={`flex items-start justify-between p-3 rounded-lg border ${
                  alert.triggered ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl">{getAlertIcon(alert.type)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${getAlertColor(alert.type)} text-white`}>
                        {alert.type.replace('_', ' ')}
                      </Badge>
                      <span className="font-semibold">{alert.symbol}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {alert.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => dismissAlert(alert.id)}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
