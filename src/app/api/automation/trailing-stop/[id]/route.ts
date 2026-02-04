/**
 * Individual Trailing Stop API Routes
 *
 * PATCH  - Update a trailing stop
 * DELETE - Cancel a trailing stop
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateTrailingStop,
  cancelTrailingStop,
} from '@/lib/trailing-stop';
import { withAuth } from '@/lib/api-auth';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:trailing-stop');

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async function PATCH(
  request: NextRequest,
  context?: Record<string, unknown>
) {
  try {
    const { id } = await (context as unknown as RouteContext).params;
    const body = await request.json();

    const { trailPercent, trailAmount, activationPercent, enabled } = body;

    await updateTrailingStop(id, {
      trailPercent,
      trailAmount,
      activationPercent,
      enabled,
    });

    return NextResponse.json({
      success: true,
      message: 'Trailing stop updated',
    });
  } catch (error) {
    log.error('Failed to update trailing stop', serializeError(error));
    return NextResponse.json(
      { success: false, error: 'Failed to update trailing stop' },
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

    await cancelTrailingStop(id);

    return NextResponse.json({
      success: true,
      message: 'Trailing stop cancelled',
    });
  } catch (error) {
    log.error('Failed to cancel trailing stop', serializeError(error));
    return NextResponse.json(
      { success: false, error: 'Failed to cancel trailing stop' },
      { status: 500 }
    );
  }
});
