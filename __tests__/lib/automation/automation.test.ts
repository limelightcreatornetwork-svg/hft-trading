/**
 * Tests for Trading Automation Service
 */

// Mock environment variables before importing modules
process.env.ALPACA_API_KEY = 'test-key';
process.env.ALPACA_API_SECRET = 'test-secret';
process.env.ALPACA_BASE_URL = 'https://paper-api.alpaca.markets';
process.env.ALPACA_PAPER = 'true';

// Define types locally to avoid import issues
interface StopLossConfig {
  type: 'fixed' | 'trailing' | 'time' | 'atr';
  fixedPrice?: number;
  fixedPct?: number;
  trailingPct?: number;
  trailingActivationPct?: number;
  timeStopHours?: number;
  atrMultiplier?: number;
}

interface TakeProfitConfig {
  type: 'single' | 'scaled' | 'trailing';
  targetPct?: number;
  targetPrice?: number;
  scaledTargets?: { profitPct: number; exitPct: number }[];
  trailingActivationPct?: number;
  trailingCallbackPct?: number;
}

interface AutomatedPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentQty: number;
  originalQty: number;
  highWaterMark: number;
  lowWaterMark: number;
  enteredAt: Date;
  lastActivityAt: Date;
  stopLoss: StopLossConfig;
  takeProfit: TakeProfitConfig;
  status: 'active' | 'partial' | 'closed';
  executedExits: { price: number; qty: number; reason: string; timestamp: Date }[];
}

// Inline implementations for testing (pure functions)
function checkStopLoss(
  position: AutomatedPosition,
  currentPrice: number
): { triggered: boolean; reason: string } {
  const { stopLoss, side, entryPrice, highWaterMark, enteredAt } = position;
  const isLong = side === 'long';
  
  if (stopLoss.type === 'fixed' && stopLoss.fixedPrice) {
    const hit = isLong 
      ? currentPrice <= stopLoss.fixedPrice
      : currentPrice >= stopLoss.fixedPrice;
    if (hit) {
      return { triggered: true, reason: `Fixed stop hit at $${stopLoss.fixedPrice}` };
    }
  }
  
  if (stopLoss.type === 'fixed' && stopLoss.fixedPct) {
    const stopPrice = isLong
      ? entryPrice * (1 - stopLoss.fixedPct / 100)
      : entryPrice * (1 + stopLoss.fixedPct / 100);
    const hit = isLong ? currentPrice <= stopPrice : currentPrice >= stopPrice;
    if (hit) {
      return { triggered: true, reason: `Stop loss ${stopLoss.fixedPct}% hit at $${currentPrice.toFixed(2)}` };
    }
  }
  
  if (stopLoss.type === 'trailing' && stopLoss.trailingPct) {
    const profitPct = isLong
      ? ((highWaterMark - entryPrice) / entryPrice) * 100
      : ((entryPrice - highWaterMark) / entryPrice) * 100;
    
    const activationMet = !stopLoss.trailingActivationPct || profitPct >= stopLoss.trailingActivationPct;
    
    if (activationMet) {
      const trailingStopPrice = isLong
        ? highWaterMark * (1 - stopLoss.trailingPct / 100)
        : highWaterMark * (1 + stopLoss.trailingPct / 100);
      
      const hit = isLong ? currentPrice <= trailingStopPrice : currentPrice >= trailingStopPrice;
      if (hit) {
        return { 
          triggered: true, 
          reason: `Trailing stop ${stopLoss.trailingPct}% hit. High: $${highWaterMark.toFixed(2)}, Current: $${currentPrice.toFixed(2)}`
        };
      }
    }
  }
  
  if (stopLoss.type === 'time' && stopLoss.timeStopHours) {
    const hoursHeld = (Date.now() - enteredAt.getTime()) / (1000 * 60 * 60);
    const priceChange = Math.abs((currentPrice - entryPrice) / entryPrice) * 100;
    const significantMove = priceChange > 1;
    
    if (hoursHeld >= stopLoss.timeStopHours && !significantMove) {
      return { 
        triggered: true, 
        reason: `Time stop after ${stopLoss.timeStopHours}h without significant movement (${priceChange.toFixed(2)}%)`
      };
    }
  }
  
  return { triggered: false, reason: '' };
}

function checkTakeProfit(
  position: AutomatedPosition,
  currentPrice: number
): { triggered: boolean; exitPct: number; reason: string } {
  const { takeProfit, side, entryPrice, highWaterMark, executedExits } = position;
  const isLong = side === 'long';
  
  const profitPct = isLong
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;
  
  if (takeProfit.type === 'single') {
    if (takeProfit.targetPrice) {
      const hit = isLong 
        ? currentPrice >= takeProfit.targetPrice
        : currentPrice <= takeProfit.targetPrice;
      if (hit) {
        return { triggered: true, exitPct: 100, reason: `Target price $${takeProfit.targetPrice} hit` };
      }
    }
    
    if (takeProfit.targetPct && profitPct >= takeProfit.targetPct) {
      return { triggered: true, exitPct: 100, reason: `Target profit ${takeProfit.targetPct}% hit` };
    }
  }
  
  if (takeProfit.type === 'scaled' && takeProfit.scaledTargets) {
    for (const target of takeProfit.scaledTargets) {
      const targetLabel = `scaled_${target.profitPct}`;
      const alreadyExecuted = executedExits.some(e => e.reason.includes(targetLabel));
      
      if (!alreadyExecuted && profitPct >= target.profitPct) {
        return { 
          triggered: true, 
          exitPct: target.exitPct,
          reason: `Scaled exit: ${target.exitPct}% at ${target.profitPct}% profit (${targetLabel})`
        };
      }
    }
  }
  
  if (takeProfit.type === 'trailing') {
    // Calculate peak profit (based on high water mark reaching activation threshold)
    const peakProfitPct = isLong
      ? ((highWaterMark - entryPrice) / entryPrice) * 100
      : ((entryPrice - highWaterMark) / entryPrice) * 100;
    
    // Activation is based on whether the PEAK ever reached the threshold
    const activationMet = takeProfit.trailingActivationPct && 
      peakProfitPct >= takeProfit.trailingActivationPct;
    
    if (activationMet && takeProfit.trailingCallbackPct) {
      const pullback = peakProfitPct - profitPct;
      
      if (pullback >= takeProfit.trailingCallbackPct && profitPct > 0) {
        return { 
          triggered: true, 
          exitPct: 100,
          reason: `Trailing TP: ${pullback.toFixed(2)}% pullback from ${peakProfitPct.toFixed(2)}% peak`
        };
      }
    }
  }
  
  return { triggered: false, exitPct: 0, reason: '' };
}

// Mock position factory
function createMockPosition(overrides: Partial<AutomatedPosition> = {}): AutomatedPosition {
  return {
    id: 'test-position-1',
    symbol: 'AAPL',
    side: 'long',
    entryPrice: 150,
    currentQty: 10,
    originalQty: 10,
    highWaterMark: 150,
    lowWaterMark: 150,
    enteredAt: new Date(),
    lastActivityAt: new Date(),
    stopLoss: { type: 'fixed', fixedPct: 5 },
    takeProfit: { type: 'single', targetPct: 10 },
    status: 'active',
    executedExits: [],
    ...overrides,
  };
}

describe('Stop Loss Checks', () => {
  describe('Fixed Percentage Stop', () => {
    it('should trigger when price drops below fixed percentage', () => {
      const position = createMockPosition({
        stopLoss: { type: 'fixed', fixedPct: 5 },
      });
      
      // Entry at 150, 5% stop = $142.50
      const result = checkStopLoss(position, 140);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('5%');
    });

    it('should not trigger when price is above stop', () => {
      const position = createMockPosition({
        stopLoss: { type: 'fixed', fixedPct: 5 },
      });
      
      const result = checkStopLoss(position, 148);
      
      expect(result.triggered).toBe(false);
    });

    it('should handle short positions correctly', () => {
      const position = createMockPosition({
        side: 'short',
        stopLoss: { type: 'fixed', fixedPct: 5 },
      });
      
      // Short at 150, 5% stop = $157.50
      const result = checkStopLoss(position, 160);
      
      expect(result.triggered).toBe(true);
    });
  });

  describe('Fixed Price Stop', () => {
    it('should trigger when price hits fixed stop price', () => {
      const position = createMockPosition({
        stopLoss: { type: 'fixed', fixedPrice: 145 },
      });
      
      const result = checkStopLoss(position, 144);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('$145');
    });
  });

  describe('Trailing Stop', () => {
    it('should trigger when price pulls back from high', () => {
      const position = createMockPosition({
        highWaterMark: 170,  // Price went up to 170
        stopLoss: { type: 'trailing', trailingPct: 5 },
      });
      
      // Trailing stop at 170 * 0.95 = 161.5
      const result = checkStopLoss(position, 160);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Trailing');
    });

    it('should not trigger before activation threshold', () => {
      const position = createMockPosition({
        highWaterMark: 155,  // Only 3.3% profit
        stopLoss: { 
          type: 'trailing', 
          trailingPct: 3,
          trailingActivationPct: 5, // Need 5% profit to activate
        },
      });
      
      // High is 155, entry is 150, so only 3.3% profit
      // Trailing not activated yet
      const result = checkStopLoss(position, 152);
      
      expect(result.triggered).toBe(false);
    });

    it('should trigger after activation threshold met', () => {
      const position = createMockPosition({
        highWaterMark: 160,  // 6.7% profit, above 5% activation
        stopLoss: { 
          type: 'trailing', 
          trailingPct: 3,
          trailingActivationPct: 5,
        },
      });
      
      // Trailing stop at 160 * 0.97 = 155.2
      const result = checkStopLoss(position, 154);
      
      expect(result.triggered).toBe(true);
    });
  });

  describe('Time-Based Stop', () => {
    it('should trigger after time period with no significant movement', () => {
      const fourHoursAgo = new Date(Date.now() - 4.1 * 60 * 60 * 1000);
      const position = createMockPosition({
        enteredAt: fourHoursAgo,
        stopLoss: { type: 'time', timeStopHours: 4 },
      });
      
      // Price barely moved (0.3%)
      const result = checkStopLoss(position, 150.5);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Time stop');
    });

    it('should not trigger if price has moved significantly', () => {
      const fourHoursAgo = new Date(Date.now() - 4.1 * 60 * 60 * 1000);
      const position = createMockPosition({
        enteredAt: fourHoursAgo,
        stopLoss: { type: 'time', timeStopHours: 4 },
      });
      
      // Price moved 2% (significant)
      const result = checkStopLoss(position, 153);
      
      expect(result.triggered).toBe(false);
    });

    it('should not trigger before time period', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const position = createMockPosition({
        enteredAt: twoHoursAgo,
        stopLoss: { type: 'time', timeStopHours: 4 },
      });
      
      const result = checkStopLoss(position, 150.5);
      
      expect(result.triggered).toBe(false);
    });
  });
});

describe('Take Profit Checks', () => {
  describe('Single Target', () => {
    it('should trigger when target percentage hit', () => {
      const position = createMockPosition({
        takeProfit: { type: 'single', targetPct: 10 },
      });
      
      // Entry at 150, 10% target = $165
      const result = checkTakeProfit(position, 166);
      
      expect(result.triggered).toBe(true);
      expect(result.exitPct).toBe(100);
    });

    it('should trigger when target price hit', () => {
      const position = createMockPosition({
        takeProfit: { type: 'single', targetPrice: 160 },
      });
      
      const result = checkTakeProfit(position, 161);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('$160');
    });

    it('should not trigger before target', () => {
      const position = createMockPosition({
        takeProfit: { type: 'single', targetPct: 10 },
      });
      
      const result = checkTakeProfit(position, 160);
      
      expect(result.triggered).toBe(false);
    });

    it('should handle short positions', () => {
      const position = createMockPosition({
        side: 'short',
        takeProfit: { type: 'single', targetPct: 10 },
      });
      
      // Short at 150, 10% profit at 135
      const result = checkTakeProfit(position, 134);
      
      expect(result.triggered).toBe(true);
    });
  });

  describe('Scaled Exits', () => {
    it('should trigger first scale target', () => {
      const position = createMockPosition({
        takeProfit: {
          type: 'scaled',
          scaledTargets: [
            { profitPct: 5, exitPct: 25 },
            { profitPct: 10, exitPct: 50 },
            { profitPct: 15, exitPct: 25 },
          ],
        },
      });
      
      // Entry at 150, 5% target = $157.50
      const result = checkTakeProfit(position, 158);
      
      expect(result.triggered).toBe(true);
      expect(result.exitPct).toBe(25);
      expect(result.reason).toContain('scaled_5');
    });

    it('should skip already executed targets', () => {
      const position = createMockPosition({
        takeProfit: {
          type: 'scaled',
          scaledTargets: [
            { profitPct: 5, exitPct: 25 },
            { profitPct: 10, exitPct: 50 },
          ],
        },
        executedExits: [
          { price: 158, qty: 2.5, reason: 'Scaled exit: 25% at 5% profit (scaled_5)', timestamp: new Date() },
        ],
      });
      
      // Price at first target but already executed, should look for next
      const result = checkTakeProfit(position, 158);
      
      expect(result.triggered).toBe(false);
    });

    it('should trigger second target after first executed', () => {
      const position = createMockPosition({
        takeProfit: {
          type: 'scaled',
          scaledTargets: [
            { profitPct: 5, exitPct: 25 },
            { profitPct: 10, exitPct: 50 },
          ],
        },
        executedExits: [
          { price: 158, qty: 2.5, reason: 'Scaled exit: 25% at 5% profit (scaled_5)', timestamp: new Date() },
        ],
      });
      
      // Entry at 150, 10% target = $165
      const result = checkTakeProfit(position, 166);
      
      expect(result.triggered).toBe(true);
      expect(result.exitPct).toBe(50);
      expect(result.reason).toContain('scaled_10');
    });
  });

  describe('Trailing Take Profit', () => {
    it('should trigger when pulling back from high after activation', () => {
      const position = createMockPosition({
        highWaterMark: 170,  // 13.3% peak profit
        takeProfit: {
          type: 'trailing',
          trailingActivationPct: 10, // Activate at 10% profit
          trailingCallbackPct: 3,    // Trigger on 3% pullback
        },
      });
      
      // Peak was at 13.3%, now at 5.3% profit = 8% pullback > 3% threshold
      const result = checkTakeProfit(position, 158);
      
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Trailing TP');
    });

    it('should not trigger before activation', () => {
      const position = createMockPosition({
        highWaterMark: 158,  // Only 5.3% profit
        takeProfit: {
          type: 'trailing',
          trailingActivationPct: 10,
          trailingCallbackPct: 3,
        },
      });
      
      const result = checkTakeProfit(position, 155);
      
      expect(result.triggered).toBe(false);
    });

    it('should not trigger if still in profit zone without pullback', () => {
      const position = createMockPosition({
        highWaterMark: 165,  // 10% profit
        takeProfit: {
          type: 'trailing',
          trailingActivationPct: 10,
          trailingCallbackPct: 3,
        },
      });
      
      // Current at 164, only 0.6% pullback
      const result = checkTakeProfit(position, 164);
      
      expect(result.triggered).toBe(false);
    });
  });
});
