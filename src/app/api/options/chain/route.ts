import { NextRequest } from 'next/server';
import {
  getOptionsContracts,
  getOptionsSnapshots,
} from '@/lib/alpaca-options';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { parseIntParam } from '@/lib/validation';

export interface OptionsChainEntry {
  contract: {
    symbol: string;
    name: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
    openInterest: number;
  };
  quote: {
    bid: number;
    ask: number;
    last: number;
    spread: number;
  } | null;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
  } | null;
}

export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const expiration = searchParams.get('expiration');
  const type = searchParams.get('type') as 'call' | 'put' | null;
  const minStrike = searchParams.get('minStrike');
  const maxStrike = searchParams.get('maxStrike');
  const limit = parseIntParam(searchParams.get('limit'), 50);

  if (!symbol) {
    return apiError('Symbol is required', 400);
  }

  // Fetch contracts
  const contractsResponse = await getOptionsContracts({
    underlying_symbol: symbol.toUpperCase(),
    expiration_date: expiration || undefined,
    expiration_date_gte: !expiration ? new Date().toISOString().split('T')[0] : undefined,
    type: type || undefined,
    strike_price_gte: minStrike ? parseFloat(minStrike) : undefined,
    strike_price_lte: maxStrike ? parseFloat(maxStrike) : undefined,
    limit,
  });

  const contracts = contractsResponse.option_contracts || [];

  // Get snapshots for quotes and greeks
  const snapshots: Record<string, {
    latestQuote?: { bid_price: number; ask_price: number; last_price?: number } | null;
    greeks?: { delta: number; gamma: number; theta: number; vega: number; implied_volatility: number } | null;
  }> = {};

  if (contracts.length > 0) {
    try {
      const contractSymbols = contracts.map(c => c.symbol);
      // Batch into groups of 100
      for (let i = 0; i < contractSymbols.length; i += 100) {
        const batch = contractSymbols.slice(i, i + 100);
        const batchSnapshots = await getOptionsSnapshots(batch);
        Object.assign(snapshots, batchSnapshots);
      }
    } catch {
      // Snapshots are optional - continue without them
    }
  }

  // Format response
  const chain: OptionsChainEntry[] = contracts.map(contract => {
    const snapshot = snapshots[contract.symbol];

    return {
      contract: {
        symbol: contract.symbol,
        name: contract.name,
        expiration: contract.expiration_date,
        strike: parseFloat(contract.strike_price),
        type: contract.type,
        openInterest: parseInt(contract.open_interest) || 0,
      },
      quote: snapshot?.latestQuote ? {
        bid: snapshot.latestQuote.bid_price,
        ask: snapshot.latestQuote.ask_price,
        last: snapshot.latestQuote.last_price || parseFloat(contract.close_price),
        spread: snapshot.latestQuote.ask_price - snapshot.latestQuote.bid_price,
      } : null,
      greeks: snapshot?.greeks ? {
        delta: snapshot.greeks.delta,
        gamma: snapshot.greeks.gamma,
        theta: snapshot.greeks.theta,
        vega: snapshot.greeks.vega,
        iv: snapshot.greeks.implied_volatility,
      } : null,
    };
  });

  // Group by expiration and strike
  const expirations = [...new Set(chain.map(c => c.contract.expiration))].sort();
  const strikes = [...new Set(chain.map(c => c.contract.strike))].sort((a, b) => a - b);

  return apiSuccess({
    symbol: symbol.toUpperCase(),
    chain,
    expirations,
    strikes,
    count: chain.length,
    nextPageToken: contractsResponse.next_page_token,
  });
});
