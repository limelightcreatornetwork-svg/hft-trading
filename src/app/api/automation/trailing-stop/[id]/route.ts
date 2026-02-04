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

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
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
    console.error('PATCH trailing stop error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update trailing stop' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    await cancelTrailingStop(id);

    return NextResponse.json({
      success: true,
      message: 'Trailing stop cancelled',
    });
  } catch (error) {
    console.error('DELETE trailing stop error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel trailing stop' },
      { status: 500 }
    );
  }
}
