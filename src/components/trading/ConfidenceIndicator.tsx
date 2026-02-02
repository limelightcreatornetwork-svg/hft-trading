'use client';

import { Badge } from '@/components/ui/badge';

interface ConfidenceIndicatorProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceIndicator({ 
  score, 
  showLabel = true,
  size = 'md' 
}: ConfidenceIndicatorProps) {
  const getColor = (score: number) => {
    if (score >= 8) return 'bg-green-500 hover:bg-green-600';
    if (score >= 6) return 'bg-yellow-500 hover:bg-yellow-600';
    if (score >= 4) return 'bg-orange-500 hover:bg-orange-600';
    return 'bg-red-500 hover:bg-red-600';
  };

  const getLabel = (score: number) => {
    if (score >= 8) return 'HIGH';
    if (score >= 6) return 'MEDIUM';
    if (score >= 4) return 'LOW';
    return 'SKIP';
  };

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge className={`${getColor(score)} ${sizeClasses[size]} text-white font-bold`}>
      {score}/10 {showLabel && `(${getLabel(score)})`}
    </Badge>
  );
}

interface ConfidenceBarProps {
  score: number;
  label?: string;
  showValue?: boolean;
}

export function ConfidenceBar({ score, label, showValue = true }: ConfidenceBarProps) {
  const getColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    if (score >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          {showValue && <span className="font-medium">{score}/10</span>}
        </div>
      )}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(score)} transition-all duration-300`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

interface ConfidenceBreakdownProps {
  technical: number;
  riskReward: number;
  marketConditions: number;
  timeOfDay: number;
  total: number;
}

export function ConfidenceBreakdown({
  technical,
  riskReward,
  marketConditions,
  timeOfDay,
  total,
}: ConfidenceBreakdownProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Total Confidence</span>
        <ConfidenceIndicator score={total} />
      </div>
      <div className="space-y-2 text-sm">
        <ConfidenceBar score={technical} label="Technical" />
        <ConfidenceBar score={riskReward} label="Risk/Reward" />
        <ConfidenceBar score={marketConditions} label="Market Conditions" />
        <ConfidenceBar score={timeOfDay} label="Time of Day" />
      </div>
    </div>
  );
}
