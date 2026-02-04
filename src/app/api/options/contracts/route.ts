import { NextRequest } from 'next/server';
import { getOptionContract, getOptionsContracts } from '@/lib/alpaca-options';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { parseIntParam } from '@/lib/validation';

/**
 * GET /api/options/contracts
 * Fetch option contracts with optional filtering
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const contractId = searchParams.get('id');
  const symbol = searchParams.get('symbol');
  const underlying = searchParams.get('underlying');
  const expiration = searchParams.get('expiration');
  const type = searchParams.get('type') as 'call' | 'put' | null;
  const limit = parseIntParam(searchParams.get('limit'), 100);

  // If specific contract ID or symbol provided, fetch single contract
  if (contractId || symbol) {
    const contract = await getOptionContract((contractId || symbol) as string);
    return apiSuccess({
      contract: {
        id: contract.id,
        symbol: contract.symbol,
        name: contract.name,
        status: contract.status,
        tradable: contract.tradable,
        expiration: contract.expiration_date,
        underlying: contract.underlying_symbol,
        type: contract.type,
        style: contract.style,
        strike: parseFloat(contract.strike_price),
        contractSize: parseInt(contract.size),
        openInterest: parseInt(contract.open_interest),
        openInterestDate: contract.open_interest_date,
        closePrice: parseFloat(contract.close_price),
        closePriceDate: contract.close_price_date,
      },
    });
  }

  // Otherwise, fetch list of contracts
  if (!underlying) {
    return apiError('Either contract id/symbol or underlying symbol is required', 400);
  }

  const response = await getOptionsContracts({
    underlying_symbol: underlying.toUpperCase(),
    expiration_date: expiration || undefined,
    type: type || undefined,
    limit,
  });

  const contracts = (response.option_contracts || []).map(contract => ({
    id: contract.id,
    symbol: contract.symbol,
    name: contract.name,
    status: contract.status,
    tradable: contract.tradable,
    expiration: contract.expiration_date,
    underlying: contract.underlying_symbol,
    type: contract.type,
    style: contract.style,
    strike: parseFloat(contract.strike_price),
    contractSize: parseInt(contract.size),
    openInterest: parseInt(contract.open_interest),
    closePrice: parseFloat(contract.close_price),
  }));

  return apiSuccess({
    contracts,
    count: contracts.length,
    nextPageToken: response.next_page_token,
  });
});
