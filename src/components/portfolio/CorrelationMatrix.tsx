"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CorrelationMatrixData {
  symbols: string[];
  matrix: number[][];
  highCorrelations: Array<{
    symbol1: string;
    symbol2: string;
    correlation: number;
  }>;
}

interface CorrelationMatrixProps {
  data: CorrelationMatrixData;
  loading?: boolean;
}

function getCorrelationColor(value: number): string {
  // Convert correlation (-1 to 1) to color
  if (value >= 0.7) return 'bg-red-500 text-white';
  if (value >= 0.5) return 'bg-orange-400 text-white';
  if (value >= 0.3) return 'bg-yellow-300 text-black';
  if (value >= -0.3) return 'bg-gray-100 text-black';
  if (value >= -0.5) return 'bg-blue-200 text-black';
  if (value >= -0.7) return 'bg-blue-400 text-white';
  return 'bg-blue-600 text-white';
}

function getCorrelationInterpretation(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 0.8) return value > 0 ? 'Very strong positive' : 'Very strong negative';
  if (absValue >= 0.6) return value > 0 ? 'Strong positive' : 'Strong negative';
  if (absValue >= 0.4) return value > 0 ? 'Moderate positive' : 'Moderate negative';
  if (absValue >= 0.2) return value > 0 ? 'Weak positive' : 'Weak negative';
  return 'No correlation';
}

export function CorrelationMatrix({ data, loading }: CorrelationMatrixProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Correlation Matrix</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (data.symbols.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Correlation Matrix</CardTitle>
          <CardDescription>Not enough positions for correlation analysis</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correlation Analysis</CardTitle>
        <CardDescription>
          How your holdings move together (based on recent price history)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left font-medium"></th>
                {data.symbols.map(sym => (
                  <th key={sym} className="p-2 text-center font-medium min-w-[60px]">
                    {sym}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.symbols.map((sym, i) => (
                <tr key={sym}>
                  <td className="p-2 font-medium">{sym}</td>
                  {data.matrix[i].map((corr, j) => (
                    <td key={j} className="p-1">
                      <div 
                        className={`p-2 text-center rounded ${getCorrelationColor(corr)} ${i === j ? 'opacity-50' : ''}`}
                        title={`${data.symbols[i]} vs ${data.symbols[j]}: ${corr.toFixed(2)}`}
                      >
                        {corr.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Color Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Correlation:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-600" />
            <span>-1.0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-200" />
            <span>-0.5</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-100 border" />
            <span>0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-yellow-300" />
            <span>+0.5</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span>+1.0</span>
          </div>
        </div>

        {/* High Correlations Alert */}
        {data.highCorrelations.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <span>⚠️ Highly Correlated Pairs</span>
              <Badge variant="destructive">{data.highCorrelations.length}</Badge>
            </h4>
            <div className="space-y-2">
              {data.highCorrelations.map((pair, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-2 bg-orange-50 border border-orange-200 rounded"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pair.symbol1}</Badge>
                    <span className="text-muted-foreground">↔</span>
                    <Badge variant="outline">{pair.symbol2}</Badge>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-orange-700">
                      {(pair.correlation * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {getCorrelationInterpretation(pair.correlation)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Highly correlated positions move together, reducing diversification benefits.
              Consider reducing exposure to one of each pair.
            </p>
          </div>
        )}

        {data.highCorrelations.length === 0 && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <p className="font-medium text-green-800">✓ Good Diversification</p>
            <p className="text-green-700 mt-1">
              No highly correlated pairs detected. Your holdings provide good diversification.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
