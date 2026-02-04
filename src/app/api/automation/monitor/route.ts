/**
 * GET /api/automation/monitor - Get monitoring status
 * POST /api/automation/monitor - Trigger monitoring check (checks all rules)
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';
import { monitorAndExecute, getActiveRules } from '@/lib/automation';
import { isMarketOpen } from '@/lib/alpaca';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Store last run timestamp in memory (in production, use Redis or similar)
let lastMonitorRun: Date | null = null;
let lastMonitorResult: Awaited<ReturnType<typeof monitorAndExecute>> | null = null;

export const GET = apiHandler(async function GET(_request) {
  const marketOpen = await isMarketOpen();
  const activeRules = await getActiveRules();

  return apiSuccess({
    marketOpen,
    activeRulesCount: activeRules.length,
    lastMonitorRun: lastMonitorRun?.toISOString() || null,
    lastResult: lastMonitorResult,
    rulesPreview: activeRules.slice(0, 5).map(r => ({
      id: r.id,
      symbol: r.symbol,
      ruleType: r.ruleType,
      triggerType: r.triggerType,
      triggerValue: r.triggerValue,
      currentPrice: r.currentPrice,
      distanceToTriggerPct: r.distanceToTriggerPct?.toFixed(2) + '%',
    })),
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is valid - all fields are optional
  }
  const force = body.force === true;

  // Check if market is open (unless forced)
  const marketOpen = await isMarketOpen();
  if (!marketOpen && !force) {
    return apiSuccess({
      skipped: true,
      reason: 'Market is closed',
      marketOpen: false,
    });
  }

  // Run the monitor
  const result = await monitorAndExecute();

  // Store for status endpoint
  lastMonitorRun = new Date();
  lastMonitorResult = result;

  return apiSuccess({
    ...result,
    marketOpen,
    timestamp: lastMonitorRun.toISOString(),
  });
});
