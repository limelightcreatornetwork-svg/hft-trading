/**
 * Execute All Strategies API
 *
 * POST /api/strategies/execute - Run all enabled strategies
 */

import { apiHandler, apiSuccess } from '@/lib/api-helpers';
import { executeStrategies } from '@/lib/strategy-executor';

export const dynamic = 'force-dynamic';

export const POST = apiHandler(async () => {
  const results = await executeStrategies();
  return apiSuccess({
    results,
    summary: {
      total: results.length,
      executed: results.filter(r => r.executed).length,
      skipped: results.filter(r => !r.executed).length,
    },
  });
});
