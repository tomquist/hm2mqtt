import pino from 'pino';
import { consoleStyleLogMethod, logMethodHook } from './logger.js';

// pino v10's printf-placeholder-aware typings reject console.log-style calls
// (a trailing object/string with no matching `%s`/`%d`). consoleStyleLogMethod
// exists precisely to support that style at runtime, so the test logger is
// typed loosely to mirror how the production logger is consumed.
type ConsoleStyleLogger = Omit<
  pino.Logger,
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
> &
  Record<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', (...args: any[]) => void>;

describe('consoleStyleLogMethod', () => {
  function createTestLogger(lines: string[]): ConsoleStyleLogger {
    return pino(
      {
        level: 'debug',
        hooks: { logMethod: consoleStyleLogMethod },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    ) as unknown as ConsoleStyleLogger;
  }

  function lastMessage(lines: string[]): string {
    return JSON.parse(lines[lines.length - 1]).msg;
  }

  it('appends a trailing object to the message', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('Current period 1 settings:', {
      enabled: true,
      startTime: '00:00',
      endTime: '23:59',
      outputValue: 800,
    });

    expect(lastMessage(lines)).toBe(
      "Current period 1 settings: { enabled: true, startTime: '00:00', endTime: '23:59', outputValue: 800 }",
    );
  });

  it('appends a trailing string to the message', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.warn('Invalid output value (should be 0-800):', 'abc');

    expect(lastMessage(lines)).toBe('Invalid output value (should be 0-800): abc');
  });

  it('appends multiple trailing arguments', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.error('Unhandled rejection at:', { promise: true }, 'reason:', 'boom');

    expect(lastMessage(lines)).toBe('Unhandled rejection at: { promise: true } reason: boom');
  });

  it('includes error details', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.error('MQTT client error:', new Error('connection refused'));

    expect(lastMessage(lines)).toContain('MQTT client error: Error: connection refused');
  });

  it('leaves messages without extra arguments untouched', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('Connected to MQTT broker');

    expect(lastMessage(lines)).toBe('Connected to MQTT broker');
  });

  it('keeps pino-style placeholder interpolation working', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('Device %s is online', 'HMA-1');

    expect(lastMessage(lines)).toBe('Device HMA-1 is online');
  });

  it('appends only the arguments not consumed by placeholders', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('Device %s reported:', 'HMA-1', { soc: 42 });

    expect(lastMessage(lines)).toBe('Device HMA-1 reported: { soc: 42 }');
  });

  it('keeps pino-style object-first calls working', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info({ deviceId: 'abc' }, 'Device registered');

    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.msg).toBe('Device registered');
    expect(entry.deviceId).toBe('abc');
  });
});

describe('logMethodHook', () => {
  function createTestLogger(lines: string[]): ConsoleStyleLogger {
    return pino(
      {
        level: 'debug',
        hooks: { logMethod: logMethodHook },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    ) as unknown as ConsoleStyleLogger;
  }

  function lastMessage(lines: string[]): string {
    return JSON.parse(lines[lines.length - 1]).msg;
  }

  it('masks credentials embedded in a logged broker URL (regression #424)', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('Connecting to MQTT broker at mqtt://user:secret@broker:1883 with client ID x');

    expect(lastMessage(lines)).toBe(
      'Connecting to MQTT broker at mqtt://user:***@broker:1883 with client ID x',
    );
  });

  it('masks credentials inside appended objects', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.debug('Full MQTT config:', { brokerUrl: 'mqtt://user:secret@broker:1883' });

    expect(lastMessage(lines)).toBe(
      "Full MQTT config: { brokerUrl: 'mqtt://user:***@broker:1883' }",
    );
  });

  it('masks credentials in a leading object, which pino writes as log fields', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);
    const bindings = { brokerUrl: 'mqtt://user:secret@broker:1883' };

    logger.info(bindings, 'Connecting to MQTT broker');

    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.brokerUrl).toBe('mqtt://user:***@broker:1883');
    expect(bindings.brokerUrl).toBe('mqtt://user:secret@broker:1883');
  });

  it('masks credentials in an object interpolated through %o', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.info('MQTT config: %o', { brokerUrl: 'mqtt://user:secret@broker:1883' });

    expect(lastMessage(lines)).toContain('mqtt://user:***@broker:1883');
    expect(lastMessage(lines)).not.toContain('secret');
  });

  it('masks credentials in an error logged the way this codebase logs errors', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.error(
      'MQTT client error:',
      new Error('connect failed for mqtt://user:secret@broker:1883'),
    );

    expect(lastMessage(lines)).toContain('mqtt://user:***@broker:1883');
    expect(lastMessage(lines)).not.toContain('secret');
  });

  it('still folds surplus arguments into the message', () => {
    const lines: string[] = [];
    const logger = createTestLogger(lines);

    logger.warn('Invalid output value (should be 0-800):', 'abc');

    expect(lastMessage(lines)).toBe('Invalid output value (should be 0-800): abc');
  });
});
