import { NextRequest, NextResponse } from 'next/server';
import { activateKillSwitch, deactivateKillSwitch, isKillSwitchActive, getRiskConfig } from '@/lib/risk-engine';
import { cancelAllOrders, getOrders } from '@/lib/alpaca';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const config = await getRiskConfig();
    const active = isKillSwitchActive() || !config.tradingEnabled;

    return NextResponse.json({
      success: true,
      data: {
        active,
        tradingEnabled: config.tradingEnabled,
        message: active ? 'Kill switch is ACTIVE - trading disabled' : 'Kill switch is OFF - trading enabled',
      },
    });
  } catch (error) {
    console.error('Kill switch GET API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get kill switch status' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, cancelOrders = true } = body;

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    let cancelledOrders = 0;

    if (action === 'activate') {
      // Activate kill switch
      await activateKillSwitch();

      // Cancel all open orders if requested
      if (cancelOrders) {
        try {
          const openOrders = await getOrders('open');
          if (openOrders.length > 0) {
            const result = await cancelAllOrders();
            cancelledOrders = result.cancelled;
          }
        } catch (cancelError) {
          console.error('Error cancelling orders:', cancelError);
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          active: true,
          message: 'Kill switch ACTIVATED - trading disabled',
          cancelledOrders,
        },
      });
    } else {
      // Deactivate kill switch
      await deactivateKillSwitch();

      return NextResponse.json({
        success: true,
        data: {
          active: false,
          message: 'Kill switch DEACTIVATED - trading enabled',
        },
      });
    }
  } catch (error) {
    console.error('Kill switch POST API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to toggle kill switch' 
      },
      { status: 500 }
    );
  }
}
