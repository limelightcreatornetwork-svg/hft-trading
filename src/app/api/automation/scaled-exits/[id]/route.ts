/**
 * Individual Scaled Exit Plan API Routes
 *
 * GET    - Get a specific plan
 * PATCH  - Update a plan
 * DELETE - Cancel a plan
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getScaledExitPlan,
  updateScaledExitPlan,
  cancelScaledExitPlan,
  getScaledExitHistory,
} from '@/lib/scaled-exits';
import { withAuth } from '@/lib/api-auth';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:scaled-exits');

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(async function GET(
  request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
    const { searchParams } = new URL(request.url);
    const history = searchParams.get('history') === 'true';

    if (history) {
      const historyData = await getScaledExitHistory(id);
      return NextResponse.json({
        success: true,
        data: historyData,
      });
    }

    const plan = getScaledExitPlan(id);

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    log.error('Failed to get scaled exit plan', serializeError(error));
    return NextResponse.json(
      { success: false, error: 'Failed to get scaled exit plan' },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async function PATCH(
  request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
    const body = await request.json();

    const { addTargets, removeTargetPercent, updateTrailing } = body;

    const updated = updateScaledExitPlan(id, {
      addTargets,
      removeTargetPercent,
      updateTrailing,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    log.error('Failed to update scaled exit plan', serializeError(error));
    return NextResponse.json(
      { success: false, error: 'Failed to update scaled exit plan' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(
  _request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;

    await cancelScaledExitPlan(id);

    return NextResponse.json({
      success: true,
      message: 'Scaled exit plan cancelled',
    });
  } catch (error) {
    log.error('Failed to cancel scaled exit plan', serializeError(error));
    return NextResponse.json(
      { success: false, error: 'Failed to cancel scaled exit plan' },
      { status: 500 }
    );
  }
});
