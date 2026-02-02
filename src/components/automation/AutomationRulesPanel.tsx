"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, RefreshCw, Play, Pause, AlertTriangle } from 'lucide-react';

interface AutomationRule {
  id: string;
  symbol: string;
  name: string;
  enabled: boolean;
  ruleType: string;
  triggerType: string;
  triggerValue: number;
  currentPrice?: number;
  triggerPrice?: number;
  distanceToTrigger?: number;
  distanceToTriggerPct?: number;
  orderSide: string;
  orderType: string;
  quantity: number | null;
  limitPrice: number | null;
  ocoGroupId: string | null;
  status: string;
  triggeredAt: string | null;
  createdAt: string;
}

interface MonitorStatus {
  marketOpen: boolean;
  activeRulesCount: number;
  lastMonitorRun: string | null;
  lastResult?: {
    rulesChecked: number;
    rulesTriggered: number;
    errors: string[];
  };
}

export function AutomationRulesPanel() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState(false);

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/automation/rules');
      const data = await response.json();
      if (data.success) {
        setRules(data.data.rules);
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    }
  };

  const fetchMonitorStatus = async () => {
    try {
      const response = await fetch('/api/automation/monitor');
      const data = await response.json();
      if (data.success) {
        setMonitorStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch monitor status:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchRules(), fetchMonitorStatus()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleRunMonitor = async () => {
    setMonitoring(true);
    try {
      const response = await fetch('/api/automation/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await response.json();
      if (data.success) {
        setMonitorStatus(prev => ({
          ...prev!,
          lastMonitorRun: data.data.timestamp,
          lastResult: data.data,
        }));
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to run monitor:', error);
    }
    setMonitoring(false);
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await fetch('/api/automation/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, enabled }),
      });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r));
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Cancel this automation rule?')) return;
    try {
      await fetch(`/api/automation/rules?id=${ruleId}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const getRuleTypeBadgeColor = (ruleType: string) => {
    switch (ruleType) {
      case 'STOP_LOSS': return 'destructive';
      case 'TAKE_PROFIT': return 'default';
      case 'OCO': return 'secondary';
      case 'LIMIT_ORDER': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'triggered': return 'secondary';
      case 'cancelled': return 'destructive';
      case 'expired': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading automation rules...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monitor Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Bot Monitor
                {monitorStatus?.marketOpen ? (
                  <Badge variant="default" className="bg-green-600">Market Open</Badge>
                ) : (
                  <Badge variant="secondary">Market Closed</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {monitorStatus?.activeRulesCount || 0} active rules
                {monitorStatus?.lastMonitorRun && (
                  <> • Last check: {new Date(monitorStatus.lastMonitorRun).toLocaleTimeString()}</>
                )}
              </CardDescription>
            </div>
            <Button onClick={handleRunMonitor} disabled={monitoring} size="sm">
              {monitoring ? (
                <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Running...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Run Monitor</>
              )}
            </Button>
          </div>
        </CardHeader>
        {monitorStatus?.lastResult && monitorStatus.lastResult.rulesTriggered > 0 && (
          <CardContent>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                {monitorStatus.lastResult.rulesTriggered} rule(s) triggered on last check
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Active Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Rules</CardTitle>
          <CardDescription>
            Configure automated stop-loss, take-profit, and limit orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No automation rules configured</p>
              <p className="text-sm mt-2">Set up rules from the positions page</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div 
                  key={rule.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={rule.enabled && rule.status === 'active'}
                      onCheckedChange={(checked) => handleToggleRule(rule.id, checked)}
                      disabled={rule.status !== 'active'}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{rule.symbol}</span>
                        <Badge variant={getRuleTypeBadgeColor(rule.ruleType) as "default" | "destructive" | "secondary" | "outline"}>
                          {rule.ruleType.replace('_', ' ')}
                        </Badge>
                        <Badge variant={getStatusBadgeColor(rule.status) as "default" | "destructive" | "secondary" | "outline"}>
                          {rule.status}
                        </Badge>
                        {rule.ocoGroupId && (
                          <Badge variant="outline" className="text-xs">OCO</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rule.triggerType.replace(/_/g, ' ').toLowerCase()}: 
                        {rule.triggerType.includes('PERCENT') ? ` ${rule.triggerValue}%` : ` $${rule.triggerValue.toFixed(2)}`}
                        {rule.triggerPrice && ` (trigger @ $${rule.triggerPrice.toFixed(2)})`}
                      </p>
                      {rule.currentPrice && rule.distanceToTriggerPct !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Current: ${rule.currentPrice.toFixed(2)} • 
                          Distance: {rule.distanceToTriggerPct.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {rule.orderSide.toUpperCase()} {rule.quantity || 'all'} @ {rule.orderType}
                    </span>
                    {rule.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
