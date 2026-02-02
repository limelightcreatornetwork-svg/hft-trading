"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SectorAllocation {
  sector: string;
  symbols: string[];
  totalValue: number;
  weight: number;
}

interface AssetClassAllocation {
  assetClass: string;
  symbols: string[];
  totalValue: number;
  weight: number;
}

interface AllocationChartProps {
  sectorAllocation: SectorAllocation[];
  assetClassAllocation: AssetClassAllocation[];
  loading?: boolean;
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology': 'bg-blue-500',
  'Electric Vehicles': 'bg-green-500',
  'Automotive': 'bg-yellow-500',
  'Consumer Discretionary': 'bg-purple-500',
  'Healthcare': 'bg-pink-500',
  'Financial': 'bg-indigo-500',
  'Energy': 'bg-orange-500',
  'Communication Services': 'bg-cyan-500',
  'ETF - Index': 'bg-slate-500',
  'Other': 'bg-gray-500',
};

const ASSET_CLASS_COLORS: Record<string, string> = {
  'Index ETF': 'bg-emerald-500',
  'Individual Stock': 'bg-blue-500',
};

function AllocationBar({ 
  items, 
  colorMap, 
  type 
}: { 
  items: (SectorAllocation | AssetClassAllocation)[]; 
  colorMap: Record<string, string>;
  type: 'sector' | 'assetClass';
}) {
  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="h-8 flex rounded-lg overflow-hidden">
        {items.map((item, idx) => {
          const key = type === 'sector' 
            ? (item as SectorAllocation).sector 
            : (item as AssetClassAllocation).assetClass;
          const color = colorMap[key] || 'bg-gray-400';
          const width = Math.max(item.weight * 100, 1); // minimum 1% for visibility
          
          return (
            <div
              key={idx}
              className={`${color} relative group cursor-pointer transition-opacity hover:opacity-80`}
              style={{ width: `${width}%` }}
              title={`${key}: ${(item.weight * 100).toFixed(1)}%`}
            >
              {width > 10 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium truncate px-1">
                  {(item.weight * 100).toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => {
          const key = type === 'sector' 
            ? (item as SectorAllocation).sector 
            : (item as AssetClassAllocation).assetClass;
          const color = colorMap[key] || 'bg-gray-400';
          
          return (
            <div key={idx} className="flex items-center gap-1 text-xs">
              <div className={`w-3 h-3 rounded ${color}`} />
              <span className="text-muted-foreground">{key}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AllocationChart({ sectorAllocation, assetClassAllocation, loading }: AllocationChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Allocation</CardTitle>
        <CardDescription>Sector and asset class breakdown</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sector Allocation */}
        <div>
          <h4 className="font-medium mb-3">Sector Allocation</h4>
          <AllocationBar 
            items={sectorAllocation} 
            colorMap={SECTOR_COLORS}
            type="sector"
          />
          
          {/* Detailed breakdown */}
          <div className="mt-4 space-y-2">
            {sectorAllocation.map((sector, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded ${SECTOR_COLORS[sector.sector] || 'bg-gray-400'}`} />
                  <span>{sector.sector}</span>
                  <span className="text-muted-foreground">
                    ({sector.symbols.join(', ')})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    ${sector.totalValue.toFixed(2)}
                  </span>
                  <Badge variant="outline">
                    {(sector.weight * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Class Allocation */}
        <div className="pt-4 border-t">
          <h4 className="font-medium mb-3">Asset Class Allocation</h4>
          <AllocationBar 
            items={assetClassAllocation} 
            colorMap={ASSET_CLASS_COLORS}
            type="assetClass"
          />
          
          {/* Detailed breakdown */}
          <div className="mt-4 space-y-2">
            {assetClassAllocation.map((ac, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded ${ASSET_CLASS_COLORS[ac.assetClass] || 'bg-gray-400'}`} />
                  <span>{ac.assetClass}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    ${ac.totalValue.toFixed(2)}
                  </span>
                  <Badge variant="outline">
                    {(ac.weight * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concentration Warning */}
        {sectorAllocation.length > 0 && sectorAllocation[0].weight > 0.4 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
            <p className="font-medium text-yellow-800">
              ⚠️ Sector Concentration Warning
            </p>
            <p className="text-yellow-700 mt-1">
              {sectorAllocation[0].sector} represents {(sectorAllocation[0].weight * 100).toFixed(1)}% of your portfolio.
              Consider diversifying to reduce sector-specific risk.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
