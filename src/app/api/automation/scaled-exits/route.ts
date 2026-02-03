/**
 * Scaled Exits API Routes
 * 
 * GET  - List active scaled exit plans
 * POST - Create a new scaled exit plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  createScaledExitPlan,
  getActiveScaledExitPlans,
  monitorScaledExits,
  ScaledExitPresets,
} from '@/lib/scaled-exits';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    const plans = getActiveScaledExitPlans(symbol || undefined);
    
    return NextResponse.json({
      success: true,
      data: {
        count: plans.length,
        plans,
      },
    });
  } catch (error) {
    console.error('GET scaled exits error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get scaled exits' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      symbol,
      entryPrice,
      totalQuantity,
      targets,
      trailingTakeProfit,
      preset, // Optional: 'conservative', 'balanced', 'aggressive', 'dayTrade'
    } = body;

    if (!symbol || !entryPrice || !totalQuantity) {
      return NextResponse.json(
        { success: false, error: 'Symbol, entryPrice, and totalQuantity are required' },
        { status: 400 }
      );
    }

    let plan;

    // Use preset if specified
    if (preset) {
      const presetFn = ScaledExitPresets[preset as keyof typeof ScaledExitPresets];
      if (!presetFn) {
        return NextResponse.json(
          { success: false, error: `Unknown preset: ${preset}. Valid: conservative, balanced, aggressive, dayTrade` },
          { status: 400 }
        );
      }
      plan = await presetFn(symbol, entryPrice, totalQuantity);
    } else {
      // Custom targets
      if (!targets || targets.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Targets are required (or use a preset)' },
          { status: 400 }
        );
      }

      plan = await createScaledExitPlan({
        symbol,
        entryPrice,
        totalQuantity,
        targets,
        trailingTakeProfit,
      });
    }

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error('POST scaled exit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create scaled exit plan' },
      { status: 500 }
    );
  }
});
