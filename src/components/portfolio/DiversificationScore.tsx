"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DiversificationAnalysis {
  score: number;
  sectorConcentration: number;
  correlationRisk: number;
  positionConcentration: number;
  recommendations: string[];
}

interface DiversificationScoreProps {
  analysis: DiversificationAnalysis;
  loading?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

function getScoreLabel(score: number): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (score >= 80) return { label: 'Excellent', variant: 'default' };
  if (score >= 60) return { label: 'Good', variant: 'secondary' };
  if (score >= 40) return { label: 'Moderate', variant: 'outline' };
  return { label: 'Poor', variant: 'destructive' };
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-green-500';
  if (score >= 60) return 'stroke-yellow-500';
  if (score >= 40) return 'stroke-orange-500';
  return 'stroke-red-500';
}

function CircularProgress({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-gray-200"
        />
        <circle
          cx="64"
          cy="64"
          r="45"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`${getScoreRingColor(score)} transition-all duration-1000`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>
          {score}
        </span>
      </div>
    </div>
  );
}

export function DiversificationScore({ analysis, loading }: DiversificationScoreProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Diversification Score</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const scoreLabel = getScoreLabel(analysis.score);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Diversification Score
          <Badge variant={scoreLabel.variant}>{scoreLabel.label}</Badge>
        </CardTitle>
        <CardDescription>
          How well diversified is your portfolio?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Score Circle */}
          <div className="flex flex-col items-center">
            <CircularProgress score={analysis.score} />
            <p className="mt-2 text-sm text-muted-foreground">Overall Score</p>
          </div>

          {/* Breakdown */}
          <div className="flex-1 space-y-4">
            {/* Position Concentration */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Position Concentration (HHI)</span>
                <span className={analysis.positionConcentration > 20 ? 'text-orange-600' : 'text-green-600'}>
                  {analysis.positionConcentration.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${analysis.positionConcentration > 20 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(analysis.positionConcentration * 4, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Lower is better. Below 15% is ideal.
              </p>
            </div>

            {/* Sector Concentration */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Top Sector Weight</span>
                <span className={analysis.sectorConcentration > 40 ? 'text-orange-600' : 'text-green-600'}>
                  {analysis.sectorConcentration.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${analysis.sectorConcentration > 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${analysis.sectorConcentration}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ideally no sector exceeds 30% of portfolio.
              </p>
            </div>

            {/* Correlation Risk */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Correlation Risk</span>
                <span className={analysis.correlationRisk > 50 ? 'text-orange-600' : 'text-green-600'}>
                  {analysis.correlationRisk.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${analysis.correlationRisk > 50 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${analysis.correlationRisk}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on correlation between holdings.
              </p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {analysis.recommendations.length > 0 && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Recommendations</h4>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-500 mt-0.5">⚠️</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.recommendations.length === 0 && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">
              ✓ No major diversification concerns detected!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
