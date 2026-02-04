import { NextRequest } from 'next/server';
import { getOptionsSnapshots } from '@/lib/alpaca-options';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbols = searchParams.get('symbols');

  if (!symbols) {
    return apiError('Option symbols are required (comma-separated)', 400);
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  if (symbolList.length > 100) {
    return apiError('Maximum 100 symbols per request', 400);
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

  return apiSuccess({
    quotes,
    snapshots, // Also return raw snapshots for components that need them
    count: quotes.length,
    timestamp: new Date().toISOString(),
  });
});
