/**
 * @fileoverview Structured logging with pino
 * @module libs/logger
 */

import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    service: 'hft-trading',
    env: config.nodeEnv,
  },
});
