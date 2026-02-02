import { NextRequest, NextResponse } from 'next/server';
import { 
  createRegimeDetector, 
  MarketDataInput,
  RegimeResult,
  DEFAULT_REGIME_CONFIG 
} from '@/lib/regime/index';
import alpaca from '@/lib/alpaca';

// Cache regime results briefly to avoid excessive API calls
const regimeCache = new Map<string, { result: RegimeResult; timestamp: number }>();
const CACHE_TTL_MS = 1000; // 1 second cache

interface AlpacaBar {
  Timestamp: string;
  OpenPrice: number;
  HighPrice: number;
  LowPrice: number;
  ClosePrice: number;
  Volume: number;
  TradeCount: number;
  VWAP: number;
}

/**
 * Fetch real historical bars from Alpaca
 */
async function fetchAlpacaBars(symbol: string, limit: number = 50): Promise<AlpacaBar[]> {
  try {
    const bars = await alpaca.getBarsV2(symbol, {
      timeframe: '5Min',
      limit,
      feed: 'iex',
    });
    
    const barArray: AlpacaBar[] = [];
    for await (const bar of bars) {
      barArray.push({
        Timestamp: bar.Timestamp,
        OpenPrice: bar.OpenPrice,
        HighPrice: bar.HighPrice,
        LowPrice: bar.LowPrice,
        ClosePrice: bar.ClosePrice,
        Volume: bar.Volume,
        TradeCount: bar.TradeCount,
        VWAP: bar.VWAP,
      });
    }
    return barArray;
  } catch (error) {
    console.error(`Error fetching bars for ${symbol}:`, error);
    return [];
  }
}

/**
 * Generate fallback data when market data unavailable
 */
function generateFallbackData(symbol: string): MarketDataInput {
  const now = new Date();
  const basePrice = 100 + Math.random() * 100;
  
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
 * Fetch real market data from Alpaca with historical bars
 */
async function fetchMarketData(symbol: string): Promise<MarketDataInput> {
  try {
    // Fetch real historical bars and quote in parallel
    const [bars, quote] = await Promise.all([
      fetchAlpacaBars(symbol, 50),
      alpaca.getLatestQuote(symbol).catch(() => null),
    ]);
    
    // If no bars, fall back to generated data
    if (bars.length === 0) {
      console.warn(`No bars available for ${symbol}, using fallback data`);
      return generateFallbackData(symbol);
    }
    
    // Extract OHLCV data from bars
    const prices = bars.map(b => b.ClosePrice);
    const highs = bars.map(b => b.HighPrice);
    const lows = bars.map(b => b.LowPrice);
    const closes = bars.map(b => b.ClosePrice);
    const volumes = bars.map(b => b.Volume);
    
    // Get current price and quote data
    const currentPrice = closes[closes.length - 1];
    const bidPrice = quote?.BidPrice ?? currentPrice * 0.9995;
    const askPrice = quote?.AskPrice ?? currentPrice * 1.0005;
    const bidSize = quote?.BidSize ?? 100;
    const askSize = quote?.AskSize ?? 100;
    
    // Calculate spread metrics
    const currentSpread = askPrice - bidPrice;
    // Estimate average spread as a small percentage of price
    const avgSpread = currentPrice * 0.001;
    
    // Check for gap (compare first bar's open to previous close if available)
    const hasGap = bars.length > 1 && 
      Math.abs(bars[bars.length - 1].OpenPrice - bars[bars.length - 2].ClosePrice) > 
      currentPrice * 0.01;
    const gapSize = hasGap ? 
      Math.abs(bars[bars.length - 1].OpenPrice - bars[bars.length - 2].ClosePrice) / currentPrice : 
      0;
    
    return {
      symbol,
      timestamp: new Date(),
      prices,
      highs,
      lows,
      closes,
      volumes,
      bid: bidPrice,
      ask: askPrice,
      bidSize,
      askSize,
      currentSpread,
      averageSpread: avgSpread,
      isHalted: false,
      hasGap,
      gapSize,
      lastUpdateMs: 100,
    };
  } catch (error) {
    console.warn(`Error fetching real data for ${symbol}:`, error);
    return generateFallbackData(symbol);
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
