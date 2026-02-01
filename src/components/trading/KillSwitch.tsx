'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Power, Shield } from 'lucide-react';

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

interface KillSwitchProps {
  riskData: RiskData | null;
  killSwitchActive: boolean;
  onToggleKillSwitch: (activate: boolean) => void;
  loading: boolean;
}

export function KillSwitch({ riskData, killSwitchActive, onToggleKillSwitch, loading }: KillSwitchProps) {
  const isActive = killSwitchActive || !riskData?.config.tradingEnabled;

  return (
    <Card className={isActive ? 'border-red-500 border-2' : ''}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Risk Controls
        </CardTitle>
        <Badge variant={isActive ? 'destructive' : 'success'}>
          {isActive ? 'TRADING DISABLED' : 'TRADING ENABLED'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Kill Switch Button */}
        <Button
          onClick={() => onToggleKillSwitch(!isActive)}
          disabled={loading}
          className={`w-full h-16 text-lg font-bold ${
            isActive
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          <Power className="h-6 w-6 mr-2" />
          {loading
            ? 'Processing...'
            : isActive
            ? 'ENABLE TRADING'
            : 'KILL SWITCH - STOP ALL'}
        </Button>

        {isActive && (
          <div className="flex items-center gap-2 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">
              Trading is disabled. All new orders will be rejected.
            </span>
          </div>
        )}

        {/* Risk Config Display */}
        {riskData && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Max Order Size</p>
              <p className="font-medium">{riskData.config.maxOrderSize} shares</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Position Size</p>
              <p className="font-medium">{riskData.config.maxPositionSize} shares</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Daily Loss Limit</p>
              <p className="font-medium">${riskData.config.maxDailyLoss.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Position Headroom</p>
              <p className="font-medium">{riskData.headroom.maxPositionHeadroom} shares</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
