/**
 * Strategy Collection API Routes
 *
 * GET  /api/strategies - List all strategies (optional ?type=&enabled= filters)
 * POST /api/strategies - Create a new strategy
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { createStrategy, listStrategies } from '@/lib/strategy-manager';
import { validateStrategyInput } from '@/lib/strategy-validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || undefined;
  const enabledParam = searchParams.get('enabled');
  const enabled = enabledParam === 'true' ? true : enabledParam === 'false' ? false : undefined;

  const strategies = await listStrategies({ type, enabled });
  return apiSuccess({ strategies, count: strategies.length });
});

export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const validated = validateStrategyInput(body);

  if (!validated.valid) {
    return apiError(validated.error, 400);
  }

  const strategy = await createStrategy(validated.value);
  return apiSuccess(strategy, 201);
});
