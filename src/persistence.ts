import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import logger from './logger.js';
import { CycleRecord, LatchCandidate } from './cellBalancing.js';
import { PERSIST_THROTTLE_MS, PERSIST_SCHEMA_VERSION } from './constants.js';

/**
 * The only runtime filesystem access in the project.
 *
 * Charge-cycle history has to outlive the process: comparing the spread at the
 * top of charge from one day to the next is the whole point, and an add-on
 * update must not reset it. Everything else the diagnostics publish is
 * recomputed from the next poll and needs no storage.
 */

const DEFAULT_DATA_DIR = '/data';
const SUBDIRECTORY = 'cell-balancing';

export interface PersistenceProbe {
  available: boolean;
  dir?: string;
  reason?: string;
}

export interface PersistedRecord {
  schemaVersion: number;
  cycles: CycleRecord[];
  msAboveThreshold: number;
  msAboveHighThreshold: number;
  localDate?: string;
  minSocPct?: number;
  /**
   * The latched values themselves, not just the cycle history. Without these
   * the sensors gated on persistence go unknown after every restart until the
   * next full charge — which would make gating them on storage pointless.
   */
  crossing?: LatchCandidate;
  rested?: LatchCandidate;
  savedAt: string;
}

/**
 * Decide whether there is somewhere durable to write.
 *
 * The subtle case is the standalone Docker image: it declares no VOLUME, has no
 * /data, and runs as root, so simply creating the directory would succeed — into
 * the container's writable layer, which `docker compose pull` throws away. That
 * is precisely the update this file exists to survive, so a default directory we
 * had to create ourselves counts as *not* available. An explicitly configured
 * directory is taken at face value: asking for it is the user saying they meant
 * it.
 */
export function probeDataDir(
  env: NodeJS.ProcessEnv = process.env,
  defaultDir: string = DEFAULT_DATA_DIR,
): PersistenceProbe {
  const configured = env.HM2MQTT_DATA_DIR;
  const base = configured ?? defaultDir;

  if (configured == null && !fs.existsSync(base)) {
    return {
      available: false,
      reason:
        `${base} does not exist. Cell balancing history needs somewhere durable to live: ` +
        `mount a volume at ${base}, or set HM2MQTT_DATA_DIR to a directory that persists.`,
    };
  }

  const dir = path.join(base, SUBDIRECTORY);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probeFile = path.join(dir, '.write-test');
    fs.writeFileSync(probeFile, '');
    fs.unlinkSync(probeFile);
    return { available: true, dir };
  } catch (error) {
    return {
      available: false,
      reason: `${dir} is not writable (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

let probed: PersistenceProbe | undefined;

/**
 * Memoized so the probe runs once, on first use. Deliberately lazy rather than
 * a module-level side effect: discovery consults this through a predicate that
 * is called on every publish, so there is no need to touch the filesystem while
 * modules are still being imported.
 */
export function getPersistence(): PersistenceProbe {
  if (probed == null) {
    probed = probeDataDir();
    if (probed.available) {
      logger.info(`Cell balancing history will be stored in ${probed.dir}`);
    } else {
      logger.info(`Cell balancing history is disabled: ${probed.reason}`);
    }
  }
  return probed;
}

export function isPersistenceAvailable(): boolean {
  return getPersistence().available;
}

/** Test seam. */
export function resetPersistenceProbe(override?: PersistenceProbe): void {
  probed = override;
  pending.clear();
  lastWriteAt.clear();
  lastWritten.clear();
}

function fileFor(deviceType: string, deviceId: string): string | undefined {
  const { available, dir } = getPersistence();
  if (!available || dir == null) {
    return undefined;
  }
  // deviceId comes straight from a DEVICE_n environment variable, so it is
  // arbitrary user input. Sanitising stops a path separator escaping the
  // directory the probe blessed, but it is many-to-one — 'ab:cd' and 'ab_cd'
  // both become 'ab_cd' — so a short digest of the originals keeps two devices
  // from silently sharing one history file.
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
  const digest = createHash('sha256').update(`${deviceType}\u0000${deviceId}`).digest('hex');
  return path.join(dir, `${safe(deviceType)}_${safe(deviceId)}-${digest.slice(0, 8)}.json`);
}

export function loadRecord(deviceType: string, deviceId: string): PersistedRecord | undefined {
  const file = fileFor(deviceType, deviceId);
  if (file == null || !fs.existsSync(file)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schemaVersion !== PERSIST_SCHEMA_VERSION) {
      // Either older than we understand or written by a newer version we have
      // been rolled back from. Starting fresh beats crashing on it.
      logger.warn(
        `Ignoring cell balancing history in ${file}: schema version ${parsed?.schemaVersion} is not ${PERSIST_SCHEMA_VERSION}`,
      );
      return undefined;
    }
    const counter = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return {
      ...parsed,
      cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
      msAboveThreshold: counter(parsed.msAboveThreshold),
      msAboveHighThreshold: counter(parsed.msAboveHighThreshold),
    };
  } catch (error) {
    logger.warn(`Could not read cell balancing history from ${file}:`, error);
    return undefined;
  }
}

const pending = new Map<string, PersistedRecord>();
const lastWriteAt = new Map<string, number>();
const lastWritten = new Map<string, PersistedRecord>();

function writeNow(file: string, record: PersistedRecord): void {
  const tmp = `${file}.tmp`;
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(record));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);

    // Without this the rename itself can be lost after a power cut even though
    // the file contents were flushed.
    try {
      const dirFd = fs.openSync(path.dirname(file), 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Directory fsync is not supported everywhere; the rename is still atomic.
    }

    lastWriteAt.set(file, Date.now());
    lastWritten.set(file, record);
    pending.delete(file);
  } catch (error) {
    // Stamp the attempt even though it failed, so a permanently unwritable
    // filesystem — the read-only mount or full SD card this throttle exists for
    // — retries on the throttle interval rather than on every single poll, with
    // a warning each time.
    lastWriteAt.set(file, Date.now());
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Nothing useful to do; the next write overwrites it anyway.
    }
    logger.warn(`Could not write cell balancing history to ${file}:`, error);
  }
}

/** Compare two records ignoring the timestamp, which changes on every sample. */
function sameContent(a: PersistedRecord | undefined, b: PersistedRecord): boolean {
  if (a == null) {
    return false;
  }
  const strip = ({ savedAt: _savedAt, ...rest }: PersistedRecord) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/**
 * Store a record. Written immediately when a charge cycle completes, otherwise
 * at most once per throttle interval — most add-on installs run from an SD card,
 * and the running counters change on every poll.
 */
export function saveRecord(
  deviceType: string,
  deviceId: string,
  record: PersistedRecord,
  { immediate = false }: { immediate?: boolean } = {},
): void {
  const file = fileFor(deviceType, deviceId);
  if (file == null) {
    return;
  }

  // A pack sitting idle produces an identical record every poll. Writing it
  // would put an fsync on the SD card every throttle interval for nothing.
  if (!immediate && sameContent(lastWritten.get(file), record)) {
    return;
  }

  pending.set(file, record);
  const last = lastWriteAt.get(file);
  if (immediate || last == null || Date.now() - last >= PERSIST_THROTTLE_MS) {
    writeNow(file, record);
  }
}

/** Write anything the throttle is still holding. */
export function flushPersistence(): void {
  // writeNow deletes the entry it just wrote; removing the current key during
  // Map iteration is well defined, so this needs no snapshot.
  for (const [file, record] of pending) {
    writeNow(file, record);
  }
}
