/**
 * Individual Strategy API Routes
 *
 * GET    /api/strategies/:id - Get strategy by ID
 * PUT    /api/strategies/:id - Update strategy
 * DELETE /api/strategies/:id - Delete strategy
 * PATCH  /api/strategies/:id - Toggle enabled state
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getStrategy,
  updateStrategy,
  deleteStrategy,
  toggleStrategyEnabled,
} from '@/lib/strategy-manager';
import { validateStrategyUpdate } from '@/lib/strategy-validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async function GET(
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const { id } = await context!.params;
  const strategy = await getStrategy(id);

  if (!strategy) {
    return apiError('Strategy not found', 404);
  }

  return apiSuccess(strategy);
});

export const PUT = apiHandler(async function PUT(
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const { id } = await context!.params;

  const existing = await getStrategy(id);
  if (!existing) {
    return apiError('Strategy not found', 404);
  }

  const body = await request.json();
  const validated = validateStrategyUpdate(body);

  if (!validated.valid) {
    return apiError(validated.error, 400);
  }

  const strategy = await updateStrategy(id, validated.value);
  return apiSuccess(strategy);
});

export const DELETE = apiHandler(async function DELETE(
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const { id } = await context!.params;

  const existing = await getStrategy(id);
  if (!existing) {
    return apiError('Strategy not found', 404);
  }

  await deleteStrategy(id);
  return apiSuccess({ message: 'Strategy deleted' });
});

export const PATCH = apiHandler(async function PATCH(
  _request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const { id } = await context!.params;

  try {
    const strategy = await toggleStrategyEnabled(id);
    return apiSuccess(strategy);
  } catch {
    return apiError('Strategy not found', 404);
  }
});
