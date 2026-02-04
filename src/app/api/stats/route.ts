/**
 * GET /api/stats - Get trading statistics
 */

import { getTradingStats } from '@/lib/trade-manager';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';

export const GET = apiHandler(async function GET(_request) {
  const stats = await getTradingStats();
  return apiSuccess({ stats });
});
