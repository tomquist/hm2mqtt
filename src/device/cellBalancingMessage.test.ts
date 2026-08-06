import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The diagnostics are gated by an environment variable read while the device
 * modules are imported, so every test here has to load the registry itself with
 * the flag already set.
 */
async function loadWithDiagnostics() {
  jest.resetModules();
  process.env.CELL_BALANCING_DIAGNOSTICS = 'true';
  process.env.POLL_CELL_DATA = 'true';

  await import('./registry.js');
  return {
    generateDiscoveryConfigs: (await import('../generateDiscoveryConfigs.js'))
      .generateDiscoveryConfigs,
    DeviceManager: (await import('../deviceManager.js')).DeviceManager,
    parseMessage: (await import('../parser.js')).parseMessage,
    persistence: await import('../persistence.js'),
    cellBalancingMessage: await import('./cellBalancingMessage.js'),
  };
}

const topics = {
  deviceTopicOld: 'hame_energy/VNSD-0/device/venus1/ctrl',
  deviceTopicNew: 'marstek_energy/VNSD-0/device/venus1/ctrl',
  publishTopic: 'hm2mqtt/VNSD-0/device/venus1',
  deviceControlTopicOld: 'hame_energy/VNSD-0/App/venus1/ctrl',
  deviceControlTopicNew: 'marstek_energy/VNSD-0/App/venus1/ctrl',
  controlSubscriptionTopic: 'hm2mqtt/VNSD-0/control/venus1',
  availabilityTopic: 'hm2mqtt/VNSD-0/availability/venus1',
};

const device = { deviceType: 'VNSD-0', deviceId: 'venus1' };

function bmsPayload(cells: number[], current: number): string {
  const voltages = cells.map((mv, i) => `b_vo${i + 1}=${mv}`).join(',');
  return (
    `b_ver=212,b_chv=571,b_soc=99,b_soh=100,b_cap=5120,b_vol=5223,b_cur=${current},` +
    `b_tem=250,b_tp1=18,b_tp2=19,b_tp3=18,b_tp4=19,${voltages}`
  );
}

describe('cell balancing discovery', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('advertises the live entities but withholds the cross-cycle ones without storage', async () => {
    const { generateDiscoveryConfigs, persistence } = await loadWithDiagnostics();
    persistence.resetPersistenceProbe({ available: false, reason: 'test' });

    const configs = generateDiscoveryConfigs(device, topics as any, {}, 'hm2mqtt', 'homeassistant');
    const published = configs.filter(c => c.config != null).map(c => c.topic);
    const removed = configs.filter(c => c.config == null).map(c => c.topic);

    expect(published.some(t => t.includes('cell_spread/'))).toBe(true);
    expect(published.some(t => t.includes('cell_mean_voltage_drift'))).toBe(true);
    expect(published.some(t => t.includes('balance_conditions_met'))).toBe(true);

    // Comparing spreads across days is meaningless if the history cannot
    // survive a restart, so those entities are removed rather than left stale.
    expect(removed.some(t => t.includes('cell_spread_at_crossing'))).toBe(true);
    expect(removed.some(t => t.includes('rested_cell_spread'))).toBe(true);
  });

  it('advertises the cross-cycle entities once storage is available', async () => {
    const { generateDiscoveryConfigs, persistence } = await loadWithDiagnostics();
    persistence.resetPersistenceProbe({
      available: true,
      dir: fs.mkdtempSync(path.join(os.tmpdir(), 'hm2mqtt-disc-')),
    });

    const configs = generateDiscoveryConfigs(device, topics as any, {}, 'hm2mqtt', 'homeassistant');
    const published = configs.filter(c => c.config != null).map(c => c.topic);

    expect(published.some(t => t.includes('cell_spread_at_crossing'))).toBe(true);
    expect(published.some(t => t.includes('rested_cell_spread'))).toBe(true);
  });

  it('removes every diagnostic entity when the feature is off', async () => {
    jest.resetModules();
    delete process.env.CELL_BALANCING_DIAGNOSTICS;
    process.env.POLL_CELL_DATA = 'true';
    await import('./registry.js');
    const { generateDiscoveryConfigs } = await import('../generateDiscoveryConfigs.js');

    const configs = generateDiscoveryConfigs(device, topics as any, {}, 'hm2mqtt', 'homeassistant');
    const published = configs.filter(c => c.config != null).map(c => c.topic);

    expect(published.some(t => t.includes('cell_spread/'))).toBe(false);
    expect(published.some(t => t.includes('balance_conditions_met'))).toBe(false);
  });
});

describe('cell balancing end to end', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('publishes derived state once per cell reading, and not per message', async () => {
    const { DeviceManager, parseMessage, persistence, cellBalancingMessage } =
      await loadWithDiagnostics();
    persistence.resetPersistenceProbe({ available: false, reason: 'test' });
    cellBalancingMessage.resetCellBalancingState();

    const onUpdate = jest.fn();
    const dm = new DeviceManager(
      {
        brokerUrl: 'mqtt://localhost',
        clientId: 'test',
        topicPrefix: 'hm2mqtt',
        autodiscoveryTopicPrefix: 'homeassistant',
        devices: [device],
      },
      onUpdate as any,
    );

    const applyBms = (cells: number[], current: number) => {
      const parsed = parseMessage(bmsPayload(cells, current), device.deviceType, device.deviceId);
      for (const [publishPath, state] of Object.entries(parsed)) {
        dm.updateDeviceState(device, publishPath, () => state as any);
      }
    };

    applyBms([3300, 3302, 3301, 3300], 50);

    const derivedCalls = onUpdate.mock.calls.filter((c: any[]) => c[1] === 'cellBalancing');
    expect(derivedCalls).toHaveLength(1);
    const state = derivedCalls[0][2] as any;
    expect(state.cellBalancing.spreadMv).toBe(2);
    expect(state.cellBalancing.meanMv).toBeCloseTo(3300.75, 6);
    // b_cur=50 read as deci-amps is 5 A in, so it is charging — but 3302 mV is
    // nowhere near the balance threshold.
    expect(state.cellBalancing.balanceConditionsMet).toBe(false);

    // A second, unrelated message must not republish the derived state.
    onUpdate.mockClear();
    dm.updateDeviceState(device, 'data', () => ({ batterySoc: 99 }) as any);
    expect(onUpdate.mock.calls.filter((c: any[]) => c[1] === 'cellBalancing')).toHaveLength(0);
  });

  it('reports the conditions met near the top of charge', async () => {
    const { DeviceManager, parseMessage, persistence, cellBalancingMessage } =
      await loadWithDiagnostics();
    persistence.resetPersistenceProbe({ available: false, reason: 'test' });
    cellBalancingMessage.resetCellBalancingState();

    const onUpdate = jest.fn();
    const dm = new DeviceManager(
      {
        brokerUrl: 'mqtt://localhost',
        clientId: 'test',
        topicPrefix: 'hm2mqtt',
        autodiscoveryTopicPrefix: 'homeassistant',
        devices: [device],
      },
      onUpdate as any,
    );

    const parsed = parseMessage(
      bmsPayload([3520, 3560, 3540, 3530], 20),
      device.deviceType,
      device.deviceId,
    );
    for (const [publishPath, state] of Object.entries(parsed)) {
      dm.updateDeviceState(device, publishPath, () => state as any);
    }

    const derived = onUpdate.mock.calls.filter((c: any[]) => c[1] === 'cellBalancing');
    const state = derived[derived.length - 1][2] as any;
    expect(state.cellBalancing.balanceConditionsMet).toBe(true);
    expect(state.cellBalancing.spreadMv).toBe(40);
    // Normalised: the 3560 cell owns most of the spread.
    const shares = state.cellBalancing.normalisedDeviations as number[];
    expect(Math.max(...shares)).toBeCloseTo((3560 - 3537.5) / 40, 6);
  });

  it('restores the cycle history from disk on restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm2mqtt-e2e-'));
    const { DeviceManager, parseMessage, persistence, cellBalancingMessage } =
      await loadWithDiagnostics();
    persistence.resetPersistenceProbe({ available: true, dir });
    cellBalancingMessage.resetCellBalancingState();

    persistence.saveRecord(
      device.deviceType,
      device.deviceId,
      {
        schemaVersion: 1,
        cycles: [
          {
            endedAt: '2026-08-05T20:00:00.000Z',
            minutesAboveThreshold: 120,
            minutesAboveHighThreshold: 30,
            restedSpreadMv: 7,
          },
        ],
        msAboveThreshold: 7_200_000,
        msAboveHighThreshold: 1_800_000,
        localDate: new Date().toLocaleDateString('en-CA'),
        savedAt: '2026-08-05T20:00:00.000Z',
      },
      { immediate: true },
    );

    const onUpdate = jest.fn();
    const dm = new DeviceManager(
      {
        brokerUrl: 'mqtt://localhost',
        clientId: 'test',
        topicPrefix: 'hm2mqtt',
        autodiscoveryTopicPrefix: 'homeassistant',
        devices: [device],
      },
      onUpdate as any,
    );

    const parsed = parseMessage(
      bmsPayload([3300, 3302, 3301, 3300], 0),
      device.deviceType,
      device.deviceId,
    );
    for (const [publishPath, state] of Object.entries(parsed)) {
      dm.updateDeviceState(device, publishPath, () => state as any);
    }

    const derived = onUpdate.mock.calls.filter((c: any[]) => c[1] === 'cellBalancing');
    const state = derived[derived.length - 1][2] as any;
    expect(state.cellBalancing.cycleCount).toBe(1);
    expect(state.cellBalancing.lastCycleEndedAt).toBe('2026-08-05T20:00:00.000Z');
    // Counters carry over; the same-day record is still today's.
    expect(state.cellBalancing.minutesAboveThreshold).toBe(120);
  });
});
