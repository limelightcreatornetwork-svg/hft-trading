import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET() {
  try {
    const positions = await getPositions();
    
    const formattedPositions = positions.map(pos => ({
      symbol: pos.symbol,
      assetId: pos.asset_id,
      exchange: pos.exchange,
      assetClass: pos.asset_class,
      quantity: parseFloat(pos.qty),
      side: pos.side,
      avgEntryPrice: parseFloat(pos.avg_entry_price),
      currentPrice: parseFloat(pos.current_price),
      marketValue: parseFloat(pos.market_value),
      costBasis: parseFloat(pos.cost_basis),
      unrealizedPL: parseFloat(pos.unrealized_pl),
      unrealizedPLPercent: parseFloat(pos.unrealized_plpc) * 100,
      unrealizedIntradayPL: parseFloat(pos.unrealized_intraday_pl),
      unrealizedIntradayPLPercent: parseFloat(pos.unrealized_intraday_plpc) * 100,
      lastdayPrice: parseFloat(pos.lastday_price),
      changeToday: parseFloat(pos.change_today) * 100,
    }));

    // Calculate totals
    const totals = {
      totalMarketValue: formattedPositions.reduce((sum, p) => sum + p.marketValue, 0),
      totalCostBasis: formattedPositions.reduce((sum, p) => sum + p.costBasis, 0),
      totalUnrealizedPL: formattedPositions.reduce((sum, p) => sum + p.unrealizedPL, 0),
      totalIntradayPL: formattedPositions.reduce((sum, p) => sum + p.unrealizedIntradayPL, 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        positions: formattedPositions,
        totals,
        count: formattedPositions.length,
      },
    });
  } catch (error) {
    console.error('Positions API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch positions' 
      },
      { status: 500 }
    );
  }
});
