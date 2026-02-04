/**
 * Structured Logger
 *
 * Provides consistent JSON-formatted logging with log levels,
 * module context, and structured metadata.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'test' ? 'error' : 'info');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatEntry(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

function emit(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
      break;
  }
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(subModule: string): Logger;
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('debug')) return;
      emit(formatEntry('debug', module, message, meta));
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('info')) return;
      emit(formatEntry('info', module, message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('warn')) return;
      emit(formatEntry('warn', module, message, meta));
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('error')) return;
      emit(formatEntry('error', module, message, meta));
    },
    child(subModule: string): Logger {
      return createLogger(`${module}:${subModule}`);
    },
  };
}

/**
 * Serialize an error for structured logging
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    };
  }
  return { errorMessage: String(error) };
}
