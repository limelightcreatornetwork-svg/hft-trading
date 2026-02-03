/**
 * Individual Scaled Exit Plan API Routes
 * 
 * GET    - Get a specific plan
 * PATCH  - Update a plan
 * DELETE - Cancel a plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  getScaledExitPlan,
  updateScaledExitPlan,
  cancelScaledExitPlan,
  getScaledExitHistory,
} from '@/lib/scaled-exits';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth(async function GET(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
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
    console.error('GET scaled exit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get scaled exit plan' },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async function PATCH(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
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
    console.error('PATCH scaled exit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update scaled exit plan' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;

    await cancelScaledExitPlan(id);

    return NextResponse.json({
      success: true,
      message: 'Scaled exit plan cancelled',
    });
  } catch (error) {
    console.error('DELETE scaled exit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to cancel scaled exit plan' },
      { status: 500 }
    );
  }
});
