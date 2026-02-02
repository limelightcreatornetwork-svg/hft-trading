import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkIntent } from '@/lib/risk-engine';
import { submitOrder } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    const where = status ? { status } : {};

    const intents = await prisma.intent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        riskChecks: true,
        orders: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        intents,
        count: intents.length,
      },
    });
  } catch (error) {
    console.error('Intents GET API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch intents' 
      },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, side, quantity, orderType, limitPrice, strategy, autoExecute = true } = body;

    // Validate required fields
    if (!symbol || !side || !quantity || !orderType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, side, quantity, orderType' },
        { status: 400 }
      );
    }

    // Create intent record
    const intent = await prisma.intent.create({
      data: {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        quantity,
        orderType: orderType.toUpperCase(),
        limitPrice,
        strategy: strategy || 'manual',
        status: 'PENDING',
      },
    });

    // Run risk checks
    const riskResult = await checkIntent({
      symbol,
      side: side.toLowerCase(),
      quantity,
      orderType: orderType.toLowerCase() as 'market' | 'limit',
      limitPrice,
      strategy: strategy || 'manual',
    });

    // Store risk check results
    for (const check of riskResult.checks) {
      await prisma.riskCheck.create({
        data: {
          intentId: intent.id,
          checkName: check.name,
          passed: check.passed,
          details: check.details,
        },
      });
    }

    // Update intent status based on risk check
    const newStatus = riskResult.approved ? 'APPROVED' : 'REJECTED';
    await prisma.intent.update({
      where: { id: intent.id },
      data: { status: newStatus },
    });

    // If approved and autoExecute, submit to broker
    let orderResult = null;
    if (riskResult.approved && autoExecute) {
      try {
        const order = await submitOrder({
          symbol: symbol.toUpperCase(),
          qty: quantity,
          side: side.toLowerCase() as 'buy' | 'sell',
          type: orderType.toLowerCase() as 'market' | 'limit',
          time_in_force: 'day',
          limit_price: limitPrice,
        });

        // Create order record
        await prisma.order.create({
          data: {
            intentId: intent.id,
            brokerOrderId: order.id,
            symbol: order.symbol,
            side: order.side.toUpperCase(),
            quantity: parseInt(order.qty),
            orderType: order.type.toUpperCase(),
            limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
            status: 'SUBMITTED',
          },
        });

        // Update intent to EXECUTED
        await prisma.intent.update({
          where: { id: intent.id },
          data: { status: 'EXECUTED' },
        });

        orderResult = {
          id: order.id,
          status: order.status,
          submittedAt: order.submitted_at,
        };
      } catch (orderError) {
        console.error('Order submission error:', orderError);
        // Mark as approved but not executed
        await prisma.intent.update({
          where: { id: intent.id },
          data: { status: 'APPROVED' },
        });
      }
    }

    // Fetch updated intent with relations
    const updatedIntent = await prisma.intent.findUnique({
      where: { id: intent.id },
      include: {
        riskChecks: true,
        orders: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        intent: updatedIntent,
        riskCheck: {
          approved: riskResult.approved,
          reason: riskResult.reason,
          checks: riskResult.checks,
        },
        order: orderResult,
      },
    });
  } catch (error) {
    console.error('Intents POST API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create intent'
      },
      { status: 500 }
    );
  }
});
