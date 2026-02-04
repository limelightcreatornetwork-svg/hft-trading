/**
 * Execute Single Strategy API
 *
 * POST /api/strategies/:id/execute - Run a specific strategy
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { executeSingleStrategy } from '@/lib/strategy-executor';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:strategies:execute');

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(async function POST(
  _request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
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
    log.error('Failed to execute strategy', serializeError(error));
    const message = error instanceof Error ? error.message : 'Execution failed';
    return apiError(message, 400);
  }
});
