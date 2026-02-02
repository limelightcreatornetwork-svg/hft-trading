import { NextRequest, NextResponse } from 'next/server';
import { getRiskConfig, getRiskHeadroom, updateRiskConfig } from '@/lib/risk-engine';
import { withAuth } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';
import { validatePositiveNumber, validateSymbol } from '@/lib/validation';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET() {
  try {
    const config = await getRiskConfig();
    const headroom = await getRiskHeadroom();

    return NextResponse.json({
      success: true,
      data: {
        config,
        headroom,
        status: headroom.tradingEnabled ? 'ACTIVE' : 'DISABLED',
      },
    });
  } catch (error) {
    console.error('Risk GET API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch risk config'
      },
      { status: 500 }
    );
  }
});

export const PUT = withAuth(async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate optional numeric fields if provided
    let maxPositionSize = body.maxPositionSize;
    let maxOrderSize = body.maxOrderSize;
    let maxDailyLoss = body.maxDailyLoss;
    const allowedSymbols = body.allowedSymbols;
    const tradingEnabled = body.tradingEnabled;

    if (maxPositionSize !== undefined) {
      const result = validatePositiveNumber(maxPositionSize, 'maxPositionSize', { integer: true });
      if (!result.valid) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      maxPositionSize = result.value;
    }

    if (maxOrderSize !== undefined) {
      const result = validatePositiveNumber(maxOrderSize, 'maxOrderSize', { integer: true });
      if (!result.valid) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      maxOrderSize = result.value;
    }

    if (maxDailyLoss !== undefined) {
      const result = validatePositiveNumber(maxDailyLoss, 'maxDailyLoss');
      if (!result.valid) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      maxDailyLoss = result.value;
    }

    // Validate allowedSymbols if provided
    if (allowedSymbols !== undefined) {
      if (!Array.isArray(allowedSymbols)) {
        return NextResponse.json(
          { success: false, error: 'allowedSymbols must be an array' },
          { status: 400 }
        );
      }
      for (const symbol of allowedSymbols) {
        const result = validateSymbol(symbol);
        if (!result.valid) {
          return NextResponse.json(
            { success: false, error: `Invalid symbol in allowedSymbols: ${result.error}` },
            { status: 400 }
          );
        }
      }
    }

    // Validate tradingEnabled if provided
    if (tradingEnabled !== undefined && typeof tradingEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'tradingEnabled must be a boolean' },
        { status: 400 }
      );
    }

    const updatedConfig = await updateRiskConfig({
      maxPositionSize,
      maxOrderSize,
      maxDailyLoss,
      allowedSymbols,
      tradingEnabled,
    });

    // Log the risk config change
    await logAudit({
      action: 'CONFIG_CHANGED',
      details: {
        configType: 'risk',
        changes: {
          maxPositionSize,
          maxOrderSize,
          maxDailyLoss,
          allowedSymbols,
          tradingEnabled,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        config: updatedConfig,
      },
    });
  } catch (error) {
    console.error('Risk PUT API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update risk config'
      },
      { status: 500 }
    );
  }
});
