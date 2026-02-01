'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AccountData {
  equity: number;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  dailyPL: number;
  dailyPLPercent: number;
  status: string;
}

interface AccountCardProps {
  data: AccountData | null;
  loading: boolean;
}

export function AccountCard({ data, loading }: AccountCardProps) {
  if (loading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Failed to load account data</p>
        </CardContent>
      </Card>
    );
  }

  const isPositive = data.dailyPL >= 0;

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Account Summary</CardTitle>
        <Badge variant={data.status === 'ACTIVE' ? 'success' : 'secondary'}>
          {data.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Equity</p>
            <p className="text-2xl font-bold">${data.equity.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Buying Power</p>
            <p className="text-2xl font-bold">${data.buyingPower.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Cash</p>
            <p className="text-2xl font-bold">${data.cash.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Daily P&L</p>
            <p className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}${data.dailyPL.toFixed(2)}
              <span className="text-sm ml-1">
                ({isPositive ? '+' : ''}{data.dailyPLPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
