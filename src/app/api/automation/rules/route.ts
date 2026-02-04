/**
 * GET /api/automation/rules - Get automation rules
 * POST /api/automation/rules - Create a new automation rule
 * DELETE /api/automation/rules?id=xxx - Cancel a rule
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
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

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const includeAll = searchParams.get('all') === 'true';

  const rules = includeAll
    ? await getAllRules()
    : await getActiveRules(symbol || undefined);

  return apiSuccess({ rules, count: rules.length });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { ruleType, ...params } = body;

  // Validate required fields
  if (!ruleType) {
    return apiError('ruleType is required', 400);
  }

  let result;

  switch (ruleType) {
    case 'STOP_LOSS':
      if (!params.symbol || params.stopLossAmount === undefined || !params.entryPrice) {
        return apiError('symbol, stopLossAmount, and entryPrice are required for stop loss', 400);
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
        return apiError('symbol, takeProfitAmount, and entryPrice are required for take profit', 400);
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
        return apiError('symbol, quantity, targetPrice, and orderSide are required for limit order', 400);
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
        return apiError('symbol, quantity, entryPrice, stopLossPrice, and takeProfitPrice are required for OCO', 400);
      }
      const ocoResult = await createOCORule({
        symbol: params.symbol,
        quantity: params.quantity,
        entryPrice: params.entryPrice,
        stopLossPrice: params.stopLossPrice,
        takeProfitPrice: params.takeProfitPrice,
      });
      return apiSuccess({
        stopLoss: ocoResult.stopLoss,
        takeProfit: ocoResult.takeProfit,
        ocoGroupId: ocoResult.ocoGroupId,
      });

    case 'CUSTOM':
      // Generic rule creation
      if (!params.symbol || !params.triggerType || params.triggerValue === undefined ||
          !params.orderSide || !params.orderType) {
        return apiError('symbol, triggerType, triggerValue, orderSide, and orderType are required', 400);
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
      return apiError(`Unknown ruleType: ${ruleType}`, 400);
  }

  return apiSuccess(result);
});

export const DELETE = apiHandler(async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ruleId = searchParams.get('id');

  if (!ruleId) {
    return apiError('Rule ID is required', 400);
  }

  await cancelRule(ruleId);

  return apiSuccess({ message: `Rule ${ruleId} cancelled` });
});

export const PATCH = apiHandler(async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { ruleId, enabled } = body;

  if (!ruleId || enabled === undefined) {
    return apiError('ruleId and enabled are required', 400);
  }

  await toggleRule(ruleId, enabled);

  return apiSuccess({ message: `Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}` });
});
