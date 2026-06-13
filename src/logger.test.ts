import pino from 'pino';
import { consoleStyleLogMethod } from './logger';

describe('consoleStyleLogMethod', () => {
  function createTestLogger(lines: string[]) {
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
    );
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
