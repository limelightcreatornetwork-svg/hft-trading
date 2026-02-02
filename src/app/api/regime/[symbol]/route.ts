import { NextRequest, NextResponse } from 'next/server';
import { 
  createRegimeDetector, 
  MarketDataInput,
  RegimeResult,
  DEFAULT_REGIME_CONFIG 
} from '@/lib/regime';
import alpaca from '@/lib/alpaca';

// Cache regime results briefly to avoid excessive API calls
const regimeCache = new Map<string, { result: RegimeResult; timestamp: number }>();
const CACHE_TTL_MS = 1000; // 1 second cache

/**
 * Generate mock historical data for testing when market data unavailable
 */
function generateMockData(symbol: string): MarketDataInput {
  const now = new Date();
  const basePrice = 100 + Math.random() * 100;
  
  // Generate simple price series
  const prices: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  
  for (let i = 0; i < 30; i++) {
    const change = (Math.random() - 0.5) * 2;
    const price = basePrice + change * (i / 10);
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    
    prices.push(price);
    highs.push(high);
    lows.push(low);
    closes.push(price);
    volumes.push(100000 + Math.random() * 50000);
  }
  
  const currentPrice = closes[closes.length - 1];
  const spread = currentPrice * 0.001;
  
  return {
    symbol,
    timestamp: now,
    prices,
    highs,
    lows,
    closes,
    volumes,
    bid: currentPrice - spread / 2,
    ask: currentPrice + spread / 2,
    bidSize: 100,
    askSize: 100,
    currentSpread: spread,
    averageSpread: spread * 0.8,
    isHalted: false,
    hasGap: false,
    lastUpdateMs: 100,
  };
}

/**
 * Fetch real market data from Alpaca
 */
async function fetchMarketData(symbol: string): Promise<MarketDataInput> {
  try {
    // Try to get real quote data
    const quote = await alpaca.getLatestQuote(symbol);
    
    // For now, generate synthetic historical data
    // In production, you'd fetch bars from Alpaca's data API
    const mockData = generateMockData(symbol);
    
    // Override with real quote if available
    const bidPrice = typeof quote?.BidPrice === 'number' ? quote.BidPrice : mockData.bid;
    const askPrice = typeof quote?.AskPrice === 'number' ? quote.AskPrice : mockData.ask;
    
    return {
      ...mockData,
      bid: bidPrice,
      ask: askPrice,
      currentSpread: askPrice - bidPrice,
      lastUpdateMs: 100, // Assume fresh data
    };
  } catch (error) {
    console.warn(`Could not fetch real data for ${symbol}, using mock data:`, error);
    return generateMockData(symbol);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();
    
    // Check cache
    const cached = regimeCache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        ...cached.result,
        cached: true,
      });
    }
    
    // Fetch market data
    const marketData = await fetchMarketData(upperSymbol);
    
    // Create detector and classify
    const detector = createRegimeDetector();
    const result = detector.detect(marketData);
    
    // Cache result
    regimeCache.set(upperSymbol, {
      result,
      timestamp: Date.now(),
    });
    
    return NextResponse.json({
      ...result,
      cached: false,
    });
  } catch (error) {
    console.error('Regime detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect regime', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST allows custom market data input
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const body = await request.json();
    
    // Validate input
    const marketData: MarketDataInput = {
      symbol: symbol.toUpperCase(),
      timestamp: new Date(body.timestamp || Date.now()),
      prices: body.prices || [],
      highs: body.highs || [],
      lows: body.lows || [],
      closes: body.closes || [],
      volumes: body.volumes || [],
      bid: body.bid || 0,
      ask: body.ask || 0,
      bidSize: body.bidSize || 0,
      askSize: body.askSize || 0,
      currentSpread: body.currentSpread || 0,
      averageSpread: body.averageSpread || body.currentSpread || 0,
      isHalted: body.isHalted || false,
      hasGap: body.hasGap || false,
      gapSize: body.gapSize,
      lastUpdateMs: body.lastUpdateMs || 0,
    };
    
    // Custom config from request
    const config = body.config || {};
    
    const detector = createRegimeDetector(config);
    const result = detector.detect(marketData);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Regime detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect regime', details: String(error) },
      { status: 500 }
    );
  }
}
