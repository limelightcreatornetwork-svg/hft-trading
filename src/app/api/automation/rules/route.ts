/**
 * GET /api/automation/rules - Get automation rules
 * POST /api/automation/rules - Create a new automation rule
 * DELETE /api/automation/rules?id=xxx - Cancel a rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  getActiveRules,
  getAllRules,
  createAutomationRule,
  createStopLossRule,
  createTakeProfitRule,
  createLimitOrderRule,
  createOCORule,
  cancelRule,
  toggleRule,
  TriggerType,
} from '@/lib/automation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const includeAll = searchParams.get('all') === 'true';

    const rules = includeAll 
      ? await getAllRules()
      : await getActiveRules(symbol || undefined);

    return NextResponse.json({
      success: true,
      data: { rules, count: rules.length },
    });
  } catch (error) {
    console.error('Automation rules GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rules' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ruleType, ...params } = body;

    // Validate required fields
    if (!ruleType) {
      return NextResponse.json(
        { success: false, error: 'ruleType is required' },
        { status: 400 }
      );
    }

    let result;

    switch (ruleType) {
      case 'STOP_LOSS':
        if (!params.symbol || params.stopLossAmount === undefined || !params.entryPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, stopLossAmount, and entryPrice are required for stop loss' },
            { status: 400 }
          );
        }
        result = await createStopLossRule({
          symbol: params.symbol,
          quantity: params.quantity,
          entryPrice: params.entryPrice,
          stopLossAmount: params.stopLossAmount,
          isPercent: params.isPercent ?? true,
          positionSide: params.positionSide ?? 'long',
        });
        break;

      case 'TAKE_PROFIT':
        if (!params.symbol || params.takeProfitAmount === undefined || !params.entryPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, takeProfitAmount, and entryPrice are required for take profit' },
            { status: 400 }
          );
        }
        result = await createTakeProfitRule({
          symbol: params.symbol,
          quantity: params.quantity,
          entryPrice: params.entryPrice,
          takeProfitAmount: params.takeProfitAmount,
          isPercent: params.isPercent ?? true,
          positionSide: params.positionSide ?? 'long',
        });
        break;

      case 'LIMIT_ORDER':
        if (!params.symbol || !params.quantity || !params.targetPrice || !params.orderSide) {
          return NextResponse.json(
            { success: false, error: 'symbol, quantity, targetPrice, and orderSide are required for limit order' },
            { status: 400 }
          );
        }
        result = await createLimitOrderRule({
          symbol: params.symbol,
          quantity: params.quantity,
          targetPrice: params.targetPrice,
          orderSide: params.orderSide,
          limitPrice: params.limitPrice,
        });
        break;

      case 'OCO':
        if (!params.symbol || !params.quantity || !params.entryPrice || 
            !params.stopLossPrice || !params.takeProfitPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, quantity, entryPrice, stopLossPrice, and takeProfitPrice are required for OCO' },
            { status: 400 }
          );
        }
        const ocoResult = await createOCORule({
          symbol: params.symbol,
          quantity: params.quantity,
          entryPrice: params.entryPrice,
          stopLossPrice: params.stopLossPrice,
          takeProfitPrice: params.takeProfitPrice,
        });
        return NextResponse.json({
          success: true,
          data: {
            stopLoss: ocoResult.stopLoss,
            takeProfit: ocoResult.takeProfit,
            ocoGroupId: ocoResult.ocoGroupId,
          },
        });

      case 'CUSTOM':
        // Generic rule creation
        if (!params.symbol || !params.triggerType || params.triggerValue === undefined ||
            !params.orderSide || !params.orderType) {
          return NextResponse.json(
            { success: false, error: 'symbol, triggerType, triggerValue, orderSide, and orderType are required' },
            { status: 400 }
          );
        }
        result = await createAutomationRule({
          symbol: params.symbol,
          name: params.name || `Custom Rule - ${params.symbol}`,
          ruleType: params.customRuleType || 'LIMIT_ORDER',
          triggerType: params.triggerType as TriggerType,
          triggerValue: params.triggerValue,
          orderSide: params.orderSide,
          orderType: params.orderType,
          quantity: params.quantity,
          limitPrice: params.limitPrice,
          entryPrice: params.entryPrice,
          expiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
        });
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown ruleType: ${ruleType}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Automation rules POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create rule' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: 'Rule ID is required' },
        { status: 400 }
      );
    }

    await cancelRule(ruleId);

    return NextResponse.json({
      success: true,
      message: `Rule ${ruleId} cancelled`,
    });
  } catch (error) {
    console.error('Automation rules DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel rule' },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ruleId, enabled } = body;

    if (!ruleId || enabled === undefined) {
      return NextResponse.json(
        { success: false, error: 'ruleId and enabled are required' },
        { status: 400 }
      );
    }

    await toggleRule(ruleId, enabled);

    return NextResponse.json({
      success: true,
      message: `Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('Automation rules PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle rule' },
      { status: 500 }
    );
  }
});
