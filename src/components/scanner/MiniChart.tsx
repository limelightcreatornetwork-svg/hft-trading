"use client";

import { useMemo } from "react";

interface MiniChartProps {
  priceData: number[];
  volumeData: number[];
  breakoutType: 'bullish' | 'bearish';
  width?: number;
  height?: number;
}

export function MiniChart({ 
  priceData, 
  volumeData, 
  breakoutType, 
  width = 120, 
  height = 40 
}: MiniChartProps) {
  const { pricePath, volumeBars, minPrice, maxPrice } = useMemo(() => {
    if (!priceData.length) return { pricePath: '', volumeBars: [], minPrice: 0, maxPrice: 0 };
    
    const min = Math.min(...priceData);
    const max = Math.max(...priceData);
    const range = max - min || 1;
    
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2 - 10; // Reserve space for volume
    
    // Generate price line path
    const points = priceData.map((price, i) => {
      const x = padding + (i / (priceData.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((price - min) / range) * chartHeight;
      return `${x},${y}`;
    });
    
    const path = `M ${points.join(' L ')}`;
    
    // Generate volume bars
    const maxVol = Math.max(...volumeData);
    const bars = volumeData.map((vol, i) => {
      const x = padding + (i / volumeData.length) * chartWidth;
      const barHeight = (vol / maxVol) * 8;
      return { x, height: barHeight, y: height - barHeight - 2 };
    });
    
    return { pricePath: path, volumeBars: bars, minPrice: min, maxPrice: max };
  }, [priceData, volumeData, width, height]);
  
  const lineColor = breakoutType === 'bullish' ? '#22c55e' : '#ef4444';
  const fillColor = breakoutType === 'bullish' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Volume bars */}
      {volumeBars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={2}
          height={bar.height}
          fill={i === volumeBars.length - 1 ? lineColor : '#4b5563'}
          opacity={0.5}
        />
      ))}
      
      {/* Price area fill */}
      {pricePath && (
        <path
          d={`${pricePath} L ${width - 2},${height - 12} L 2,${height - 12} Z`}
          fill={fillColor}
        />
      )}
      
      {/* Price line */}
      {pricePath && (
        <path
          d={pricePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      
      {/* Breakout indicator dot */}
      {priceData.length > 0 && (
        <circle
          cx={width - 2}
          cy={2 + (height - 14) - ((priceData[priceData.length - 1] - minPrice) / (maxPrice - minPrice || 1)) * (height - 14)}
          r="3"
          fill={lineColor}
        />
      )}
    </svg>
  );
}
