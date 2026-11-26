import { CommunicationDiagnostics } from './communicationDiagnostics.js';
import type { Device } from './types.js';

describe('CommunicationDiagnostics', () => {
  const device: Device = {
    deviceType: 'JPLS-8H',
    deviceId: 'test-device',
  };

  const timestamp = Date.parse('2026-11-25T20:00:00Z');

  let diagnostics: CommunicationDiagnostics;

  beforeEach(() => {
    diagnostics = new CommunicationDiagnostics();
  });

  test('initializes all counters to zero', () => {
    expect(diagnostics.getSnapshot(device)).toEqual({
      totalTimeouts: 0,
      consecutiveTimeouts: 0,
      receivedMessages: 0,
      lastMessageAt: null,
      lastTimeoutAt: null,
    });
  });

  test('records timeout events', () => {
    const result = diagnostics.recordTimeout(device, timestamp);

    expect(result.totalTimeouts).toBe(1);
    expect(result.consecutiveTimeouts).toBe(1);
    expect(result.lastTimeoutAt).toBe('2026-11-25T20:00:00.000Z');
  });

  test('counts consecutive timeout events', () => {
    diagnostics.recordTimeout(device, timestamp);
    diagnostics.recordTimeout(device, timestamp + 1000);
    diagnostics.recordTimeout(device, timestamp + 2000);

    const stats = diagnostics.getSnapshot(device);

    expect(stats.totalTimeouts).toBe(3);
    expect(stats.consecutiveTimeouts).toBe(3);
  });

  test('resets consecutive timeouts after a device message', () => {
    diagnostics.recordTimeout(device, timestamp);
    diagnostics.recordTimeout(device, timestamp + 1000);

    const stats = diagnostics.recordMessage(device, timestamp + 2000);

    expect(stats.totalTimeouts).toBe(2);
    expect(stats.consecutiveTimeouts).toBe(0);
    expect(stats.receivedMessages).toBe(1);
  });

  test('records the most recent device message timestamp', () => {
    diagnostics.recordMessage(device, timestamp);
    diagnostics.recordMessage(device, timestamp + 1000);

    const stats = diagnostics.getSnapshot(device);

    expect(stats.receivedMessages).toBe(2);
    expect(stats.lastMessageAt).toBe('2026-11-25T20:00:01.000Z');
  });

  test('keeps cumulative timeouts across recovery', () => {
    diagnostics.recordTimeout(device, timestamp);
    diagnostics.recordMessage(device, timestamp + 1000);
    diagnostics.recordTimeout(device, timestamp + 2000);

    const stats = diagnostics.getSnapshot(device);

    expect(stats.totalTimeouts).toBe(2);
    expect(stats.consecutiveTimeouts).toBe(1);
    expect(stats.receivedMessages).toBe(1);
  });

  test('isolates devices with different identifiers', () => {
    const otherDevice = {
      ...device,
      deviceId: 'another-device',
    };

    diagnostics.recordTimeout(device, timestamp);

    expect(diagnostics.getSnapshot(otherDevice).totalTimeouts).toBe(0);
  });

  test('isolates devices with different device types', () => {
    const otherDevice = {
      ...device,
      deviceType: 'HMA-1',
    };

    diagnostics.recordTimeout(device, timestamp);

    expect(diagnostics.getSnapshot(otherDevice).totalTimeouts).toBe(0);
  });

  test('returns snapshots without exposing mutable state', () => {
    const snapshot = diagnostics.recordTimeout(device, timestamp);

    snapshot.totalTimeouts = 999;

    expect(diagnostics.getSnapshot(device).totalTimeouts).toBe(1);
  });

  test('does not retain statistics across instances', () => {
    diagnostics.recordTimeout(device, timestamp);

    const freshDiagnostics = new CommunicationDiagnostics();

    expect(freshDiagnostics.getSnapshot(device).totalTimeouts).toBe(0);
  });

  test('uses the current timestamp when recording a timeout', () => {
    const before = Date.now();
    const result = diagnostics.recordTimeout(device);
    const after = Date.now();

    const recorded = Date.parse(result.lastTimeoutAt!);

    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });

  test('uses the current timestamp when recording a message', () => {
    const before = Date.now();
    const result = diagnostics.recordMessage(device);
    const after = Date.now();

    const recorded = Date.parse(result.lastMessageAt!);

    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});
