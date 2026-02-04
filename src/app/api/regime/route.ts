import { NextRequest } from 'next/server';
import { getRegimeDetector, AlpacaRegimeResult } from '@/lib/regime';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:regime');

// In-memory regime history (for backtesting)
// In production, this would be stored in a database
const regimeHistory: Map<string, AlpacaRegimeResult[]> = new Map();
const MAX_HISTORY_SIZE = 1000;

function addToHistory(result: AlpacaRegimeResult) {
  const symbol = result.symbol;
  if (!regimeHistory.has(symbol)) {
    regimeHistory.set(symbol, []);
  }

  const history = regimeHistory.get(symbol);
  if (history) {
    history.push(result);

    // Keep only the last MAX_HISTORY_SIZE entries
    if (history.length > MAX_HISTORY_SIZE) {
      history.shift();
    }
  }
}

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'SPY';
  const historyMode = searchParams.get('history') === 'true';
  const historyLimit = parseInt(searchParams.get('limit') || '100', 10);

  // If requesting history, return stored data
  if (historyMode) {
    const history = regimeHistory.get(symbol) || [];
    const limitedHistory = history.slice(-Math.min(historyLimit, MAX_HISTORY_SIZE));

    return apiSuccess({
      symbol,
      count: limitedHistory.length,
      history: limitedHistory,
    });
  }

  // Otherwise, detect current regime
  const detector = getRegimeDetector(symbol);
  const result = await detector.detect();

  // Store in history
  addToHistory(result);

  return apiSuccess(result);
});

// POST endpoint for batch regime detection on multiple symbols
export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const symbols: string[] = body.symbols || ['SPY'];

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const detector = getRegimeDetector(symbol);
        const result = await detector.detect();
        addToHistory(result);
        return result;
      } catch (error) {
        log.error('Regime detection failed', { symbol, ...serializeError(error) });
        return {
          symbol,
          error: 'Detection failed',
        };
      }
    })
  );

  return apiSuccess({ results });
});
