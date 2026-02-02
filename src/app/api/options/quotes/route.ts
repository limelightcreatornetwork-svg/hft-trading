import { NextRequest, NextResponse } from 'next/server';
import { getOptionsSnapshots } from '@/lib/alpaca-options';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbols = searchParams.get('symbols');

    if (!symbols) {
      return NextResponse.json(
        { success: false, error: 'Option symbols are required (comma-separated)' },
        { status: 400 }
      );
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    
    if (symbolList.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 symbols per request' },
        { status: 400 }
      );
    }

    const snapshots = await getOptionsSnapshots(symbolList);

    // Format response with greeks included
    const quotes = Object.entries(snapshots).map(([symbol, snapshot]) => ({
      symbol,
      quote: snapshot.latestQuote ? {
        bid: snapshot.latestQuote.bid_price,
        bidSize: snapshot.latestQuote.bid_size,
        ask: snapshot.latestQuote.ask_price,
        askSize: snapshot.latestQuote.ask_size,
        last: snapshot.latestQuote.last_price,
        lastSize: snapshot.latestQuote.last_size,
        spread: snapshot.latestQuote.ask_price - snapshot.latestQuote.bid_price,
        midpoint: (snapshot.latestQuote.bid_price + snapshot.latestQuote.ask_price) / 2,
        timestamp: snapshot.latestQuote.timestamp,
      } : null,
      trade: snapshot.latestTrade ? {
        price: snapshot.latestTrade.price,
        size: snapshot.latestTrade.size,
        exchange: snapshot.latestTrade.exchange,
        timestamp: snapshot.latestTrade.timestamp,
      } : null,
      greeks: snapshot.greeks ? {
        delta: snapshot.greeks.delta,
        gamma: snapshot.greeks.gamma,
        theta: snapshot.greeks.theta,
        vega: snapshot.greeks.vega,
        rho: snapshot.greeks.rho,
        impliedVolatility: snapshot.greeks.implied_volatility,
        // Derived metrics
        deltaNotional: snapshot.greeks.delta * 100, // Per contract
      } : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        quotes,
        count: quotes.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Options quotes API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch option quotes' 
      },
      { status: 500 }
    );
  }
}
