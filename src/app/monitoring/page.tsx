"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Database,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  BarChart3,
  Zap,
  Server,
} from 'lucide-react';

// Types
interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  api: {
    avgLatencyMs: number;
    errorRate: number;
    requestsPerMinute: number;
  };
  database: {
    avgQueryTimeMs: number;
    slowQueryCount: number;
  };
  orders: {
    fillRate: number;
    avgFillTimeMs: number;
    rejectionRate: number;
  };
  lookbackMinutes: number;
  timestamp: string;
}

interface LatencyStats {
  endpoint: string;
  method: string;
  count: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
  errorCount: number;
}

interface QueryStats {
  model: string;
  operation: string;
  count: number;
  avgLatencyMs: number;
  slowCount: number;
  maxLatencyMs: number;
}

interface OrderMetrics {
  hour: string;
  submitted: number;
  filled: number;
  cancelled: number;
  rejected: number;
  fillRate: number;
  avgFillTimeMs: number;
}

interface OrderSummary {
  totalSubmitted: number;
  totalFilled: number;
  totalCancelled: number;
  totalRejected: number;
  avgFillTimeMs: number;
  fillRate: number;
  hourlyBreakdown: OrderMetrics[];
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [latencyStats, setLatencyStats] = useState<LatencyStats[]>([]);
  const [queryStats, setQueryStats] = useState<QueryStats[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState<number>(24); // hours

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, latencyRes, queryRes, ordersRes] = await Promise.all([
        fetch('/api/monitoring/health?minutes=60'),
        fetch(`/api/monitoring/latency?hours=${timeRange}&aggregated=true`),
        fetch(`/api/monitoring/queries?hours=${timeRange}&aggregated=true`),
        fetch(`/api/monitoring/orders?hours=${timeRange}&summary=true`),
      ]);

      if (healthRes.ok) {
        const data = await healthRes.json();
        if (data.success) setHealth(data.data);
      }

      if (latencyRes.ok) {
        const data = await latencyRes.json();
        if (data.success) setLatencyStats(data.data.stats || []);
      }

      if (queryRes.ok) {
        const data = await queryRes.json();
        if (data.success) setQueryStats(data.data.stats || []);
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        if (data.success) setOrderSummary(data.data);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'unhealthy':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  const formatLatency = (ms: number) => {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 100) return 'text-green-600';
    if (ms < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Performance Monitoring</h1>
              <p className="text-muted-foreground text-sm">
                System health and performance metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Time Range:</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(Number(e.target.value))}
                className="bg-background border rounded px-2 py-1 text-sm"
              >
                <option value={1}>Last 1 hour</option>
                <option value={6}>Last 6 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={72}>Last 3 days</option>
                <option value={168}>Last 7 days</option>
              </select>
            </div>
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
              Auto
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* System Status */}
        {health && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(health.status)}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      System Status
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(health.status)}`}></div>
                    </CardTitle>
                    <CardDescription>
                      Last {health.lookbackMinutes} minutes
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={health.status === 'healthy' ? 'default' : 'destructive'}>
                  {health.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* API Health */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">API Performance</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Latency</span>
                      <span className={`font-medium ${getLatencyColor(health.api.avgLatencyMs)}`}>
                        {formatLatency(health.api.avgLatencyMs)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Error Rate</span>
                      <span className={`font-medium ${health.api.errorRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                        {health.api.errorRate.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requests/min</span>
                      <span className="font-medium">{health.api.requestsPerMinute}</span>
                    </div>
                  </div>
                </div>

                {/* Database Health */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">Database</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Query Time</span>
                      <span className={`font-medium ${getLatencyColor(health.database.avgQueryTimeMs)}`}>
                        {formatLatency(health.database.avgQueryTimeMs)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Slow Queries</span>
                      <span className={`font-medium ${health.database.slowQueryCount > 10 ? 'text-red-600' : 'text-green-600'}`}>
                        {health.database.slowQueryCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Order Health */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">Order Execution</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fill Rate</span>
                      <span className={`font-medium ${health.orders.fillRate < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {health.orders.fillRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Fill Time</span>
                      <span className="font-medium">{formatLatency(health.orders.avgFillTimeMs)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rejection Rate</span>
                      <span className={`font-medium ${health.orders.rejectionRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                        {health.orders.rejectionRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Metrics */}
        {orderSummary && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle>Order Execution Metrics</CardTitle>
              </div>
              <CardDescription>
                Order statistics for the last {timeRange} hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{orderSummary.totalSubmitted}</p>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{orderSummary.totalFilled}</p>
                  <p className="text-sm text-muted-foreground">Filled</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{orderSummary.totalCancelled}</p>
                  <p className="text-sm text-muted-foreground">Cancelled</p>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{orderSummary.totalRejected}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{orderSummary.fillRate.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Fill Rate</p>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">{formatLatency(orderSummary.avgFillTimeMs)}</p>
                  <p className="text-sm text-muted-foreground">Avg Fill Time</p>
                </div>
              </div>

              {/* Hourly Breakdown Chart */}
              {orderSummary.hourlyBreakdown.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-3">Hourly Breakdown</h4>
                  <div className="overflow-x-auto">
                    <div className="flex gap-1 min-w-max">
                      {orderSummary.hourlyBreakdown.slice(-24).map((hour, index) => {
                        const total = hour.submitted || 1;
                        const filledPct = (hour.filled / total) * 100;
                        const hourLabel = new Date(hour.hour).toLocaleTimeString([], { hour: '2-digit' });
                        return (
                          <div key={index} className="flex flex-col items-center gap-1">
                            <div className="w-8 h-24 bg-muted rounded-t relative overflow-hidden">
                              <div
                                className="absolute bottom-0 w-full bg-green-500 transition-all"
                                style={{ height: `${filledPct}%` }}
                              ></div>
                              {hour.rejected > 0 && (
                                <div
                                  className="absolute top-0 w-full bg-red-500"
                                  style={{ height: `${(hour.rejected / total) * 100}%` }}
                                ></div>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{hourLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      Filled
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      Rejected
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-muted rounded"></div>
                      Pending/Cancelled
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* API Latency Stats */}
        {latencyStats.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle>API Endpoint Latency</CardTitle>
              </div>
              <CardDescription>
                Response time statistics by endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Endpoint</th>
                      <th className="text-left py-2 px-2">Method</th>
                      <th className="text-right py-2 px-2">Count</th>
                      <th className="text-right py-2 px-2">Avg</th>
                      <th className="text-right py-2 px-2">P50</th>
                      <th className="text-right py-2 px-2">P95</th>
                      <th className="text-right py-2 px-2">P99</th>
                      <th className="text-right py-2 px-2">Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latencyStats.slice(0, 20).map((stat, index) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-mono text-xs">{stat.endpoint}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-xs">
                            {stat.method}
                          </Badge>
                        </td>
                        <td className="text-right py-2 px-2">{stat.count}</td>
                        <td className={`text-right py-2 px-2 ${getLatencyColor(stat.avgLatencyMs)}`}>
                          {formatLatency(stat.avgLatencyMs)}
                        </td>
                        <td className="text-right py-2 px-2">{formatLatency(stat.p50LatencyMs)}</td>
                        <td className={`text-right py-2 px-2 ${getLatencyColor(stat.p95LatencyMs)}`}>
                          {formatLatency(stat.p95LatencyMs)}
                        </td>
                        <td className={`text-right py-2 px-2 ${getLatencyColor(stat.p99LatencyMs)}`}>
                          {formatLatency(stat.p99LatencyMs)}
                        </td>
                        <td className="text-right py-2 px-2">
                          <span className={stat.successRate < 99 ? 'text-yellow-600' : 'text-green-600'}>
                            {stat.successRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Query Stats */}
        {queryStats.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Database Query Performance</CardTitle>
              </div>
              <CardDescription>
                Query timing by model and operation (slow threshold: 100ms)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Model</th>
                      <th className="text-left py-2 px-2">Operation</th>
                      <th className="text-right py-2 px-2">Count</th>
                      <th className="text-right py-2 px-2">Avg Time</th>
                      <th className="text-right py-2 px-2">Max Time</th>
                      <th className="text-right py-2 px-2">Slow Queries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queryStats.slice(0, 20).map((stat, index) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-medium">{stat.model}</td>
                        <td className="py-2 px-2">
                          <Badge variant="secondary" className="text-xs">
                            {stat.operation}
                          </Badge>
                        </td>
                        <td className="text-right py-2 px-2">{stat.count}</td>
                        <td className={`text-right py-2 px-2 ${getLatencyColor(stat.avgLatencyMs)}`}>
                          {formatLatency(stat.avgLatencyMs)}
                        </td>
                        <td className={`text-right py-2 px-2 ${getLatencyColor(stat.maxLatencyMs)}`}>
                          {formatLatency(stat.maxLatencyMs)}
                        </td>
                        <td className="text-right py-2 px-2">
                          {stat.slowCount > 0 ? (
                            <span className="text-red-600 font-medium">{stat.slowCount}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && latencyStats.length === 0 && queryStats.length === 0 && !orderSummary && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Metrics Available</h3>
                <p className="text-sm">
                  Monitoring data will appear here once the system starts recording metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        {lastUpdate && (
          <div className="text-center text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleString()}
            {autoRefresh && ' (auto-refreshing every 30s)'}
          </div>
        )}
      </div>
    </div>
  );
}
