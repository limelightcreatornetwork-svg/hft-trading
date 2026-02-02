import { NextRequest, NextResponse } from 'next/server';
import { getRegimeDetector, RegimeResult } from '@/lib/regime';

// In-memory regime history (for backtesting)
// In production, this would be stored in a database
const regimeHistory: Map<string, RegimeResult[]> = new Map();
const MAX_HISTORY_SIZE = 1000;

function addToHistory(result: RegimeResult) {
  const symbol = result.symbol;
  if (!regimeHistory.has(symbol)) {
    regimeHistory.set(symbol, []);
  }
  
  const history = regimeHistory.get(symbol)!;
  history.push(result);
  
  // Keep only the last MAX_HISTORY_SIZE entries
  if (history.length > MAX_HISTORY_SIZE) {
    history.shift();
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const historyMode = searchParams.get('history') === 'true';
    const historyLimit = parseInt(searchParams.get('limit') || '100', 10);
    
    // If requesting history, return stored data
    if (historyMode) {
      const history = regimeHistory.get(symbol) || [];
      const limitedHistory = history.slice(-Math.min(historyLimit, MAX_HISTORY_SIZE));
      
      return NextResponse.json({
        success: true,
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
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Regime detection error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to detect regime',
      },
      { status: 500 }
    );
  }
}

// POST endpoint for batch regime detection on multiple symbols
export async function POST(request: NextRequest) {
  try {
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
          return {
            symbol,
            error: error instanceof Error ? error.message : 'Detection failed',
          };
        }
      })
    );
    
    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Batch regime detection error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Batch detection failed',
      },
      { status: 500 }
    );
  }
}
