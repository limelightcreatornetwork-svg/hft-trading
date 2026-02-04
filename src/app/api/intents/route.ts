import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { checkIntent } from '@/lib/risk-engine';
import { submitOrder } from '@/lib/alpaca';
import { logAudit } from '@/lib/audit-log';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { createLogger, serializeError } from '@/lib/logger';
import {
  validateSymbol,
  validateSide,
  validateOrderType,
  validatePositiveNumber,
} from '@/lib/validation';

const log = createLogger('api:intents');

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
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

  return apiSuccess({
    intents,
    count: intents.length,
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { limitPrice, strategy, autoExecute = true } = body;

  // Validate required fields with proper type checking
  const symbolResult = validateSymbol(body.symbol);
  if (!symbolResult.valid) {
    return apiError(symbolResult.error as string, 400);
  }

  const sideResult = validateSide(body.side?.toLowerCase?.());
  if (!sideResult.valid) {
    return apiError(sideResult.error as string, 400);
  }

  const quantityResult = validatePositiveNumber(body.quantity, 'quantity', { integer: true });
  if (!quantityResult.valid) {
    return apiError(quantityResult.error as string, 400);
  }

  const orderTypeResult = validateOrderType(body.orderType?.toLowerCase?.());
  if (!orderTypeResult.valid) {
    return apiError(orderTypeResult.error as string, 400);
  }

  // Validate limitPrice is required for limit orders
  if (orderTypeResult.value === 'limit') {
    const limitPriceResult = validatePositiveNumber(limitPrice, 'limitPrice');
    if (!limitPriceResult.valid) {
      return apiError('limitPrice is required for limit orders', 400);
    }
  }

  const symbol = symbolResult.value;
  const side = sideResult.value;
  const quantity = quantityResult.value;
  const orderType = orderTypeResult.value;

  // Create intent record
  const intent = await prisma.intent.create({
    data: {
      symbol,
      side: side.toUpperCase(),
      quantity,
      orderType: orderType.toUpperCase(),
      limitPrice,
      strategy: strategy || 'manual',
      status: 'PENDING',
    },
  });

  // Run risk checks (side and orderType are already validated as lowercase)
  const riskResult = await checkIntent({
    symbol,
    side,
    quantity,
    orderType,
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

      // Audit log the order submission
      await logAudit({
        action: 'ORDER_SUBMITTED',
        orderId: order.id,
        symbol: order.symbol,
        intentId: intent.id,
        details: {
          side,
          quantity,
          orderType,
          limitPrice,
          strategy,
        },
      });
    } catch (orderError) {
      log.error('Order submission failed', { intentId: intent.id, symbol, ...serializeError(orderError) });
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

  return apiSuccess({
    intent: updatedIntent,
    riskCheck: {
      approved: riskResult.approved,
      reason: riskResult.reason,
      checks: riskResult.checks,
    },
    order: orderResult,
  });
});
