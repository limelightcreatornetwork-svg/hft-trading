"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegimeDisplay } from "@/components/trading/RegimeDisplay";

export default function DashboardPage() {
  // Default symbols to monitor for regime
  const watchlistSymbols = ['SPY', 'QQQ', 'AAPL'];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">HFT Trading Dashboard</h1>
        <Badge variant="outline" className="text-red-500 border-red-500">
          PAPER TRADING
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Portfolio Value</CardDescription>
            <CardTitle className="text-2xl">$100,000.00</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Day P&L</CardDescription>
            <CardTitle className="text-2xl text-green-500">+$0.00</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Positions</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today's Trades</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Market Regime */}
      <Card>
        <CardHeader>
          <CardTitle>Market Regime Detection</CardTitle>
          <CardDescription>Real-time market condition classification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {watchlistSymbols.map((symbol) => (
              <RegimeDisplay key={symbol} symbol={symbol} refreshInterval={10000} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Status */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Controls</CardTitle>
          <CardDescription>Current risk limits and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Max Position Size</p>
              <p className="text-lg font-semibold">$10,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max Daily Loss</p>
              <p className="text-lg font-semibold">$1,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Used / Daily Limit</p>
              <p className="text-lg font-semibold">$0 / $1,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kill Switch</p>
              <Button variant="destructive" size="sm">HALT TRADING</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Avg Cost</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No open positions
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No recent orders
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
