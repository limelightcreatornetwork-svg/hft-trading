import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HFT Trading API',
      version: '0.1.0',
      description: 'High-Frequency Trading Dashboard API - Alpaca integration with risk management, options trading, and portfolio optimization',
      contact: {
        name: 'API Support',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Account', description: 'Account information and balance' },
      { name: 'Positions', description: 'Current portfolio positions' },
      { name: 'Orders', description: 'Order management' },
      { name: 'Trade', description: 'Trade execution with confidence scoring' },
      { name: 'Risk', description: 'Risk configuration and monitoring' },
      { name: 'Regime', description: 'Market regime detection' },
      { name: 'Options', description: 'Options chain and order management' },
      { name: 'Alerts', description: 'Price and position alerts' },
      { name: 'Intents', description: 'Trading intent management with risk checks' },
      { name: 'Portfolio', description: 'Portfolio analytics and optimization' },
      { name: 'Health', description: 'System health and status' },
      { name: 'Kill Switch', description: 'Emergency trading halt' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'abc123' },
            status: { type: 'string', example: 'ACTIVE' },
            currency: { type: 'string', example: 'USD' },
            buyingPower: { type: 'number', example: 100000 },
            cash: { type: 'number', example: 50000 },
            portfolioValue: { type: 'number', example: 150000 },
            equity: { type: 'number', example: 150000 },
            lastEquity: { type: 'number', example: 148000 },
            longMarketValue: { type: 'number', example: 100000 },
            shortMarketValue: { type: 'number', example: 0 },
            initialMargin: { type: 'number', example: 50000 },
            maintenanceMargin: { type: 'number', example: 25000 },
            daytradeCount: { type: 'integer', example: 2 },
            patternDayTrader: { type: 'boolean', example: false },
            dailyPL: { type: 'number', example: 2000 },
            dailyPLPercent: { type: 'number', example: 1.35 },
          },
        },
        Position: {
          type: 'object',
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            assetId: { type: 'string' },
            exchange: { type: 'string', example: 'NASDAQ' },
            assetClass: { type: 'string', example: 'us_equity' },
            quantity: { type: 'number', example: 100 },
            side: { type: 'string', enum: ['long', 'short'] },
            avgEntryPrice: { type: 'number', example: 150.50 },
            currentPrice: { type: 'number', example: 155.25 },
            marketValue: { type: 'number', example: 15525 },
            costBasis: { type: 'number', example: 15050 },
            unrealizedPL: { type: 'number', example: 475 },
            unrealizedPLPercent: { type: 'number', example: 3.16 },
            unrealizedIntradayPL: { type: 'number', example: 125 },
            unrealizedIntradayPLPercent: { type: 'number', example: 0.81 },
            lastdayPrice: { type: 'number', example: 154 },
            changeToday: { type: 'number', example: 0.81 },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            clientOrderId: { type: 'string' },
            symbol: { type: 'string', example: 'AAPL' },
            assetClass: { type: 'string', example: 'us_equity' },
            quantity: { type: 'number', example: 10 },
            filledQuantity: { type: 'number', example: 0 },
            type: { type: 'string', enum: ['market', 'limit', 'stop', 'stop_limit'] },
            side: { type: 'string', enum: ['buy', 'sell'] },
            timeInForce: { type: 'string', enum: ['day', 'gtc', 'opg', 'ioc', 'fok'] },
            limitPrice: { type: 'number', nullable: true },
            stopPrice: { type: 'number', nullable: true },
            filledAvgPrice: { type: 'number', nullable: true },
            status: { type: 'string', example: 'new' },
            extendedHours: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            submittedAt: { type: 'string', format: 'date-time' },
            filledAt: { type: 'string', format: 'date-time', nullable: true },
            canceledAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        TradeRequest: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'entryPrice'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            quantity: { type: 'number', minimum: 1, example: 10 },
            entryPrice: { type: 'number', minimum: 0, example: 150 },
            takeProfitPct: { type: 'number', example: 5, description: 'Take profit percentage' },
            stopLossPct: { type: 'number', example: 2, description: 'Stop loss percentage' },
            timeStopHours: { type: 'number', example: 24, description: 'Time stop in hours' },
            trailingStopPct: { type: 'number', example: 3, description: 'Trailing stop percentage' },
          },
        },
        OrderRequest: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'type'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            quantity: { type: 'integer', minimum: 1, example: 10 },
            type: { type: 'string', enum: ['market', 'limit', 'stop', 'stop_limit'] },
            timeInForce: { type: 'string', enum: ['day', 'gtc', 'opg', 'ioc', 'fok'], default: 'day' },
            limitPrice: { type: 'number', example: 150, description: 'Required for limit orders' },
            stopPrice: { type: 'number', example: 145 },
            skipRiskCheck: { type: 'boolean', default: false },
            skipRegimeCheck: { type: 'boolean', default: false },
          },
        },
        RiskConfig: {
          type: 'object',
          properties: {
            maxPositionSize: { type: 'integer', example: 10000 },
            maxOrderSize: { type: 'integer', example: 1000 },
            maxDailyLoss: { type: 'number', example: 5000 },
            allowedSymbols: { type: 'array', items: { type: 'string' }, example: ['AAPL', 'GOOGL', 'MSFT'] },
            tradingEnabled: { type: 'boolean', example: true },
          },
        },
        RiskHeadroom: {
          type: 'object',
          properties: {
            tradingEnabled: { type: 'boolean' },
            dailyLossUsed: { type: 'number' },
            dailyLossLimit: { type: 'number' },
            dailyLossRemaining: { type: 'number' },
          },
        },
        RegimeResult: {
          type: 'object',
          properties: {
            symbol: { type: 'string', example: 'SPY' },
            regime: { type: 'string', enum: ['bullish', 'bearish', 'neutral', 'high_volatility'] },
            confidence: { type: 'number', minimum: 0, maximum: 1, example: 0.85 },
            timestamp: { type: 'string', format: 'date-time' },
            indicators: {
              type: 'object',
              properties: {
                trend: { type: 'string' },
                volatility: { type: 'number' },
                momentum: { type: 'number' },
              },
            },
          },
        },
        OptionsChainEntry: {
          type: 'object',
          properties: {
            contract: {
              type: 'object',
              properties: {
                symbol: { type: 'string', example: 'AAPL240119C00150000' },
                name: { type: 'string' },
                expiration: { type: 'string', format: 'date' },
                strike: { type: 'number', example: 150 },
                type: { type: 'string', enum: ['call', 'put'] },
                openInterest: { type: 'integer' },
              },
            },
            quote: {
              type: 'object',
              nullable: true,
              properties: {
                bid: { type: 'number' },
                ask: { type: 'number' },
                last: { type: 'number' },
                spread: { type: 'number' },
              },
            },
            greeks: {
              type: 'object',
              nullable: true,
              properties: {
                delta: { type: 'number' },
                gamma: { type: 'number' },
                theta: { type: 'number' },
                vega: { type: 'number' },
                iv: { type: 'number', description: 'Implied volatility' },
              },
            },
          },
        },
        OptionsOrderRequest: {
          type: 'object',
          required: ['symbol', 'side', 'quantity'],
          properties: {
            symbol: { type: 'string', example: 'AAPL240119C00150000', description: 'OCC option symbol' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            quantity: { type: 'integer', minimum: 1 },
            type: { type: 'string', enum: ['market', 'limit'], default: 'limit' },
            limitPrice: { type: 'number', description: 'Required for limit orders' },
            strategy: { type: 'string', enum: ['covered_call', 'cash_secured_put', 'buy_option'] },
            skipValidation: { type: 'boolean', default: false },
          },
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            symbol: { type: 'string' },
            type: { type: 'string', enum: ['take_profit', 'stop_loss', 'time_stop', 'trailing_stop'] },
            targetPrice: { type: 'number' },
            triggered: { type: 'boolean' },
            triggeredAt: { type: 'string', format: 'date-time', nullable: true },
            dismissed: { type: 'boolean' },
          },
        },
        Intent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            symbol: { type: 'string' },
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            quantity: { type: 'integer' },
            orderType: { type: 'string', enum: ['MARKET', 'LIMIT'] },
            limitPrice: { type: 'number', nullable: true },
            strategy: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] },
            createdAt: { type: 'string', format: 'date-time' },
            riskChecks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  checkName: { type: 'string' },
                  passed: { type: 'boolean' },
                  details: { type: 'string' },
                },
              },
            },
          },
        },
        IntentRequest: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'orderType'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            quantity: { type: 'integer', minimum: 1 },
            orderType: { type: 'string', enum: ['market', 'limit'] },
            limitPrice: { type: 'number', description: 'Required for limit orders' },
            strategy: { type: 'string', default: 'manual' },
            autoExecute: { type: 'boolean', default: true },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'integer', description: 'Uptime in seconds' },
            version: { type: 'string' },
            environment: { type: 'string' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['pass', 'fail', 'warn'] },
                  message: { type: 'string' },
                  latencyMs: { type: 'number' },
                },
              },
            },
          },
        },
        PortfolioSummary: {
          type: 'object',
          properties: {
            totalValue: { type: 'number' },
            cash: { type: 'number' },
            positions: { type: 'array', items: { $ref: '#/components/schemas/Position' } },
            sectorAllocation: { type: 'object', additionalProperties: { type: 'number' } },
            assetClassAllocation: { type: 'object', additionalProperties: { type: 'number' } },
            riskMetrics: {
              type: 'object',
              properties: {
                sharpeRatio: { type: 'number' },
                sortino: { type: 'number' },
                maxDrawdownPercent: { type: 'number' },
                valueAtRisk: { type: 'number' },
                volatility: { type: 'number' },
                beta: { type: 'number' },
              },
            },
          },
        },
        KillSwitchRequest: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['activate', 'deactivate'] },
            cancelOrders: { type: 'boolean', default: true, description: 'Cancel all open orders when activating' },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: [], // We define paths inline below
};

// Generate spec
const swaggerSpec = swaggerJsdoc(options);

// Add paths programmatically (cleaner than JSDoc comments in route files)
const paths = {
  '/api/account': {
    get: {
      tags: ['Account'],
      summary: 'Get account information',
      description: 'Retrieve current account balance, equity, margin, and trading status',
      responses: {
        200: {
          description: 'Account information retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Account' },
                },
              },
            },
          },
        },
        500: {
          description: 'Server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },
  '/api/positions': {
    get: {
      tags: ['Positions'],
      summary: 'Get all positions',
      description: 'Retrieve all current portfolio positions with P&L calculations',
      responses: {
        200: {
          description: 'Positions retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      positions: { type: 'array', items: { $ref: '#/components/schemas/Position' } },
                      totals: {
                        type: 'object',
                        properties: {
                          totalMarketValue: { type: 'number' },
                          totalCostBasis: { type: 'number' },
                          totalUnrealizedPL: { type: 'number' },
                          totalIntradayPL: { type: 'number' },
                        },
                      },
                      count: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/trade': {
    get: {
      tags: ['Trade'],
      summary: 'Preview trade confidence',
      description: 'Calculate confidence score and suggested levels without placing a trade',
      parameters: [
        { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock symbol' },
        { name: 'side', in: 'query', schema: { type: 'string', enum: ['buy', 'sell'] }, description: 'Trade side' },
        { name: 'entryPrice', in: 'query', schema: { type: 'number' }, description: 'Entry price' },
      ],
      responses: {
        200: {
          description: 'Confidence calculated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  symbol: { type: 'string' },
                  side: { type: 'string' },
                  entryPrice: { type: 'number' },
                  confidence: { type: 'object' },
                  suggestedLevels: { type: 'object' },
                },
              },
            },
          },
        },
        400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Trade'],
      summary: 'Place a trade with confidence scoring',
      description: 'Execute a trade with automatic confidence evaluation. Low confidence trades may be skipped.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/TradeRequest' } } },
      },
      responses: {
        200: {
          description: 'Trade processed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  skipped: { type: 'boolean' },
                  reason: { type: 'string' },
                  position: { type: 'object' },
                  confidence: { type: 'object' },
                },
              },
            },
          },
        },
        400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/orders': {
    get: {
      tags: ['Orders'],
      summary: 'Get orders',
      description: 'Retrieve orders with optional status filter',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' }, description: 'Order status filter' },
      ],
      responses: {
        200: {
          description: 'Orders retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                      count: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Orders'],
      summary: 'Submit an order',
      description: 'Submit a new order with automatic risk checks',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } },
      },
      responses: {
        200: {
          description: 'Order submitted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Order' },
                },
              },
            },
          },
        },
        400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        403: { description: 'Rejected by risk engine', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    delete: {
      tags: ['Orders'],
      summary: 'Cancel an order',
      description: 'Cancel an open order by ID',
      parameters: [
        { name: 'id', in: 'query', required: true, schema: { type: 'string' }, description: 'Order ID to cancel' },
      ],
      responses: {
        200: { description: 'Order cancelled', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } } } } },
        400: { description: 'Order ID required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/risk': {
    get: {
      tags: ['Risk'],
      summary: 'Get risk configuration',
      description: 'Retrieve current risk limits and headroom',
      responses: {
        200: {
          description: 'Risk config retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      config: { $ref: '#/components/schemas/RiskConfig' },
                      headroom: { $ref: '#/components/schemas/RiskHeadroom' },
                      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
                    },
                  },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    put: {
      tags: ['Risk'],
      summary: 'Update risk configuration',
      description: 'Modify risk limits and trading controls',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                maxPositionSize: { type: 'integer' },
                maxOrderSize: { type: 'integer' },
                maxDailyLoss: { type: 'number' },
                allowedSymbols: { type: 'array', items: { type: 'string' } },
                tradingEnabled: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Risk config updated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { config: { $ref: '#/components/schemas/RiskConfig' } } } } } } } },
        400: { description: 'Invalid parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/regime': {
    get: {
      tags: ['Regime'],
      summary: 'Detect market regime',
      description: 'Get current market regime classification for a symbol',
      parameters: [
        { name: 'symbol', in: 'query', schema: { type: 'string', default: 'SPY' }, description: 'Symbol to analyze' },
        { name: 'history', in: 'query', schema: { type: 'boolean', default: false }, description: 'Return historical regime data' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Max history entries' },
      ],
      responses: {
        200: { description: 'Regime detected', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegimeResult' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Regime'],
      summary: 'Batch regime detection',
      description: 'Detect regime for multiple symbols',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' }, example: ['SPY', 'QQQ', 'IWM'] } } } } },
      },
      responses: {
        200: { description: 'Regimes detected', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, results: { type: 'array', items: { $ref: '#/components/schemas/RegimeResult' } } } } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/options/chain': {
    get: {
      tags: ['Options'],
      summary: 'Get options chain',
      description: 'Retrieve options contracts with quotes and Greeks',
      parameters: [
        { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Underlying symbol' },
        { name: 'expiration', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter by expiration date' },
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['call', 'put'] }, description: 'Option type filter' },
        { name: 'minStrike', in: 'query', schema: { type: 'number' }, description: 'Minimum strike price' },
        { name: 'maxStrike', in: 'query', schema: { type: 'number' }, description: 'Maximum strike price' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Max contracts to return' },
      ],
      responses: {
        200: {
          description: 'Options chain retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      symbol: { type: 'string' },
                      chain: { type: 'array', items: { $ref: '#/components/schemas/OptionsChainEntry' } },
                      expirations: { type: 'array', items: { type: 'string' } },
                      strikes: { type: 'array', items: { type: 'number' } },
                      count: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Symbol required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/options/orders': {
    get: {
      tags: ['Options'],
      summary: 'Get options orders',
      description: 'Retrieve options orders with status filter',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' } },
      ],
      responses: {
        200: { description: 'Options orders retrieved', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { orders: { type: 'array' }, count: { type: 'integer' } } } } } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Options'],
      summary: 'Submit options order',
      description: 'Submit an options order (Level 1: covered calls and cash-secured puts)',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/OptionsOrderRequest' } } },
      },
      responses: {
        200: { description: 'Order submitted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } } },
        400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        403: { description: 'Level 1 restriction violated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/kill-switch': {
    get: {
      tags: ['Kill Switch'],
      summary: 'Get kill switch status',
      description: 'Check if the emergency kill switch is active',
      responses: {
        200: {
          description: 'Status retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      active: { type: 'boolean' },
                      tradingEnabled: { type: 'boolean' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Kill Switch'],
      summary: 'Toggle kill switch',
      description: 'Activate or deactivate the emergency kill switch. Optionally cancels all open orders.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/KillSwitchRequest' } } },
      },
      responses: {
        200: {
          description: 'Kill switch toggled',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      active: { type: 'boolean' },
                      message: { type: 'string' },
                      cancelledOrders: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Invalid action', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/alerts': {
    get: {
      tags: ['Alerts'],
      summary: 'Get alerts',
      description: 'Retrieve pending and recent alerts',
      parameters: [
        { name: 'pending', in: 'query', schema: { type: 'boolean', default: false }, description: 'Only show untriggered alerts' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Max alerts to return' },
      ],
      responses: {
        200: { description: 'Alerts retrieved', content: { 'application/json': { schema: { type: 'object', properties: { alerts: { type: 'array', items: { $ref: '#/components/schemas/Alert' } }, count: { type: 'integer' } } } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Alerts'],
      summary: 'Dismiss an alert',
      description: 'Mark an alert as dismissed',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['alertId'], properties: { alertId: { type: 'string' } } } } },
      },
      responses: {
        200: { description: 'Alert dismissed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } } } } },
        400: { description: 'Alert ID required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/alerts/check': {
    get: {
      tags: ['Alerts'],
      summary: 'Check all position alerts',
      description: 'Check all positions against TP/SL/time stops',
      responses: {
        200: {
          description: 'Alerts checked',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  positionsChecked: { type: 'integer' },
                  triggeredAlerts: { type: 'integer' },
                  results: { type: 'array' },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Alerts'],
      summary: 'Check all position alerts',
      description: 'Check all positions against TP/SL/time stops (same as GET)',
      responses: {
        200: {
          description: 'Alerts checked',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  positionsChecked: { type: 'integer' },
                  triggeredAlerts: { type: 'integer' },
                  results: { type: 'array' },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/intents': {
    get: {
      tags: ['Intents'],
      summary: 'Get trading intents',
      description: 'Retrieve trading intents with risk check results',
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] } },
      ],
      responses: {
        200: {
          description: 'Intents retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      intents: { type: 'array', items: { $ref: '#/components/schemas/Intent' } },
                      count: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    post: {
      tags: ['Intents'],
      summary: 'Create trading intent',
      description: 'Create a new trading intent with automatic risk checks and optional auto-execution',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/IntentRequest' } } },
      },
      responses: {
        200: {
          description: 'Intent created and processed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'object',
                    properties: {
                      intent: { $ref: '#/components/schemas/Intent' },
                      riskCheck: {
                        type: 'object',
                        properties: {
                          approved: { type: 'boolean' },
                          reason: { type: 'string' },
                          checks: { type: 'array' },
                        },
                      },
                      order: { type: 'object', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/health': {
    get: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'System health check for monitoring and deployment',
      security: [], // No auth required for health checks
      responses: {
        200: {
          description: 'System is healthy or degraded',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheck' } } },
        },
        503: {
          description: 'System is unhealthy',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheck' } } },
        },
      },
    },
  },
  '/api/portfolio': {
    get: {
      tags: ['Portfolio'],
      summary: 'Get portfolio analytics',
      description: 'Comprehensive portfolio analysis including sector allocation, risk metrics, and optimization suggestions',
      responses: {
        200: {
          description: 'Portfolio analysis retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/PortfolioSummary' },
                },
              },
            },
          },
        },
        500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
};

// Merge paths into spec
(swaggerSpec as { paths: typeof paths }).paths = paths;

export function getSwaggerSpec() {
  return swaggerSpec;
}
