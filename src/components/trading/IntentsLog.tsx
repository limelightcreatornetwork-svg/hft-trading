'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

interface IntentsLogProps {
  intents: Intent[];
  loading: boolean;
}

export function IntentsLog({ intents, loading }: IntentsLogProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Intents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'EXECUTED':
        return 'success';
      case 'APPROVED':
        return 'default';
      case 'REJECTED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Intents ({intents.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {intents.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No recent intents</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {intents.map((intent) => (
              <div
                key={intent.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={intent.side === 'BUY' ? 'success' : 'destructive'}>
                    {intent.side}
                  </Badge>
                  <span className="font-medium">{intent.symbol}</span>
                  <span className="text-muted-foreground">
                    {intent.quantity} @ {intent.orderType}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={getStatusVariant(intent.status)}>
                    {intent.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(intent.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
