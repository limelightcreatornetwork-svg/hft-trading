import { NextResponse } from 'next/server';
import { getAccount } from '@/lib/alpaca';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const account = await getAccount();
    
    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        status: account.status,
        currency: account.currency,
        buyingPower: parseFloat(account.buying_power),
        cash: parseFloat(account.cash),
        portfolioValue: parseFloat(account.portfolio_value),
        equity: parseFloat(account.equity),
        lastEquity: parseFloat(account.last_equity),
        longMarketValue: parseFloat(account.long_market_value),
        shortMarketValue: parseFloat(account.short_market_value),
        initialMargin: parseFloat(account.initial_margin),
        maintenanceMargin: parseFloat(account.maintenance_margin),
        daytradeCount: account.daytrade_count,
        patternDayTrader: account.pattern_day_trader,
        dailyPL: parseFloat(account.equity) - parseFloat(account.last_equity),
        dailyPLPercent: ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity)) * 100,
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
}
