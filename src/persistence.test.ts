import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import './device/registry.js';
import {
  flushPersistence,
  loadRecord,
  loadSettings,
  PersistedRecord,
  probeDataDir,
  resetPersistenceProbe,
  resetSettingsProbe,
  saveRecord,
  saveSettings,
} from './persistence.js';
import { DEFAULT_TOPIC_PREFIX, PERSIST_SCHEMA_VERSION } from './constants.js';
import { DeviceManager } from './deviceManager.js';
import { parseMessage } from './parser.js';

const createdDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm2mqtt-persist-'));
  createdDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function record(overrides: Partial<PersistedRecord> = {}): PersistedRecord {
  return {
    schemaVersion: PERSIST_SCHEMA_VERSION,
    cycles: [],
    msAboveThreshold: 0,
    msAboveHighThreshold: 0,
    savedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('probeDataDir', () => {
  afterEach(() => resetPersistenceProbe());

  it('accepts a writable directory', () => {
    const dir = tempDir();
    const probe = probeDataDir({ HM2MQTT_DATA_DIR: dir } as NodeJS.ProcessEnv);
    expect(probe.available).toBe(true);
    expect(probe.dir).toBe(path.join(dir, 'cell-balancing'));
  });

  it('reports unavailable rather than throwing on a read-only directory', () => {
    const dir = tempDir();
    fs.chmodSync(dir, 0o500);
    try {
      let probe: ReturnType<typeof probeDataDir>;
      expect(() => {
        probe = probeDataDir({ HM2MQTT_DATA_DIR: dir } as NodeJS.ProcessEnv);
      }).not.toThrow();
      // Running as root defeats permission bits, which is exactly how the
      // container runs; only assert the shape when the bits actually bite.
      if (!probe!.available) {
        expect(probe!.reason).toContain('not writable');
      }
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });

  it('refuses a default directory it would have had to create itself', () => {
    // The standalone image declares no VOLUME, has no /data and runs as root,
    // so mkdir would succeed into the container's writable layer and the
    // history would vanish on the next `docker compose pull` — the very update
    // persistence exists to survive.
    const missing = path.join(tempDir(), 'definitely-not-mounted');
    const probe = probeDataDir({} as NodeJS.ProcessEnv, missing);
    expect(probe.available).toBe(false);
    expect(probe.reason).toContain('does not exist');
    // And it must not have quietly created it on the way to saying no.
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('accepts a default directory that is already mounted', () => {
    const mounted = tempDir();
    const probe = probeDataDir({} as NodeJS.ProcessEnv, mounted);
    expect(probe.available).toBe(true);
    expect(probe.dir).toBe(path.join(mounted, 'cell-balancing'));
  });

  it('creates an explicitly configured directory, because asking for it is intent', () => {
    const dir = path.join(tempDir(), 'nested', 'deeper');
    const probe = probeDataDir({ HM2MQTT_DATA_DIR: dir } as NodeJS.ProcessEnv);
    expect(probe.available).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cell-balancing'))).toBe(true);
  });
});

describe('record storage', () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
    resetPersistenceProbe({ available: true, dir });
  });

  afterEach(() => resetPersistenceProbe());

  it('round-trips a record', () => {
    saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 1234 }), { immediate: true });
    expect(loadRecord('VNSD-0', 'venus1')?.msAboveThreshold).toBe(1234);
  });

  it('keeps devices apart', () => {
    saveRecord('VNSD-0', 'a', record({ msAboveThreshold: 1 }), { immediate: true });
    saveRecord('VNSD-0', 'b', record({ msAboveThreshold: 2 }), { immediate: true });
    expect(loadRecord('VNSD-0', 'a')?.msAboveThreshold).toBe(1);
    expect(loadRecord('VNSD-0', 'b')?.msAboveThreshold).toBe(2);
  });

  it('cannot be made to write outside its directory', () => {
    // deviceId comes from a DEVICE_n environment variable, so it is arbitrary.
    // Enough `..` segments to climb past the device type it is glued to and
    // then out of the storage directory itself — a shorter run is swallowed by
    // the prefix and would pass whether or not anything sanitises the name.
    const parent = tempDir();
    const inner = path.join(parent, 'cell-balancing');
    fs.mkdirSync(inner);
    resetPersistenceProbe({ available: true, dir: inner });

    const deviceId = '../../../escape';
    saveRecord('VNSD-0', deviceId, record({ msAboveThreshold: 7 }), { immediate: true });

    expect(fs.readdirSync(parent)).toEqual(['cell-balancing']);
    const written = fs.readdirSync(inner);
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('/');
    expect(written[0]).not.toContain('..');
    expect(loadRecord('VNSD-0', deviceId)?.msAboveThreshold).toBe(7);
  });

  it('keeps devices apart even when sanitising collapses their ids', () => {
    // Sanitising is many-to-one, so without a digest these two would share one
    // history file and silently merge.
    saveRecord('VNSD-0', 'ab:cd', record({ msAboveThreshold: 1 }), { immediate: true });
    saveRecord('VNSD-0', 'ab_cd', record({ msAboveThreshold: 2 }), { immediate: true });
    expect(fs.readdirSync(dir)).toHaveLength(2);
    expect(loadRecord('VNSD-0', 'ab:cd')?.msAboveThreshold).toBe(1);
    expect(loadRecord('VNSD-0', 'ab_cd')?.msAboveThreshold).toBe(2);
  });

  // The filename carries a digest, so tests that need the path ask the
  // directory for it rather than hardcoding one.
  const fileFor = (deviceType: string, deviceId: string) => {
    saveRecord(deviceType, deviceId, record(), { immediate: true });
    return path.join(dir, fs.readdirSync(dir)[0]);
  };

  it('ignores a record written by a different schema version', () => {
    const file = fileFor('VNSD-0', 'venus1');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 999, cycles: [{}] }));
    expect(loadRecord('VNSD-0', 'venus1')).toBeUndefined();
  });

  it('survives a corrupt file', () => {
    const file = fileFor('VNSD-0', 'venus1');
    fs.writeFileSync(file, '{not json');
    expect(() => loadRecord('VNSD-0', 'venus1')).not.toThrow();
    expect(loadRecord('VNSD-0', 'venus1')).toBeUndefined();
  });

  it('returns nothing when no record was ever written', () => {
    expect(loadRecord('VNSD-0', 'never')).toBeUndefined();
  });

  it('leaves the previous record intact when a write cannot complete', () => {
    saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 100 }), { immediate: true });

    // The whole point of writing to the side and renaming: if the new contents
    // never make it into place, the old record is still there. Writing the file
    // directly would instead truncate it and lose everything.
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    });
    try {
      expect(() =>
        saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 999 }), { immediate: true }),
      ).not.toThrow();
    } finally {
      rename.mockRestore();
    }

    expect(loadRecord('VNSD-0', 'venus1')?.msAboveThreshold).toBe(100);
  });

  it('throttles the running counters but flushes on demand', () => {
    saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 1 }), { immediate: true });
    // Immediately afterwards, so the throttle window is still open.
    saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 2 }));
    expect(loadRecord('VNSD-0', 'venus1')?.msAboveThreshold).toBe(1);

    // What the SIGTERM handler does on an add-on update.
    flushPersistence();
    expect(loadRecord('VNSD-0', 'venus1')?.msAboveThreshold).toBe(2);
  });

  it('does nothing at all when persistence is unavailable', () => {
    resetPersistenceProbe({ available: false, reason: 'test' });
    expect(() => saveRecord('VNSD-0', 'venus1', record(), { immediate: true })).not.toThrow();
    expect(loadRecord('VNSD-0', 'venus1')).toBeUndefined();
  });
});

describe('remembered settings', () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
    resetSettingsProbe({ available: true, dir });
  });

  afterEach(() => resetSettingsProbe());

  it('round-trips and merges settings per device', () => {
    saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
    saveSettings('HMG-50', 'a', { other: true });
    saveSettings('HMG-50', 'b', { maxChargingPower: 800 });
    // A fresh process reads them back from the files.
    resetSettingsProbe({ available: true, dir });
    expect(loadSettings('HMG-50', 'a')).toEqual({ maxChargingPower: 1200, other: true });
    expect(loadSettings('HMG-50', 'b')).toEqual({ maxChargingPower: 800 });
  });

  it('writes only when something changed', () => {
    saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
    const [file] = fs.readdirSync(dir);
    const stamp = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(path.join(dir, file), stamp, stamp);
    saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
    expect(fs.statSync(path.join(dir, file)).mtime).toEqual(stamp);
  });

  it('retries a failed write, but not on every poll', () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('read-only file system'), { code: 'EROFS' });
    });
    try {
      saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
      saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
      expect(rename).toHaveBeenCalledTimes(1);
      rename.mockRestore();
      // the same value again once the disk is back and a minute has passed
      jest.advanceTimersByTime(60_000);
      saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
    } finally {
      rename.mockRestore();
      jest.useRealTimers();
    }
    resetSettingsProbe({ available: true, dir });
    expect(loadSettings('HMG-50', 'a')).toEqual({ maxChargingPower: 1200 });
  });

  it('is empty without storage and for a file it cannot read', () => {
    fs.writeFileSync(path.join(dir, 'garbage'), '');
    saveSettings('HMG-50', 'a', { maxChargingPower: 1200 });
    const file = fs.readdirSync(dir).find(name => name !== 'garbage')!;
    fs.writeFileSync(path.join(dir, file), '{not json');
    resetSettingsProbe({ available: true, dir });
    expect(loadSettings('HMG-50', 'a')).toEqual({});

    resetSettingsProbe({ available: false, reason: 'test' });
    saveSettings('HMG-50', 'c', { maxChargingPower: 1200 });
    expect(loadSettings('HMG-50', 'c')).toEqual({});
  });

  it('restores the Venus C/E maximum charging power after a restart', () => {
    const device = { deviceType: 'HMG-50', deviceId: 'venus123' };
    const config = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [device],
    };
    // HMG 156 reports mcp_w=-2500 instead of the value set, which is ignored.
    const cd1 = (deviceType: string) =>
      parseMessage(
        'tot_i=1,tot_o=212,ele_d=0,ele_m=1,grd_d=212,grd_m=212,inc_d=0,inc_m=0,grd_f=0,grd_o=423,grd_t=3,gct_s=1,cel_s=2,cel_p=483,cel_c=94,err_t=0,err_a=0,dev_n=156,grd_y=0,wor_m=0,inc_a=0,mcp_w=-2500',
        deviceType,
        device.deviceId,
      )['data'];

    const first = new DeviceManager(config, () => {});
    first.updateDeviceState(device, 'data', () => ({ maxChargingPower: 1200 }));

    resetSettingsProbe({ available: true, dir });
    const published: object[] = [];
    const second = new DeviceManager(config, (_device, _path, state) => published.push(state));
    second.updateDeviceState(device, 'data', () => cd1('HMG-50'));
    expect(published.at(-1)).toHaveProperty('maxChargingPower', 1200);

    // Only the HMG remembers it.
    const other = { deviceType: 'VNSE3-0', deviceId: 'venus123' };
    const third = new DeviceManager({ ...config, devices: [other] }, () => {});
    third.updateDeviceState(other, 'data', () => ({ maxChargingPower: 1200 }));
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });
});
