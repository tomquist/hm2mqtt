import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_AUTODISCOVERY_TOPIC_PREFIX,
  DEFAULT_TOPIC_PREFIX,
} from '../../../src/constants.js';
import { DeviceFixture } from '../../fixtures/devices.js';
import { BASELINE_DEVICE_ID, DiscoveryBaseline } from '../../discovery/baseline.js';
import { Broker, startBroker } from './broker.js';
import { SimulatedDevice, startSimulatedDevice } from './device.js';
import { TMP_ROOT } from './env.js';
import { HomeAssistant, STATE_MIRROR_PREFIX, startHomeAssistant } from './homeAssistant.js';
import { Hm2mqttProcess, startHm2mqtt } from './hm2mqtt.js';
import { MqttProbe } from './mqttProbe.js';
import { Stack } from './stack.js';
import { tail, waitFor } from './waitFor.js';

/**
 * A running scenario: broker, simulated devices, Home Assistant, and — once
 * the scenario asks for it — hm2mqtt itself.
 *
 * hm2mqtt is started separately rather than as part of the rig, because that
 * is exactly the difference between the two scenarios: the smoke test starts
 * from nothing, the upgrade test seeds a previous release's discovery messages
 * first and only then lets the new build announce itself.
 */
export interface Rig {
  readonly broker: Broker;
  readonly probe: MqttProbe;
  readonly homeAssistant: HomeAssistant;
  readonly devices: SimulatedDevice[];
  startHm2mqtt(): Promise<Hm2mqttProcess>;
  /** Publish a previous release's discovery messages as retained, as its broker would still hold them. */
  seedRetainedDiscovery(baselines: DiscoveryBaseline[]): Promise<void>;
  /** Wait until Home Assistant has an entity whose id contains `fragment`. */
  waitForEntity(fragment: string): Promise<string>;
  entityState(entityId: string): string | undefined;
  entityIds(): string[];
  /** Every discovery topic seen so far, seeded ones included. */
  discoveryTopics(): string[];
  /**
   * A point in the broker's publish history, to ask what happened after it.
   *
   * Discovery topics alone cannot answer "did the new build announce itself":
   * an upgrade scenario seeds the previous release's messages on the very same
   * topics, so the set is already full before hm2mqtt starts.
   */
  publishMark(): number;
  /** Discovery topics published after `mark`, in order, with repeats. */
  discoveryPublishesSince(mark: number): string[];
  stop(): Promise<void>;
}

export interface RigOptions {
  /** Used for the scratch directory name, so a failed run can be inspected. */
  name: string;
  fixtures: DeviceFixture[];
}

/**
 * hm2mqtt derives an entity's unique id from the device id alone, so two
 * devices in one scenario must not share one. Ids stay 12 hex digits, which is
 * what a real device reports and what puts a Bluetooth address on the device
 * entry.
 */
export function deviceIdForIndex(index: number): string {
  return BASELINE_DEVICE_ID.slice(0, -1) + index.toString(16);
}

export async function startRig(options: RigOptions): Promise<Rig> {
  const stack = new Stack();
  const assignments = options.fixtures.map((fixture, index) => ({
    fixture,
    deviceId: deviceIdForIndex(index),
  }));
  try {
    const broker = stack.add('broker', await startBroker());
    const probe = stack.add('probe', await MqttProbe.connect(broker.url));

    const devices: SimulatedDevice[] = [];
    for (const { fixture, deviceId } of assignments) {
      devices.push(
        stack.add(
          `device ${fixture.deviceType}`,
          await startSimulatedDevice(broker.url, fixture, deviceId),
        ),
      );
    }

    mkdirSync(TMP_ROOT, { recursive: true });
    const homeAssistant = stack.add(
      'home assistant',
      await startHomeAssistant({
        configDir: join(TMP_ROOT, options.name),
        brokerPort: broker.port,
        discoveryPrefix: DEFAULT_AUTODISCOVERY_TOPIC_PREFIX,
      }),
    );

    // Being "started" is not the same as listening for discovery. Waiting for
    // the subscription means a scenario never races Home Assistant's MQTT
    // client, and a broken integration fails here rather than as a mystery
    // timeout further down.
    await waitFor(
      'Home Assistant to subscribe to the discovery topic',
      () =>
        broker.subscribed.some(filter =>
          filter.startsWith(`${DEFAULT_AUTODISCOVERY_TOPIC_PREFIX}/`),
        ),
      {
        timeoutMs: 60_000,
        diagnose: () =>
          `Subscribed filters: ${broker.subscribed.join(', ') || '(none)'}\n\n` +
          `Home Assistant log:\n${tail(homeAssistant.log())}`,
      },
    );

    let hm2mqtt: Hm2mqttProcess | undefined;

    return {
      broker,
      probe,
      homeAssistant,
      devices,
      async startHm2mqtt() {
        hm2mqtt = stack.add(
          'hm2mqtt',
          await startHm2mqtt({
            brokerUrl: broker.url,
            topicPrefix: DEFAULT_TOPIC_PREFIX,
            devices: devices.map(device => ({
              deviceType: device.deviceType,
              deviceId: device.deviceId,
            })),
          }),
        );
        return hm2mqtt;
      },
      async seedRetainedDiscovery(baselines) {
        for (const baseline of baselines) {
          for (const [topic, config] of Object.entries(baseline.components)) {
            if (config !== null) {
              await probe.publish(topic, JSON.stringify(config), true);
            }
          }
        }
      },
      waitForEntity(fragment) {
        return waitFor(
          `Home Assistant to create an entity matching "${fragment}"`,
          () =>
            probe
              .topics(`${STATE_MIRROR_PREFIX}/`)
              .map(topic => topic.slice(STATE_MIRROR_PREFIX.length + 1))
              .find(entityId => entityId.includes(fragment)),
          {
            timeoutMs: 90_000,
            diagnose: () =>
              `Known entities:\n${this.entityIds().join('\n') || '(none)'}\n\n` +
              `hm2mqtt output:\n${tail(hm2mqtt?.output() ?? '(not started)', 15)}`,
          },
        );
      },
      entityState(entityId) {
        return probe.latest(`${STATE_MIRROR_PREFIX}/${entityId}`);
      },
      entityIds() {
        return probe
          .topics(`${STATE_MIRROR_PREFIX}/`)
          .map(topic => topic.slice(STATE_MIRROR_PREFIX.length + 1));
      },
      discoveryTopics() {
        return probe.topics(`${DEFAULT_AUTODISCOVERY_TOPIC_PREFIX}/`);
      },
      publishMark() {
        return broker.published.length;
      },
      discoveryPublishesSince(mark) {
        return broker.published
          .slice(mark)
          .filter(topic => topic.startsWith(`${DEFAULT_AUTODISCOVERY_TOPIC_PREFIX}/`));
      },
      stop: () => stack.stopAll(),
    };
  } catch (error) {
    await stack.stopAll().catch(() => undefined);
    throw error;
  }
}

/**
 * Entity id fragment Home Assistant derives from a device, e.g.
 * `hame_energy_hma_1_0123456789ab`. Every entity of that device contains it.
 */
export function entitySlug(deviceType: string, deviceId: string): string {
  return `hame_energy_${deviceType}_${deviceId}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
