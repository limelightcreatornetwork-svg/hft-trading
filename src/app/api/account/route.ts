import { NextResponse } from 'next/server';
import { getAccount } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET() {
  try {
    const account = await getAccount();

    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    const dailyPL = equity - lastEquity;
    // Prevent division by zero
    const dailyPLPercent = lastEquity > 0 ? (dailyPL / lastEquity) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        status: account.status,
        currency: account.currency,
        buyingPower: parseFloat(account.buying_power),
        cash: parseFloat(account.cash),
        portfolioValue: parseFloat(account.portfolio_value),
        equity,
        lastEquity,
        longMarketValue: parseFloat(account.long_market_value),
        shortMarketValue: parseFloat(account.short_market_value),
        initialMargin: parseFloat(account.initial_margin),
        maintenanceMargin: parseFloat(account.maintenance_margin),
        daytradeCount: account.daytrade_count,
        patternDayTrader: account.pattern_day_trader,
        dailyPL,
        dailyPLPercent,
      },
    });
  } catch (error) {
    console.error('Account API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch account' 
      },
      { status: 500 }
    );
  }
});
