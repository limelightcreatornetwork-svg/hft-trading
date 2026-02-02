/**
 * @fileoverview Trading Gateway API Server
 *
 * Main entry point for the HFT trading system. Provides REST API
 * for the agent to submit trade intents and manage positions.
 *
 * @module gateway
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../libs/config.js';
import { logger } from '../libs/logger.js';
import { riskEngine } from '../libs/risk/index.js';
import { oms } from '../oms/index.js';
import { optionsService } from '../options/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /v1/state
 * Returns current account state, positions, and risk headroom
 */
app.get('/v1/state', async (req, res) => {
  try {
    const state = await oms.getState();
    res.json(state);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get state');
    res.status(500).json({ error: 'Failed to get state' });
  }
});

/**
 * POST /v1/intents
 * Submit a trade intent (idempotent)
 */
app.post('/v1/intents', async (req, res) => {
  try {
    const intent = req.body;

    // Validate required fields
    if (!intent.client_intent_id || !intent.symbol || !intent.side || !intent.qty) {
      return res.status(400).json({
        status: 'rejected',
        reason: 'missing_required_fields',
        details: 'Required: client_intent_id, symbol, side, qty',
      });
    }

    // Check idempotency
    const existing = await oms.getIntentByClientId(intent.client_intent_id);
    if (existing) {
      return res.json({
        status: existing.status,
        intent_id: existing.id,
        order_id: existing.order_id,
        message: 'Intent already exists (idempotent)',
      });
    }

    // Run risk checks
    const riskDecision = await riskEngine.evaluate(intent);

    if (!riskDecision.accepted) {
      logger.warn({ intent, reason: riskDecision.reason }, 'Intent rejected by risk engine');
      return res.json({
        status: 'rejected',
        intent_id: null,
        reason: riskDecision.reason,
        details: riskDecision.details,
        risk: {
          checks_passed: false,
          failed_check: riskDecision.failed_check,
        },
      });
    }

    // Submit to OMS
    const result = await oms.submitIntent(intent, riskDecision);

    res.json({
      status: 'accepted',
      intent_id: result.intent_id,
      order_id: result.order_id,
      risk: {
        checks_passed: true,
        headroom: riskDecision.headroom,
      },
    });
  } catch (error) {
    logger.error({ error: error.message, body: req.body }, 'Failed to process intent');
    res.status(500).json({ error: 'Internal error processing intent' });
  }
});

/**
 * POST /v1/orders/:orderId/cancel
 * Cancel an order (idempotent)
 */
app.post('/v1/orders/:orderId/cancel', async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await oms.cancelOrder(orderId);
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, orderId: req.params.orderId }, 'Failed to cancel order');
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

/**
 * GET /v1/orders
 * Get open orders
 */
app.get('/v1/orders', async (req, res) => {
  try {
    const orders = await oms.getOpenOrders();
    res.json({ orders });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get orders');
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

/**
 * POST /v1/controls/kill_switch
 * Enable/disable kill switch
 */
app.post('/v1/controls/kill_switch', async (req, res) => {
  try {
    const { enabled, mode } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be boolean' });
    }

    const result = await riskEngine.setKillSwitch(enabled, mode);
    
    logger.warn({ enabled, mode }, 'Kill switch toggled');
    
    res.json({
      status: 'ok',
      kill_switch: enabled,
      mode: mode || 'block_new',
      ...result,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to set kill switch');
    res.status(500).json({ error: 'Failed to set kill switch' });
  }
});

/**
 * GET /v1/risk/state
 * Get current risk state
 */
app.get('/v1/risk/state', async (req, res) => {
  try {
    const state = await riskEngine.getState();
    res.json(state);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get risk state');
    res.status(500).json({ error: 'Failed to get risk state' });
  }
});

// =============================================================================
// OPTIONS API ROUTES
// =============================================================================

/**
 * GET /api/options/chain
 * Get option chain for a symbol
 */
app.get('/api/options/chain', async (req, res) => {
  try {
    const {
      symbol,
      expiration_date,
      expiration_date_gte,
      expiration_date_lte,
      type,
      strike_price_gte,
      strike_price_lte,
      limit,
      page_token,
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol query parameter is required' });
    }

    const result = await optionsService.getOptionChain({
      underlying_symbols: symbol,
      expiration_date,
      expiration_date_gte,
      expiration_date_lte,
      type,
      strike_price_gte: strike_price_gte ? parseFloat(strike_price_gte) : undefined,
      strike_price_lte: strike_price_lte ? parseFloat(strike_price_lte) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      page_token,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get option chain');
    res.status(error.status || 500).json({ 
      error: error.message,
      details: error.details,
    });
  }
});

/**
 * GET /api/options/contract/:symbolOrId
 * Get a single option contract
 */
app.get('/api/options/contract/:symbolOrId', async (req, res) => {
  try {
    const contract = await optionsService.getOptionContract(req.params.symbolOrId);
    res.json(contract);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get option contract');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * GET /api/options/quotes
 * Get latest quotes for option contracts
 */
app.get('/api/options/quotes', async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'symbols query parameter is required' });
    }

    const quotes = await optionsService.getOptionQuotes(symbols);
    res.json({ quotes });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get option quotes');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * GET /api/options/positions
 * Get current options positions
 */
app.get('/api/options/positions', async (req, res) => {
  try {
    const positions = await optionsService.getOptionsPositions();
    res.json({ positions });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get options positions');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/options/orders
 * Place an options order
 */
app.post('/api/options/orders', async (req, res) => {
  try {
    const { symbol, qty, side, type, limit_price, stop_price, client_order_id } = req.body;

    // Validate required fields
    if (!symbol || !qty || !side || !type) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['symbol', 'qty', 'side', 'type'],
      });
    }

    const order = await optionsService.placeOptionsOrder({
      symbol,
      qty: parseInt(qty, 10),
      side,
      type,
      limit_price: limit_price ? parseFloat(limit_price) : undefined,
      stop_price: stop_price ? parseFloat(stop_price) : undefined,
      client_order_id,
    });

    res.json({
      status: 'submitted',
      order,
    });
  } catch (error) {
    logger.error({ error: error.message, body: req.body }, 'Failed to place options order');
    res.status(error.status || 500).json({ 
      error: error.message,
      details: error.details,
    });
  }
});

/**
 * GET /api/options/orders
 * Get options orders
 */
app.get('/api/options/orders', async (req, res) => {
  try {
    const { status, limit, after, until } = req.query;
    
    const orders = await optionsService.getOptionsOrders({
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      after,
      until,
    });

    res.json({ orders });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get options orders');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * DELETE /api/options/orders/:orderId
 * Cancel an options order
 */
app.delete('/api/options/orders/:orderId', async (req, res) => {
  try {
    const result = await optionsService.cancelOptionsOrder(req.params.orderId);
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to cancel options order');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/options/positions/:symbolOrId/exercise
 * Exercise an option position
 */
app.post('/api/options/positions/:symbolOrId/exercise', async (req, res) => {
  try {
    const result = await optionsService.exerciseOption(req.params.symbolOrId);
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to exercise option');
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * GET /api/options/account
 * Get account options trading level and buying power
 */
app.get('/api/options/account', async (req, res) => {
  try {
    const account = await optionsService.getAccountOptionsLevel();
    res.json(account);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get account info');
    res.status(error.status || 500).json({ error: error.message });
  }
});

// =============================================================================
// STATIC DASHBOARD
// =============================================================================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// Serve dashboard at root
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Start server
const port = config.port || 3000;

app.listen(port, () => {
  logger.info({ port }, 'Trading gateway started');
  logger.info({ port }, `Dashboard available at http://localhost:${port}/dashboard`);
});

export { app };
