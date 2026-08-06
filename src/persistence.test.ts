import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  flushPersistence,
  loadRecord,
  PersistedRecord,
  probeDataDir,
  resetPersistenceProbe,
  saveRecord,
} from './persistence.js';
import { PERSIST_SCHEMA_VERSION } from './constants.js';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hm2mqtt-persist-'));
}

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
    saveRecord('VNSD-0', '../../escape', record({ msAboveThreshold: 7 }), { immediate: true });
    const written = fs.readdirSync(dir);
    expect(written).toEqual(['VNSD-0_______escape.json']);
    expect(loadRecord('VNSD-0', '../../escape')?.msAboveThreshold).toBe(7);
  });

  it('ignores a record written by a different schema version', () => {
    saveRecord('VNSD-0', 'venus1', record(), { immediate: true });
    const file = path.join(dir, 'VNSD-0_venus1.json');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 999, cycles: [{}] }));
    expect(loadRecord('VNSD-0', 'venus1')).toBeUndefined();
  });

  it('survives a corrupt file', () => {
    const file = path.join(dir, 'VNSD-0_venus1.json');
    fs.writeFileSync(file, '{not json');
    expect(() => loadRecord('VNSD-0', 'venus1')).not.toThrow();
    expect(loadRecord('VNSD-0', 'venus1')).toBeUndefined();
  });

  it('returns nothing when no record was ever written', () => {
    expect(loadRecord('VNSD-0', 'never')).toBeUndefined();
  });

  it('leaves the previous record intact if the process dies before the rename', () => {
    saveRecord('VNSD-0', 'venus1', record({ msAboveThreshold: 100 }), { immediate: true });
    // Simulate a half-finished write: the temp file exists, the real one is
    // untouched. This is the state a power cut mid-write leaves behind.
    const file = path.join(dir, 'VNSD-0_venus1.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(record({ msAboveThreshold: 999 })));
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
