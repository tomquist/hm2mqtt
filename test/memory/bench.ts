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
 *   --samples <file>   also write every raw sample of the last run as JSON, e.g. to
 *                      check whether the heap's post-GC floor rises over a long run
 *   --node-arg <arg>   pass a flag to the measured node process (repeatable)
 *   --dist <dir>       build to measure, relative to the repo (default dist), so
 *                      two builds can be compared, e.g. one of the base branch:
 *                      git worktree add /tmp/base develop && (cd /tmp/base && npm ci && npm run build)
 *                      && mkdir -p .bench/base && cp -r /tmp/base/dist .bench/base/
 *   --runtime <name>   with --docker: node (default), bun or deno, the
 *                      command the image runs hm2mqtt with
 *   --docker <image>   run the measured process in this image instead, e.g.
 *                      node:26-alpine, the base of the published images. The
 *                      container shares the host network and mounts the repo
 *                      read-only; its memory is still read from the host's /proc.
 *
 * Linux only: it reads /proc/<pid>/status.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startBroker } from '../e2e/harness/broker.js';
import { startSimulatedDevice, SimulatedDevice } from '../e2e/harness/device.js';
import { REPO_ROOT } from '../e2e/harness/env.js';
import { deviceFixtures } from '../fixtures/devices.js';

const PROBE_PATH = 'test/memory/probe.cjs';
/** Must match MARKER in probe.cjs. */
const PROBE_MARKER = '@@hm2mqtt-memory-probe ';
const MB = 1024 * 1024;

interface Options {
  duration: number;
  devices: number;
  poll: number;
  proxy: boolean;
  logLevel: string;
  runs: number;
  json?: string;
  nodeArgs: string[];
  docker?: string;
  runtime: 'node' | 'bun' | 'deno';
  dist: string;
  samples?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    duration: 120,
    devices: 1,
    poll: 2,
    proxy: false,
    logLevel: 'info',
    runs: 1,
    nodeArgs: [],
    dist: 'dist',
    runtime: 'node',
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
      case '--node-arg':
        options.nodeArgs.push(next());
        break;
      case '--samples':
        options.samples = next();
        break;
      case '--runtime': {
        const runtime = next();
        if (runtime !== 'node' && runtime !== 'bun' && runtime !== 'deno') {
          throw new Error(`Unknown runtime ${runtime}`);
        }
        options.runtime = runtime;
        break;
      }
      case '--dist':
        options.dist = next();
        break;
      case '--docker':
        options.docker = next();
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

function containerPid(name: string): number {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Pid}}', name], {
    encoding: 'utf8',
  });
  const pid = Number(result.stdout?.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
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
  steadyHeapTotalMb?: number;
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

  const env: Record<string, string> = {
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
  };
  const nodeArgs = (root: string) => [
    ...options.nodeArgs,
    '--require',
    resolve(root, PROBE_PATH),
    resolve(root, options.dist, 'index.js'),
  ];

  /** The command line the container runs, for the runtime the image provides. */
  const runtimeCommand = (opts: Options, root: string) => {
    const probe = resolve(root, PROBE_PATH);
    const entry = resolve(root, opts.dist, 'index.js');
    switch (opts.runtime) {
      case 'bun':
        return ['bun', ...opts.nodeArgs, '--require', probe, entry];
      case 'deno':
        // The repo is mounted read-only: use its node_modules as they are and
        // do not try to write a lockfile.
        return [
          'deno',
          'run',
          '-A',
          '--no-lock',
          '--node-modules-dir=manual',
          ...opts.nodeArgs,
          '--preload',
          probe,
          entry,
        ];
      default:
        return ['node', ...nodeArgs(root)];
    }
  };

  const containerName = `hm2mqtt-memory-bench-${process.pid}-${Date.now()}`;
  const child = options.docker
    ? spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          containerName,
          '--network',
          'host',
          '-v',
          `${REPO_ROOT}:/app:ro`,
          '-w',
          '/app',
          ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
          // The runtime itself is the entrypoint, so the container's main process,
          // the one measured, is hm2mqtt and not an image's wrapper script.
          '--entrypoint',
          runtimeCommand(options, '/app')[0],
          options.docker,
          ...runtimeCommand(options, '/app').slice(1),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
    : spawn(process.execPath, nodeArgs(REPO_ROOT), {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  let output = '';
  const heapSamples: HeapSample[] = [];
  const spawnedAt = Date.now();
  child.stdout?.on('data', chunk => (output += chunk.toString()));
  let stderrBuffer = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString();
    let newline: number;
    while ((newline = stderrBuffer.indexOf('\n')) >= 0) {
      const line = stderrBuffer.slice(0, newline);
      stderrBuffer = stderrBuffer.slice(newline + 1);
      if (!line.startsWith(PROBE_MARKER)) {
        output += `${line}\n`;
        continue;
      }
      try {
        const sample = JSON.parse(line.slice(PROBE_MARKER.length));
        heapSamples.push({ ...sample, t: (sample.t - spawnedAt) / 1000 });
      } catch {
        // A torn line at shutdown; ignore it.
      }
    }
  });

  let exited = false;
  child.on('exit', () => (exited = true));

  const procSamples: ProcSample[] = [];
  // In a container, the process to measure is not the docker client we
  // spawned but the container's main process, as the host sees it.
  let pid = options.docker ? 0 : (child.pid as number);
  await new Promise<void>(resolveRun => {
    const timer = setInterval(() => {
      const t = (Date.now() - spawnedAt) / 1000;
      if (options.docker && pid === 0) {
        pid = containerPid(containerName);
      }
      const status = exited || pid === 0 ? undefined : readProcStatus(pid);
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
  if (options.docker) {
    spawnSync('docker', ['stop', '-t', '10', containerName], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
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

  if (options.samples) {
    writeFileSync(options.samples, JSON.stringify({ procSamples, heapSamples }));
  }

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
    steadyHeapTotalMb: steadyHeap.length
      ? median(steadyHeap.map(s => s.heapTotal)) / MB
      : undefined,
    heapUsedSlopeMbPerMin: steadyHeap.length
      ? slopePerMinute(steadyHeap.map(s => ({ t: s.t, y: s.heapUsed / MB })))
      : undefined,
    steadyExternalMb: steadyHeap.length ? median(steadyHeap.map(s => s.external)) / MB : undefined,
    messagesReceived,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const entryPoint = resolve(REPO_ROOT, options.dist, 'index.js');
  if (!existsSync(entryPoint)) {
    throw new Error(`${entryPoint} is missing. Run \`npm run build\` first.`);
  }
  console.log(
    `Measuring ${entryPoint} (${options.docker ?? `node ${process.version}`}) for ${options.duration}s: ` +
      `${options.devices * deviceFixtures.length} device(s), poll ${options.poll}s, ` +
      `proxy ${options.proxy ? 'on' : 'off'}, log level ${options.logLevel}` +
      (options.nodeArgs.length ? `, node ${options.nodeArgs.join(' ')}` : '') +
      (options.docker ? `, ${options.runtime} in ${options.docker}` : ''),
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
        `heap ${fmt(summary.steadyHeapUsedMb)}/${fmt(summary.steadyHeapTotalMb)} MB (slope ${fmt(summary.heapUsedSlopeMbPerMin, 3)} MB/min) | ` +
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
