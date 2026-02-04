'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IVDataPoint {
  strike: number;
  expiration: string;
  iv: number;
  type: 'call' | 'put';
  delta?: number;
}

interface IVSurfaceProps {
  data: IVDataPoint[];
  currentPrice: number;
  symbol: string;
}

// IV Smile/Skew visualization
function IVSmile({ 
  data, 
  currentPrice, 
  expiration 
}: { 
  data: IVDataPoint[]; 
  currentPrice: number;
  expiration: string;
}) {
  // Filter data for this expiration and sort by strike
  const expirationData = useMemo(() => {
    return data
      .filter(d => d.expiration === expiration)
      .sort((a, b) => a.strike - b.strike);
  }, [data, expiration]);

  if (expirationData.length < 3) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Not enough data points for this expiration
      </div>
    );
  }

  // Calculate stats
  const ivValues = expirationData.map(d => d.iv);
  const minIV = Math.min(...ivValues);
  const maxIV = Math.max(...ivValues);
  const avgIV = ivValues.reduce((a, b) => a + b, 0) / ivValues.length;
  const atmStrike = expirationData.reduce((prev, curr) => 
    Math.abs(curr.strike - currentPrice) < Math.abs(prev.strike - currentPrice) ? curr : prev
  );
  const atmIV = atmStrike.iv;

  // Calculate skew (difference between OTM put and OTM call IV)
  const otmPuts = expirationData.filter(d => d.type === 'put' && d.strike < currentPrice);
  const otmCalls = expirationData.filter(d => d.type === 'call' && d.strike > currentPrice);
  const putIV = otmPuts.length > 0 ? otmPuts[0].iv : atmIV;
  const callIV = otmCalls.length > 0 ? otmCalls[otmCalls.length - 1].iv : atmIV;
  const skew = ((putIV - callIV) / atmIV) * 100;

  const strikes = expirationData.map(d => d.strike);
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const strikeRange = maxStrike - minStrike || 1;
  const ivRange = maxIV - minIV || 0.01;

  return (
    <div className="space-y-3">
      {/* IV Smile Chart */}
      <div className="relative h-32 bg-gray-800 rounded-lg p-2">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-2 bottom-2 w-10 flex flex-col justify-between text-[10px] text-gray-500">
          <span>{(maxIV * 100).toFixed(0)}%</span>
          <span>{(avgIV * 100).toFixed(0)}%</span>
          <span>{(minIV * 100).toFixed(0)}%</span>
        </div>

        {/* Chart area */}
        <div className="ml-10 h-full relative">
          {/* Current price line */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-blue-500/50"
            style={{ left: `${((currentPrice - minStrike) / strikeRange) * 100}%` }}
          >
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-blue-400">
              ${currentPrice.toFixed(0)}
            </span>
          </div>

          {/* IV curve */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {/* Put IV area (left of ATM) */}
            <path
              d={[
                'M',
                ...expirationData.filter(d => d.strike <= currentPrice).map((d, i, arr) => {
                  const x = ((d.strike - minStrike) / strikeRange) * 100;
                  const y = ((maxIV - d.iv) / ivRange) * 100;
                  return `${x}% ${y}%`;
                }),
                `L ${((currentPrice - minStrike) / strikeRange) * 100}% 100%`,
                'L 0% 100%',
                'Z'
              ].join(' ')}
              fill="rgba(239, 68, 68, 0.1)"
            />
            
            {/* Call IV area (right of ATM) */}
            <path
              d={[
                'M',
                ...expirationData.filter(d => d.strike >= currentPrice).map((d, i, arr) => {
                  const x = ((d.strike - minStrike) / strikeRange) * 100;
                  const y = ((maxIV - d.iv) / ivRange) * 100;
                  return `${x}% ${y}%`;
                }),
                `L 100% 100%`,
                `L ${((currentPrice - minStrike) / strikeRange) * 100}% 100%`,
                'Z'
              ].join(' ')}
              fill="rgba(34, 197, 94, 0.1)"
            />

            {/* IV smile line */}
            <path
              d={expirationData.map((d, i) => {
                const x = ((d.strike - minStrike) / strikeRange) * 100;
                const y = ((maxIV - d.iv) / ivRange) * 100;
                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
              }).join(' ')}
              fill="none"
              stroke="url(#ivGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            <defs>
              <linearGradient id="ivGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>

            {/* Data points */}
            {expirationData.map((d, i) => {
              const x = ((d.strike - minStrike) / strikeRange) * 100;
              const y = ((maxIV - d.iv) / ivRange) * 100;
              const isATM = d.strike === atmStrike.strike;
              return (
                <circle
                  key={i}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r={isATM ? 5 : 3}
                  fill={isATM ? '#3b82f6' : d.type === 'call' ? '#22c55e' : '#ef4444'}
                  stroke="#1f2937"
                  strokeWidth="1"
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-gray-500 ml-10">
        <span>${minStrike.toFixed(0)}</span>
        <span>Strike</span>
        <span>${maxStrike.toFixed(0)}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-gray-500">ATM IV</div>
          <div className="text-yellow-400 font-bold">{(atmIV * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-gray-500">Min IV</div>
          <div className="text-green-400 font-bold">{(minIV * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-gray-500">Max IV</div>
          <div className="text-red-400 font-bold">{(maxIV * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-gray-500">Skew</div>
          <div className={`font-bold ${skew > 5 ? 'text-red-400' : skew < -5 ? 'text-green-400' : 'text-gray-400'}`}>
            {skew > 0 ? '+' : ''}{skew.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Skew interpretation */}
      <div className="text-xs p-2 bg-gray-800/50 rounded-lg">
        {skew > 10 && (
          <p className="text-red-400">
            ⚠️ <strong>Heavy put skew</strong> - Market pricing in downside risk. Put IV elevated.
          </p>
        )}
        {skew > 5 && skew <= 10 && (
          <p className="text-yellow-400">
            📉 <strong>Moderate put skew</strong> - Typical bearish sentiment. Consider put spreads.
          </p>
        )}
        {skew >= -5 && skew <= 5 && (
          <p className="text-gray-400">
            ⚖️ <strong>Balanced skew</strong> - Normal volatility distribution across strikes.
          </p>
        )}
        {skew < -5 && (
          <p className="text-green-400">
            📈 <strong>Call skew</strong> - Unusual bullish positioning. Call IV elevated.
          </p>
        )}
      </div>
    </div>
  );
}

// Term Structure visualization
function TermStructure({ data, currentPrice }: { data: IVDataPoint[]; currentPrice: number }) {
  // Get ATM IV for each expiration
  const termStructure = useMemo(() => {
    const expirations = [...new Set(data.map(d => d.expiration))].sort();
    return expirations.map(exp => {
      const expData = data.filter(d => d.expiration === exp);
      // Find ATM option
      const atm = expData.reduce((prev, curr) => 
        Math.abs(curr.strike - currentPrice) < Math.abs(prev.strike - currentPrice) ? curr : prev
      );
      
      /* eslint-disable -- Date.now() acceptable for DTE calculation */
      const daysToExpiry = Math.ceil(
        (new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      /* eslint-enable */
      
      return {
        expiration: exp,
        dte: daysToExpiry,
        atmIV: atm.iv,
      };
    }).filter(d => d.dte > 0);
  }, [data, currentPrice]);

  if (termStructure.length < 2) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Need multiple expirations for term structure
      </div>
    );
  }

  const minIV = Math.min(...termStructure.map(d => d.atmIV));
  const maxIV = Math.max(...termStructure.map(d => d.atmIV));
  const ivRange = maxIV - minIV || 0.01;
  const maxDTE = Math.max(...termStructure.map(d => d.dte));

  // Determine term structure shape
  const frontIV = termStructure[0]?.atmIV || 0;
  const backIV = termStructure[termStructure.length - 1]?.atmIV || 0;
  const isContango = backIV > frontIV;
  const isBackwardation = frontIV > backIV;

  return (
    <div className="space-y-3">
      {/* Term Structure Chart */}
      <div className="relative h-24 bg-gray-800 rounded-lg p-2">
        <div className="absolute left-0 top-2 bottom-2 w-10 flex flex-col justify-between text-[10px] text-gray-500">
          <span>{(maxIV * 100).toFixed(0)}%</span>
          <span>{(minIV * 100).toFixed(0)}%</span>
        </div>

        <div className="ml-10 h-full relative">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {/* Area fill */}
            <path
              d={[
                'M',
                ...termStructure.map((d, i) => {
                  const x = (d.dte / maxDTE) * 100;
                  const y = ((maxIV - d.atmIV) / ivRange) * 100;
                  return `${x}% ${y}%`;
                }),
                `L 100% 100%`,
                'L 0% 100%',
                'Z'
              ].join(' ')}
              fill={isContango ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
            />
            
            {/* Line */}
            <path
              d={termStructure.map((d, i) => {
                const x = (d.dte / maxDTE) * 100;
                const y = ((maxIV - d.atmIV) / ivRange) * 100;
                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
              }).join(' ')}
              fill="none"
              stroke={isContango ? '#22c55e' : '#ef4444'}
              strokeWidth="2"
            />

            {/* Points */}
            {termStructure.map((d, i) => {
              const x = (d.dte / maxDTE) * 100;
              const y = ((maxIV - d.atmIV) / ivRange) * 100;
              return (
                <circle
                  key={i}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r={4}
                  fill={isContango ? '#22c55e' : '#ef4444'}
                  stroke="#1f2937"
                  strokeWidth="1"
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* X-axis */}
      <div className="flex justify-between text-[10px] text-gray-500 ml-10">
        {termStructure.slice(0, 5).map((d, i) => (
          <span key={i}>{d.dte}d</span>
        ))}
      </div>

      {/* Term Structure Info */}
      <div className={`p-2 rounded-lg text-xs ${
        isContango ? 'bg-green-900/30 border border-green-700/50' : 
        isBackwardation ? 'bg-red-900/30 border border-red-700/50' :
        'bg-gray-800'
      }`}>
        {isContango && (
          <p className="text-green-400">
            📈 <strong>Contango</strong> - Back months have higher IV. Normal structure.
            Calendar spreads may benefit from IV convergence.
          </p>
        )}
        {isBackwardation && (
          <p className="text-red-400">
            ⚠️ <strong>Backwardation</strong> - Front month IV elevated (event coming?).
            Consider avoiding selling near-term options.
          </p>
        )}
        {!isContango && !isBackwardation && (
          <p className="text-gray-400">
            ⚖️ <strong>Flat</strong> - IV consistent across expirations.
          </p>
        )}
      </div>
    </div>
  );
}

export function IVSurface({ data, currentPrice, symbol }: IVSurfaceProps) {
  const expirations = useMemo(() => 
    [...new Set(data.map(d => d.expiration))].sort().slice(0, 4), 
    [data]
  );

  const selectedExpiration = expirations[0] || '';

  // Calculate overall IV stats
  const overallStats = useMemo(() => {
    if (data.length === 0) return null;
    
    const ivs = data.map(d => d.iv);
    const avgIV = ivs.reduce((a, b) => a + b, 0) / ivs.length;
    const minIV = Math.min(...ivs);
    const maxIV = Math.max(...ivs);
    
    // Simple IV percentile (would need historical data for real calculation)
    const ivPercentile = Math.min(100, Math.max(0, (avgIV - 0.15) / 0.35 * 100));
    
    return { avgIV, minIV, maxIV, ivPercentile };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">📉 IV Surface</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            Select a symbol to view IV surface
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>📉 IV Surface - {symbol}</span>
          {overallStats && (
            <div className="flex items-center gap-2">
              <Badge 
                variant={overallStats.ivPercentile > 70 ? 'destructive' : overallStats.ivPercentile > 30 ? 'secondary' : 'success'}
              >
                IV Rank: {overallStats.ivPercentile.toFixed(0)}%
              </Badge>
              <span className="text-sm text-yellow-400">
                Avg: {(overallStats.avgIV * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* IV Smile Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <span>😊</span> IV Smile (Strike Skew)
            <span className="text-xs text-gray-500">
              - {new Date(selectedExpiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </h4>
          <IVSmile 
            data={data} 
            currentPrice={currentPrice} 
            expiration={selectedExpiration} 
          />
        </div>

        {/* Term Structure Section */}
        <div className="pt-4 border-t border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <span>📅</span> Term Structure (Time Skew)
          </h4>
          <TermStructure data={data} currentPrice={currentPrice} />
        </div>

        {/* IV Summary */}
        {overallStats && (
          <div className="pt-4 border-t border-gray-700">
            <h4 className="text-sm font-medium text-gray-300 mb-3">📊 IV Analysis</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">IV Percentile</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        overallStats.ivPercentile > 70 ? 'bg-red-500' : 
                        overallStats.ivPercentile > 30 ? 'bg-yellow-500' : 
                        'bg-green-500'
                      }`}
                      style={{ width: `${overallStats.ivPercentile}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white">
                    {overallStats.ivPercentile.toFixed(0)}%
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {overallStats.ivPercentile > 70 
                    ? 'IV is elevated - good for selling premium' 
                    : overallStats.ivPercentile > 30 
                    ? 'IV is normal - neutral conditions'
                    : 'IV is low - good for buying premium'}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Trading Suggestion</div>
                <div className="text-sm">
                  {overallStats.ivPercentile > 70 ? (
                    <span className="text-red-400">
                      🔴 Consider <strong>selling</strong> premium (covered calls, CSPs)
                    </span>
                  ) : overallStats.ivPercentile > 30 ? (
                    <span className="text-yellow-400">
                      🟡 <strong>Neutral</strong> - evaluate other factors
                    </span>
                  ) : (
                    <span className="text-green-400">
                      🟢 Consider <strong>buying</strong> premium (long calls/puts)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
