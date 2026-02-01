import { NextRequest, NextResponse } from 'next/server';
import { getRiskConfig, getRiskHeadroom, updateRiskConfig } from '@/lib/risk-engine';

export async function GET() {
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
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { maxPositionSize, maxOrderSize, maxDailyLoss, allowedSymbols, tradingEnabled } = body;

    const updatedConfig = await updateRiskConfig({
      maxPositionSize,
      maxOrderSize,
      maxDailyLoss,
      allowedSymbols,
      tradingEnabled,
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
}
