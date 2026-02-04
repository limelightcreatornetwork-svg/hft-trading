/**
 * Execute Single Strategy API
 *
 * POST /api/strategies/:id/execute - Run a specific strategy
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { executeSingleStrategy } from '@/lib/strategy-executor';

export const dynamic = 'force-dynamic';

export const POST = apiHandler(async function POST(
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const { id } = await context!.params;

  try {
    const results = await executeSingleStrategy(id);
    return apiSuccess({
      results,
      summary: {
        total: results.length,
        executed: results.filter(r => r.executed).length,
        skipped: results.filter(r => !r.executed).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed';
    return apiError(message, 400);
  }
});
