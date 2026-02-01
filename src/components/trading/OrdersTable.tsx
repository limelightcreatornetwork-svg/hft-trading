'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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

interface OrdersTableProps {
  orders: Order[];
  loading: boolean;
  onCancelOrder: (orderId: string) => void;
}

export function OrdersTable({ orders, loading, onCancelOrder }: OrdersTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'filled':
        return 'success';
      case 'canceled':
      case 'expired':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      default:
        return 'warning';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Orders ({orders.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No open orders</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Filled</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={order.side === 'buy' ? 'success' : 'destructive'}>
                      {order.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.type.toUpperCase()}</TableCell>
                  <TableCell className="text-right">{order.quantity}</TableCell>
                  <TableCell className="text-right">{order.filledQuantity}</TableCell>
                  <TableCell className="text-right">
                    {order.limitPrice ? `$${order.limitPrice.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(order.submittedAt).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCancelOrder(order.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
