/**
 * Individual Strategy API Routes
 *
 * GET    /api/strategies/:id - Get strategy by ID
 * PUT    /api/strategies/:id - Update strategy
 * DELETE /api/strategies/:id - Delete strategy
 * PATCH  /api/strategies/:id - Toggle enabled state
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getStrategy,
  updateStrategy,
  deleteStrategy,
  toggleStrategyEnabled,
} from '@/lib/strategy-manager';
import { validateStrategyUpdate } from '@/lib/strategy-validation';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:strategies');

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(async function GET(
  _request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
    const strategy = await getStrategy(id);

    if (!strategy) {
      return apiError('Strategy not found', 404);
    }

    return apiSuccess(strategy);
  } catch (error) {
    log.error('Failed to get strategy', serializeError(error));
    return apiError('Internal server error');
  }
});

export const PUT = withAuth(async function PUT(
  request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;

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
  } catch (error) {
    log.error('Failed to update strategy', serializeError(error));
    return apiError('Internal server error');
  }
});

export const DELETE = withAuth(async function DELETE(
  _request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;

    const existing = await getStrategy(id);
    if (!existing) {
      return apiError('Strategy not found', 404);
    }

    await deleteStrategy(id);
    return apiSuccess({ message: 'Strategy deleted' });
  } catch (error) {
    log.error('Failed to delete strategy', serializeError(error));
    return apiError('Internal server error');
  }
});

export const PATCH = withAuth(async function PATCH(
  _request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
    const strategy = await toggleStrategyEnabled(id);
    return apiSuccess(strategy);
  } catch (error) {
    log.error('Failed to toggle strategy', serializeError(error));
    return apiError('Strategy not found', 404);
  }
});
