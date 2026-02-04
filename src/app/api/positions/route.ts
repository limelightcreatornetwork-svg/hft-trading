import { getPositions } from '@/lib/alpaca';
import { formatAlpacaPosition } from '@/lib/formatters';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(_request) {
  const positions = await getPositions();

  const formattedPositions = positions.map(formatAlpacaPosition);

  // Calculate totals
  const totals = {
    totalMarketValue: formattedPositions.reduce((sum, p) => sum + p.marketValue, 0),
    totalCostBasis: formattedPositions.reduce((sum, p) => sum + p.costBasis, 0),
    totalUnrealizedPL: formattedPositions.reduce((sum, p) => sum + p.unrealizedPL, 0),
    totalIntradayPL: formattedPositions.reduce((sum, p) => sum + p.unrealizedIntradayPL, 0),
  };

  return apiSuccess({
    positions: formattedPositions,
    totals,
    count: formattedPositions.length,
  });
});
