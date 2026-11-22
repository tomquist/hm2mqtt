import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { abandonStart } from './stack.js';
import { WaitAbandoned, tail, waitFor } from './waitFor.js';

/**
 * Real device firmware, run in [marsemu](https://github.com/tomquist/marsemu).
 *
 * The simulated devices in `device.ts` answer polls with canned readings; an
 * emulated one runs the firmware itself, so it reports what the firmware
 * reports — including the values nobody thought to put in a fixture — and
 * applies the commands hm2mqtt sends. Firmware images are not redistributable,
 * so this is opt-in: it needs a marsemu install and a folder of images.
 *
 * - `MARSEMU`: how to run marsemu, e.g. `marsemu` or
 *   `/path/to/marsemu/.venv/bin/python -m marsemu`.
 * - `MARSEMU_FIRMWARE`: the folder the image paths below are relative to, laid
 *   out like the firmware archive (`VNSE3-0/Control/151/…bin`).
 * - `MARSEMU_DEVICES` (optional): which devices to run instead of
 *   {@link DEFAULT_EMULATED_DEVICES}, as `command:dir[,dir]` entries separated
 *   by `;`, e.g. `venusce:HMG-50/Control/156,HMG-50/BMS/216;run:HME-4/124`.
 *   Each directory holds one image; `command` is a marsemu command (`run` for
 *   the CT002/CT003).
 */
export interface EmulatedDeviceSpec {
  /** marsemu command: `b2500`, `venus3`, `venusa`, `venusd`, `venusce`, `venusmini`, `jupiter` or `run`. */
  command: string;
  /** Image directories relative to `MARSEMU_FIRMWARE`, in the command's order (control, then BMS). */
  images: string[];
}

/** One of each family hm2mqtt supports, small enough to run on a laptop. */
export const DEFAULT_EMULATED_DEVICES: EmulatedDeviceSpec[] = [
  { command: 'b2500', images: ['HMJ-2/116'] },
  { command: 'run', images: ['HME-3/122'] },
  { command: 'venus3', images: ['VNSE3-0/Control/151', 'VNSE3-0/BMS/115'] },
  { command: 'venusmini', images: ['VNSEMINI-0/Control/309'] },
];

export interface EmulatorSetup {
  command: string[];
  firmwareDir: string;
  devices: EmulatedDeviceSpec[];
}

export const MISSING_EMULATOR =
  'Set MARSEMU (how to run marsemu) and MARSEMU_FIRMWARE (a firmware folder) to run the firmware scenario.';

/** What the environment asks for, or undefined when the firmware scenario is not set up. */
export function emulatorSetup(): EmulatorSetup | undefined {
  const command = process.env.MARSEMU?.trim();
  const firmwareDir = process.env.MARSEMU_FIRMWARE?.trim();
  if (!command || !firmwareDir) {
    return undefined;
  }
  return {
    command: command.split(/\s+/),
    firmwareDir: resolve(firmwareDir),
    devices: process.env.MARSEMU_DEVICES
      ? parseDeviceList(process.env.MARSEMU_DEVICES)
      : DEFAULT_EMULATED_DEVICES,
  };
}

export function parseDeviceList(list: string): EmulatedDeviceSpec[] {
  return list
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [command, dirs] = entry.split(':', 2);
      if (!command || !dirs) {
        throw new Error(`MARSEMU_DEVICES entry "${entry}" is not command:dir[,dir]`);
      }
      return { command, images: dirs.split(',').map(dir => dir.trim()) };
    });
}

/** The image in `dir` (one `.bin` per version folder in the archive layout). */
export function findImage(firmwareDir: string, dir: string): string | undefined {
  const path = join(firmwareDir, dir);
  if (!existsSync(path)) {
    return undefined;
  }
  if (statSync(path).isFile()) {
    return path;
  }
  const image = readdirSync(path)
    .filter(name => name.endsWith('.bin'))
    .sort()[0];
  return image ? join(path, image) : undefined;
}

/**
 * The emulated device's identity, from the line marsemu prints once the
 * firmware subscribes to its command topic:
 * `MQTT: VNSE3-0, topic id …, BLE MAC …; for hm2mqtt: DEVICE_0=VNSE3-0:<id>`.
 */
const IDENTITY = /for hm2mqtt: DEVICE_0=([^:\s]+):([0-9a-fA-F]+)/;

export interface EmulatedDevice {
  /** `command dir,dir`, for messages. */
  readonly label: string;
  /** Resolves once the firmware has subscribed, with what hm2mqtt's `DEVICE_n` needs. */
  readonly identity: Promise<{ deviceType: string; deviceId: string }>;
  output(): string;
  stop(): Promise<void>;
}

/**
 * BLE MAC of the n-th emulated device. The MQTT topic id derives from it, so
 * devices sharing the scenario's broker must not share one.
 */
export function emulatedMac(index: number): string {
  return `c8:47:8c:00:e2:${(index + 1).toString(16).padStart(2, '0')}`;
}

export function startEmulatedDevice(
  setup: EmulatorSetup,
  spec: EmulatedDeviceSpec,
  index: number,
  brokerPort: number,
): EmulatedDevice {
  const label = `${spec.command} ${spec.images.join(',')}`;
  const images = spec.images.map(dir => {
    const image = findImage(setup.firmwareDir, dir);
    if (!image) {
      throw new Error(`No firmware image for ${label} in ${join(setup.firmwareDir, dir)}`);
    }
    return image;
  });
  const [program, ...prefix] = setup.command;
  const common = ['--mqtt', 'broker', '--broker', `127.0.0.1:${brokerPort}`, '--realtime'];
  const identityArgs = ['--ble-mac', emulatedMac(index)];
  const args =
    spec.command === 'run'
      ? // a CT002/CT003: a household drawing 300 W on phase A
        ['run', ...images, ...common, ...identityArgs, '--meter-power', '300,0,0', '--quiet-uart']
      : // a whole device: no self-consumption set-up, no HTTP port to collide on
        [spec.command, ...images, ...common, ...identityArgs, '--no-setup', '--http-port', '0'];

  const child: ChildProcess = spawn(program, [...prefix, ...args], {
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', chunk => (output += chunk.toString()));
  child.stderr?.on('data', chunk => (output += chunk.toString()));
  let exited = false;
  child.on('exit', () => (exited = true));
  let spawnError: Error | undefined;
  child.on('error', error => (spawnError = error));

  const forceStop = async () => {
    if (exited || spawnError) {
      return;
    }
    child.kill('SIGKILL');
    await waitFor(`${label} to exit after SIGKILL`, () => exited, { timeoutMs: 10_000 });
  };
  const stop = async () => {
    if (exited || spawnError) {
      return;
    }
    // marsemu stops on SIGTERM like on Ctrl-C, BMS process included
    child.kill('SIGTERM');
    await waitFor(`${label} to exit`, () => exited, {
      timeoutMs: 20_000,
      diagnose: () => `marsemu output:\n${tail(output)}`,
    }).catch(forceStop);
  };

  // Firmware takes from seconds (a B2500) to minutes (a Venus C/E) to reach
  // MQTT, emulated at real time.
  const identity = waitFor(
    `${label} to subscribe to its MQTT command topic`,
    () => {
      if (spawnError) {
        throw new WaitAbandoned(`marsemu could not be started: ${spawnError.message}`);
      }
      if (exited) {
        throw new WaitAbandoned(`marsemu exited early:\n${tail(output)}`);
      }
      const match = IDENTITY.exec(output);
      return match ? { deviceType: match[1], deviceId: match[2] } : undefined;
    },
    {
      timeoutMs: 15 * 60_000,
      intervalMs: 1000,
      diagnose: () => `marsemu output:\n${tail(output)}`,
    },
  ).catch(error => abandonStart(error, stop));
  // A device that never comes up is reported by whoever awaits `identity`;
  // this keeps an unawaited rejection from failing an unrelated test.
  identity.catch(() => undefined);

  return { label, identity, output: () => output, stop };
}
