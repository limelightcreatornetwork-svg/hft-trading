/**
 * POST /api/options/positions/close
 * Close an options position by submitting an opposing order
 *
 * Body:
 * - symbol: string (option symbol like AAPL240119C00100000)
 * - quantity: number (contracts to close)
 * - currentSide: 'long' | 'short'
 * - orderType?: 'market' | 'limit' (default: market)
 * - limitPrice?: number (required if orderType is 'limit')
 */

import { NextRequest } from 'next/server';
import { closeOptionsPosition, parseOptionSymbol, getClosingSide } from '@/lib/alpaca-options';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { audit } from '@/lib/audit-log';
import { validatePositiveNumber } from '@/lib/validation';

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { symbol, quantity, currentSide, orderType = 'market', limitPrice } = body;

  // Validate symbol
  if (!symbol || typeof symbol !== 'string') {
    return apiError('Option symbol is required', 400);
  }

  const parsed = parseOptionSymbol(symbol);
  if (!parsed) {
    return apiError('Invalid option symbol format. Expected format: AAPL240119C00100000', 400);
  }

  // Validate quantity
  const quantityResult = validatePositiveNumber(quantity, 'quantity', { integer: true });
  if (!quantityResult.valid) {
    return apiError(quantityResult.error, 400);
  }

  // Validate current side
  if (!currentSide || !['long', 'short'].includes(currentSide)) {
    return apiError('currentSide must be "long" or "short"', 400);
  }

  // Validate order type
  if (orderType && !['market', 'limit'].includes(orderType)) {
    return apiError('orderType must be "market" or "limit"', 400);
  }

  // Validate limit price for limit orders
  if (orderType === 'limit') {
    if (!limitPrice || typeof limitPrice !== 'number' || limitPrice <= 0) {
      return apiError('Limit price required for limit orders', 400);
    }
  }

  // Close the position
  const order = await closeOptionsPosition({
    symbol: symbol.toUpperCase(),
    quantity: quantityResult.value,
    currentSide,
    orderType,
    limitPrice,
  });

  // Audit log the close
  const closingSide = getClosingSide(currentSide);
  await audit.orderSubmitted(order.id || 'unknown', symbol.toUpperCase(), {
    type: 'options_close',
    action: 'close_position',
    closingSide,
    originalSide: currentSide,
    quantity: quantityResult.value,
    orderType,
    limitPrice,
    underlying: parsed.rootSymbol,
    expiration: parsed.expirationDate,
    strike: parsed.strikePrice,
    optionType: parsed.type,
  });

  return apiSuccess({
    order,
    closingSide,
    parsed: {
      underlying: parsed.rootSymbol,
      expiration: parsed.expirationDate,
      type: parsed.type,
      strike: parsed.strikePrice,
    },
  });
});
