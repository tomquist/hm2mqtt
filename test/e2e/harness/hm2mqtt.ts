import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './env.js';
import { tail, waitFor } from './waitFor.js';

const ENTRY_POINT = resolve(REPO_ROOT, 'dist/index.js');

export interface Hm2mqttOptions {
  brokerUrl: string;
  /** Devices to configure, in `DEVICE_n` form. */
  devices: Array<{ deviceType: string; deviceId: string }>;
  topicPrefix: string;
  /** Seconds between polls. Short, so a scenario does not wait a minute. */
  pollingIntervalSeconds?: number;
}

export interface Hm2mqttProcess {
  output(): string;
  stop(): Promise<void>;
}

/**
 * The real hm2mqtt build, run the way the add-on runs it: a process configured
 * purely through environment variables. Scenarios exercise the shipped
 * artifact, not an in-process import of its modules.
 */
export async function startHm2mqtt(options: Hm2mqttOptions): Promise<Hm2mqttProcess> {
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`${ENTRY_POINT} is missing. Run \`npm run build\` before the e2e suite.`);
  }

  const deviceEnv = Object.fromEntries(
    options.devices.map((device, index) => [
      `DEVICE_${index}`,
      `${device.deviceType}:${device.deviceId}`,
    ]),
  );

  const child: ChildProcess = spawn(process.execPath, [ENTRY_POINT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...deviceEnv,
      MQTT_BROKER_URL: options.brokerUrl,
      MQTT_TOPIC_PREFIX: options.topicPrefix,
      MQTT_POLLING_INTERVAL: String(options.pollingIntervalSeconds ?? 2),
      MQTT_RESPONSE_TIMEOUT: '10',
      LOG_LEVEL: 'debug',
      // Never let a developer's own .env leak into a scenario.
      DOTENV_CONFIG_PATH: '/dev/null',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', chunk => (output += chunk.toString()));
  child.stderr?.on('data', chunk => (output += chunk.toString()));

  let exited = false;
  child.on('exit', () => (exited = true));

  await waitFor(
    'hm2mqtt to connect to the broker',
    () => !exited && /Connected to MQTT broker|Subscribed to/i.test(output),
    { diagnose: () => `hm2mqtt output:\n${tail(output)}` },
  );

  return {
    output: () => output,
    async stop() {
      if (exited) {
        return;
      }
      child.kill('SIGTERM');
      await waitFor('hm2mqtt to exit', () => exited, {
        timeoutMs: 15_000,
        diagnose: () => `hm2mqtt output:\n${tail(output)}`,
      }).catch(() => child.kill('SIGKILL'));
    },
  };
}
