/**
 * Individual Trailing Stop API Routes
 *
 * PATCH  - Update a trailing stop
 * DELETE - Cancel a trailing stop
 */

import { NextRequest } from 'next/server';
import {
  updateTrailingStop,
  cancelTrailingStop,
} from '@/lib/trailing-stop';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<Record<string, string>> };

export const PATCH = apiHandler(async function PATCH(
  request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;
  const body = await request.json();

  const { trailPercent, trailAmount, activationPercent, enabled } = body;

  await updateTrailingStop(id, {
    trailPercent,
    trailAmount,
    activationPercent,
    enabled,
  });

  return apiSuccess({ message: 'Trailing stop updated' });
});

export const DELETE = apiHandler(async function DELETE(
  _request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;

  await cancelTrailingStop(id);

  return apiSuccess({ message: 'Trailing stop cancelled' });
});
