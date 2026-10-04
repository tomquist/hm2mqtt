/**
 * Memory benchmark for the shipped hm2mqtt build.
 *
 * Runs `dist/index.js` the way the add-on does — a separate process configured
 * purely through environment variables — against an in-process broker and
 * simulated devices that answer every poll with a real reading. While it runs,
 * the process's memory is sampled from /proc once per second.
 *
 *   npm run build
 *   npx vite-node test/memory/bench.ts -- --duration 120 --devices 3
 *
 * Options:
 *   --duration <s>     how long to measure (default 120)
 *   --devices <n>      simulated devices per fixture type (default 1)
 *   --poll <s>         MQTT_POLLING_INTERVAL; short so a run sees many polls (default 2)
 *   --proxy            also enable the built-in MQTT proxy
 *   --log-level <lvl>  LOG_LEVEL of the measured process (default info)
 *   --runs <n>         repeat the measurement and report each run (default 1)
 *   --json <file>      also write the per-run summaries as JSON
 *
 * Linux only: it reads /proc/<pid>/status.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { startBroker } from '../e2e/harness/broker.js';
import { startSimulatedDevice, SimulatedDevice } from '../e2e/harness/device.js';
import { REPO_ROOT } from '../e2e/harness/env.js';
import { deviceFixtures } from '../fixtures/devices.js';

const ENTRY_POINT = resolve(REPO_ROOT, 'dist/index.js');
const PROBE = resolve(REPO_ROOT, 'test/memory/probe.cjs');
const MB = 1024 * 1024;

interface Options {
  duration: number;
  devices: number;
  poll: number;
  proxy: boolean;
  logLevel: string;
  runs: number;
  json?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    duration: 120,
    devices: 1,
    poll: 2,
    proxy: false,
    logLevel: 'info',
    runs: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--duration':
        options.duration = Number(next());
        break;
      case '--devices':
        options.devices = Number(next());
        break;
      case '--poll':
        options.poll = Number(next());
        break;
      case '--proxy':
        options.proxy = true;
        break;
      case '--log-level':
        options.logLevel = next();
        break;
      case '--runs':
        options.runs = Number(next());
        break;
      case '--json':
        options.json = next();
        break;
      case '--':
        break;
      default:
        throw new Error(`Unknown option ${arg}`);
    }
  }
  return options;
}

interface ProcSample {
  /** Seconds since the process was spawned. */
  t: number;
  rss: number;
  rssAnon: number;
  hwm: number;
  threads: number;
}

interface HeapSample {
  t: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  mallocedMemory: number;
}

function readProcStatus(pid: number): Omit<ProcSample, 't'> | undefined {
  let status: string;
  try {
    status = readFileSync(`/proc/${pid}/status`, 'utf8');
  } catch {
    return undefined;
  }
  const field = (name: string) => {
    const match = new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(status);
    return match ? Number(match[1]) : NaN;
  };
  return {
    rss: field('VmRSS') * 1024,
    rssAnon: field('RssAnon') * 1024,
    hwm: field('VmHWM') * 1024,
    threads: field('Threads'),
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Least-squares slope, in units of `y` per minute. */
function slopePerMinute(points: Array<{ t: number; y: number }>): number {
  const n = points.length;
  if (n < 2) {
    return 0;
  }
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.y - meanY);
    den += (p.t - meanT) ** 2;
  }
  return den === 0 ? 0 : (num / den) * 60;
}

export interface RunSummary {
  startupRssMb: number;
  steadyRssMb: number;
  steadyRssAnonMb: number;
  peakRssMb: number;
  rssSlopeMbPerMin: number;
  threads: number;
  steadyHeapUsedMb?: number;
  heapUsedSlopeMbPerMin?: number;
  steadyExternalMb?: number;
  messagesReceived: number;
}

async function measureOnce(options: Options): Promise<RunSummary> {
  const broker = await startBroker();
  const configured = deviceFixtures.flatMap(fixture =>
    Array.from({ length: options.devices }, () => fixture),
  );
  const deviceEnv: Record<string, string> = {};
  const devices: SimulatedDevice[] = await Promise.all(
    configured.map((fixture, index) => {
      const deviceId = `bench${String(index).padStart(4, '0')}`;
      deviceEnv[`DEVICE_${index}`] = `${fixture.deviceType}:${deviceId}`;
      return startSimulatedDevice(broker.url, fixture, deviceId);
    }),
  );

  // Count what hm2mqtt publishes, so a run that silently stopped working is
  // never mistaken for one that got cheaper.
  let messagesReceived = 0;
  const countingStart = broker.published.length;

  const child = spawn(process.execPath, ['--require', PROBE, ENTRY_POINT], {
    cwd: REPO_ROOT,
    env: {
      PATH: process.env.PATH,
      ...deviceEnv,
      MQTT_BROKER_URL: broker.url,
      MQTT_TOPIC_PREFIX: 'bench',
      MQTT_POLLING_INTERVAL: String(options.poll),
      MQTT_RESPONSE_TIMEOUT: '10',
      MQTT_PROXY_ENABLED: options.proxy ? 'true' : 'false',
      MQTT_PROXY_PORT: '0',
      LOG_LEVEL: options.logLevel,
      HM2MQTT_DATA_DIR: '/nonexistent/hm2mqtt-bench',
      DOTENV_CONFIG_PATH: '/dev/null',
      HM2MQTT_MEMORY_PROBE_FD: '3',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', chunk => (output += chunk.toString()));
  child.stderr?.on('data', chunk => (output += chunk.toString()));

  const heapSamples: HeapSample[] = [];
  const spawnedAt = Date.now();
  let probeBuffer = '';
  (child.stdio[3] as Readable).on('data', (chunk: Buffer) => {
    probeBuffer += chunk.toString();
    let newline: number;
    while ((newline = probeBuffer.indexOf('\n')) >= 0) {
      const line = probeBuffer.slice(0, newline);
      probeBuffer = probeBuffer.slice(newline + 1);
      try {
        const sample = JSON.parse(line);
        heapSamples.push({ ...sample, t: (sample.t - spawnedAt) / 1000 });
      } catch {
        // A torn line at shutdown; ignore it.
      }
    }
  });

  let exited = false;
  child.on('exit', () => (exited = true));

  const procSamples: ProcSample[] = [];
  const pid = child.pid as number;
  await new Promise<void>(resolveRun => {
    const timer = setInterval(() => {
      const t = (Date.now() - spawnedAt) / 1000;
      const status = exited ? undefined : readProcStatus(pid);
      if (status) {
        procSamples.push({ t, ...status });
      }
      if (exited || t >= options.duration) {
        clearInterval(timer);
        resolveRun();
      }
    }, 1000);
  });

  messagesReceived = broker.published
    .slice(countingStart)
    .filter(topic => topic.startsWith('bench/')).length;

  if (exited) {
    throw new Error(`hm2mqtt exited during the measurement:\n${output.slice(-4000)}`);
  }
  child.kill('SIGTERM');
  await new Promise<void>(resolveExit => {
    if (exited) {
      resolveExit();
      return;
    }
    const kill = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('exit', () => {
      clearTimeout(kill);
      resolveExit();
    });
  });
  await Promise.all(devices.map(device => device.stop()));
  await broker.stop();

  // Startup is everything up to 10 s; steady state is the last half of the run.
  const startup = procSamples.filter(s => s.t <= 10);
  const half = options.duration / 2;
  const steady = procSamples.filter(s => s.t >= half);
  const steadyHeap = heapSamples.filter(s => s.t >= half);

  return {
    startupRssMb: (startup.at(-1)?.rss ?? NaN) / MB,
    steadyRssMb: median(steady.map(s => s.rss)) / MB,
    steadyRssAnonMb: median(steady.map(s => s.rssAnon)) / MB,
    peakRssMb: Math.max(...procSamples.map(s => s.hwm)) / MB,
    rssSlopeMbPerMin: slopePerMinute(steady.map(s => ({ t: s.t, y: s.rss / MB }))),
    threads: median(steady.map(s => s.threads)),
    steadyHeapUsedMb: steadyHeap.length ? median(steadyHeap.map(s => s.heapUsed)) / MB : undefined,
    heapUsedSlopeMbPerMin: steadyHeap.length
      ? slopePerMinute(steadyHeap.map(s => ({ t: s.t, y: s.heapUsed / MB })))
      : undefined,
    steadyExternalMb: steadyHeap.length ? median(steadyHeap.map(s => s.external)) / MB : undefined,
    messagesReceived,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`${ENTRY_POINT} is missing. Run \`npm run build\` first.`);
  }
  console.log(
    `Measuring ${ENTRY_POINT} (node ${process.version}) for ${options.duration}s: ` +
      `${options.devices * deviceFixtures.length} device(s), poll ${options.poll}s, ` +
      `proxy ${options.proxy ? 'on' : 'off'}, log level ${options.logLevel}`,
  );

  const summaries: RunSummary[] = [];
  for (let run = 1; run <= options.runs; run++) {
    // Runs must not overlap: each one measures a process on its own.
    // oxlint-disable-next-line no-await-in-loop
    const summary = await measureOnce(options);
    summaries.push(summary);
    const fmt = (value: number | undefined, digits = 1) =>
      value == null || Number.isNaN(value) ? 'n/a' : value.toFixed(digits);
    console.log(
      `run ${run}: startup RSS ${fmt(summary.startupRssMb)} MB | ` +
        `steady RSS ${fmt(summary.steadyRssMb)} MB (anon ${fmt(summary.steadyRssAnonMb)}) | ` +
        `peak ${fmt(summary.peakRssMb)} MB | RSS slope ${fmt(summary.rssSlopeMbPerMin, 3)} MB/min | ` +
        `heap ${fmt(summary.steadyHeapUsedMb)} MB (slope ${fmt(summary.heapUsedSlopeMbPerMin, 3)} MB/min) | ` +
        `external ${fmt(summary.steadyExternalMb)} MB | threads ${summary.threads} | ` +
        `published ${summary.messagesReceived}`,
    );
  }

  if (options.json) {
    writeFileSync(options.json, JSON.stringify({ options, summaries }, null, 2));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
