import './registry.js';
import { getDeviceDefinition } from '../deviceDefinition.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('Venus E Mini', () => {
  test('uses the zero-padded runtime data request required by the device', () => {
    const definition = getDeviceDefinition('VNSEMINI-0');
    const runtimeMessage = definition?.messages.find(message => message.publishPath === 'data');

    expect(runtimeMessage?.refreshDataPayload).toBe('cd=01');
  });

  test.each([
    ['UTC', '2026-10-4 11:15:24', '2026-10-04T11:15:24.000Z', '2026-10-04T11:15:30Z'],
    ['Europe/Rome', '2026-10-4 11:15:24', '2026-10-04T09:15:24.000Z', '2026-10-04T09:15:30Z'],
    ['Europe/Rome', '2026-1-4 11:15:24', '2026-01-04T10:15:24.000Z', '2026-01-04T10:15:30Z'],
    ['Europe/Rome', '2026-3-29 2:30:00', '2026-3-29 2:30:00', '2026-03-29T01:30:05Z'],
    ['Europe/Rome', '2026-10-25 2:30:00', '2026-10-25T00:30:00.000Z', '2026-10-25T00:30:05Z'],
    ['Europe/Rome', '2026-10-25 2:30:00', '2026-10-25T01:30:00.000Z', '2026-10-25T01:30:05Z'],
    ['Europe/Rome', '2026-10-25 2:59:50', '2026-10-25T00:59:50.000Z', '2026-10-25T00:59:55Z'],
    ['Europe/Rome', '2026-10-25 2:0:10', '2026-10-25T01:00:10.000Z', '2026-10-25T01:00:15Z'],
    ['Australia/Lord_Howe', '2026-4-5 1:45:00', '2026-04-04T14:45:00.000Z', '2026-04-04T14:45:05Z'],
    ['Australia/Lord_Howe', '2026-4-5 1:45:00', '2026-04-04T15:15:00.000Z', '2026-04-04T15:15:05Z'],
    ['Europe/Rome', '2026-2-31 2:30:00', '2026-2-31 2:30:00', '2026-03-03T01:30:05Z'],
    ['Europe/Rome', '2026-10-25 3:30:00', '2026-10-25T02:30:00.000Z', '2026-10-25T02:30:05Z'],
  ])('parses device-local time in %s: %s', (timezone, time, expected, receivedAt) => {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('vite-node/cli'),
        fileURLToPath(new URL('../test/venusMiniTime.ts', import.meta.url)),
        time,
        ...(receivedAt ? [receivedAt] : []),
      ],
      { env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 20000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ deviceTime: expected });
  });
});
