/**
 * Scaled Exits API Routes
 *
 * GET  - List active scaled exit plans
 * POST - Create a new scaled exit plan
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  createScaledExitPlan,
  getActiveScaledExitPlans,
  ScaledExitPresets,
} from '@/lib/scaled-exits';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  const plans = getActiveScaledExitPlans(symbol || undefined);

  return apiSuccess({
    count: plans.length,
    plans,
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
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
    return apiError('Symbol, entryPrice, and totalQuantity are required', 400);
  }

  let plan;

  // Use preset if specified
  if (preset) {
    const presetFn = ScaledExitPresets[preset as keyof typeof ScaledExitPresets];
    if (!presetFn) {
      return apiError(`Unknown preset: ${preset}. Valid: conservative, balanced, aggressive, dayTrade`, 400);
    }
    plan = await presetFn(symbol, entryPrice, totalQuantity);
  } else {
    // Custom targets
    if (!targets || targets.length === 0) {
      return apiError('Targets are required (or use a preset)', 400);
    }

    plan = await createScaledExitPlan({
      symbol,
      entryPrice,
      totalQuantity,
      targets,
      trailingTakeProfit,
    });
  }

  return apiSuccess(plan);
});
