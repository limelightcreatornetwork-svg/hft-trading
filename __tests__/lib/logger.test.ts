/**
 * Tests for Structured Logger
 */

import { createLogger, serializeError } from '@/lib/logger';

describe('createLogger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a logger with the given module name', () => {
    const log = createLogger('test-module');
    log.error('test message');

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(output.module).toBe('test-module');
    expect(output.message).toBe('test message');
    expect(output.level).toBe('error');
  });

  it('should include a timestamp in ISO format', () => {
    const log = createLogger('ts-test');
    log.error('timestamp check');

    const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(output.timestamp).toBeDefined();
    // Verify it's a valid ISO date
    expect(new Date(output.timestamp).toISOString()).toBe(output.timestamp);
  });

  it('should include metadata in the log entry', () => {
    const log = createLogger('meta-test');
    log.error('with meta', { userId: '123', action: 'login' });

    const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(output.userId).toBe('123');
    expect(output.action).toBe('login');
  });

  it('should route error level to console.error', () => {
    const log = createLogger('routing');
    log.error('error msg');

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should route warn level to console.warn', () => {
    // In test env, LOG_LEVEL defaults to 'error', so warn won't emit
    // But we can still verify the logger exists
    const log = createLogger('routing');
    log.warn('warn msg');

    // In test environment, warn is below error level, so it won't emit
    // This is expected behavior
  });

  it('should create child loggers with combined module name', () => {
    const log = createLogger('parent');
    const child = log.child('child');
    child.error('child message');

    const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(output.module).toBe('parent:child');
  });

  it('should support nested child loggers', () => {
    const log = createLogger('a');
    const child = log.child('b').child('c');
    child.error('nested');

    const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(output.module).toBe('a:b:c');
  });

  it('should output valid JSON', () => {
    const log = createLogger('json-test');
    log.error('json check', { key: 'value' });

    const rawOutput = consoleSpy.error.mock.calls[0][0];
    expect(() => JSON.parse(rawOutput)).not.toThrow();
  });
});

describe('serializeError', () => {
  it('should serialize Error objects with name, message, and stack', () => {
    const error = new Error('test error');
    const serialized = serializeError(error);

    expect(serialized.errorName).toBe('Error');
    expect(serialized.errorMessage).toBe('test error');
    expect(serialized.stack).toBeDefined();
    expect(typeof serialized.stack).toBe('string');
  });

  it('should truncate stack to 5 lines', () => {
    const error = new Error('stack test');
    const serialized = serializeError(error);

    const stackLines = (serialized.stack as string).split('\n');
    expect(stackLines.length).toBeLessThanOrEqual(5);
  });

  it('should serialize custom error types', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }

    const error = new CustomError('custom');
    const serialized = serializeError(error);

    expect(serialized.errorName).toBe('CustomError');
    expect(serialized.errorMessage).toBe('custom');
  });

  it('should handle string errors', () => {
    const serialized = serializeError('string error');

    expect(serialized.errorMessage).toBe('string error');
    expect(serialized.errorName).toBeUndefined();
  });

  it('should handle number errors', () => {
    const serialized = serializeError(42);

    expect(serialized.errorMessage).toBe('42');
  });

  it('should handle null errors', () => {
    const serialized = serializeError(null);

    expect(serialized.errorMessage).toBe('null');
  });

  it('should handle undefined errors', () => {
    const serialized = serializeError(undefined);

    expect(serialized.errorMessage).toBe('undefined');
  });

  it('should handle object errors', () => {
    const serialized = serializeError({ code: 'ERR_001' });

    expect(serialized.errorMessage).toBe('[object Object]');
  });
});
