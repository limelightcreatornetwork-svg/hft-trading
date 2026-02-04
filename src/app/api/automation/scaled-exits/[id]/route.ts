/**
 * Individual Scaled Exit Plan API Routes
 *
 * GET    - Get a specific plan
 * PATCH  - Update a plan
 * DELETE - Cancel a plan
 */

import { NextRequest } from 'next/server';
import {
  getScaledExitPlan,
  updateScaledExitPlan,
  cancelScaledExitPlan,
  getScaledExitHistory,
} from '@/lib/scaled-exits';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = apiHandler(async function GET(
  request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;
  const { searchParams } = new URL(request.url);
  const history = searchParams.get('history') === 'true';

  if (history) {
    const historyData = await getScaledExitHistory(id);
    return apiSuccess(historyData);
  }

  const plan = getScaledExitPlan(id);

  if (!plan) {
    return apiError('Plan not found', 404);
  }

  return apiSuccess(plan);
});

export const PATCH = apiHandler(async function PATCH(
  request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;
  const body = await request.json();

  const { addTargets, removeTargetPercent, updateTrailing } = body;

  const updated = updateScaledExitPlan(id, {
    addTargets,
    removeTargetPercent,
    updateTrailing,
  });

  return apiSuccess(updated);
});

export const DELETE = apiHandler(async function DELETE(
  _request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;

  await cancelScaledExitPlan(id);

  return apiSuccess({ message: 'Scaled exit plan cancelled' });
});
