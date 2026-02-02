/**
 * GET /api/automation/monitor - Get monitoring status
 * POST /api/automation/monitor - Trigger monitoring check (checks all rules)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { monitorAndExecute, getActiveRules } from '@/lib/automation';
import { isMarketOpen } from '@/lib/alpaca';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Store last run timestamp in memory (in production, use Redis or similar)
let lastMonitorRun: Date | null = null;
let lastMonitorResult: Awaited<ReturnType<typeof monitorAndExecute>> | null = null;

export const GET = withAuth(async function GET() {
  try {
    const marketOpen = await isMarketOpen();
    const activeRules = await getActiveRules();

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('Monitor GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get monitor status' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Check if market is open (unless forced)
    const marketOpen = await isMarketOpen();
    if (!marketOpen && !force) {
      return NextResponse.json({
        success: true,
        data: {
          skipped: true,
          reason: 'Market is closed',
          marketOpen: false,
        },
      });
    }

    // Run the monitor
    const result = await monitorAndExecute();
    
    // Store for status endpoint
    lastMonitorRun = new Date();
    lastMonitorResult = result;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        marketOpen,
        timestamp: lastMonitorRun.toISOString(),
      },
    });
  } catch (error) {
    console.error('Monitor POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to run monitor' },
      { status: 500 }
    );
  }
});
