import '../../src/device/registry.js';
import { getDeviceDefinition, getRegisteredDeviceTypes } from '../../src/deviceDefinition.js';
import { generateDiscoveryConfigs } from '../../src/generateDiscoveryConfigs.js';
import { parseMessage } from '../../src/parser.js';
import { DEFAULT_AUTODISCOVERY_TOPIC_PREFIX, DEFAULT_TOPIC_PREFIX } from '../../src/constants.js';
import { Device } from '../../src/types.js';
import { findDeviceFixture } from '../fixtures/devices.js';

/**
 * The discovery baseline: every Home Assistant discovery message hm2mqtt
 * publishes for a device, captured as a reviewable file.
 *
 * It serves two purposes on purpose. In a pull request the diff of
 * `fixtures/discovery/current` shows what changed about the entities users get.
 * At release time the same files are frozen under
 * `fixtures/discovery/released/<version>` and become the starting point the
 * upgrade scenario replays, so "what an existing installation already has" is
 * never a guess.
 */

/**
 * Baselines are keyed by the registered (base) device type, so there is exactly
 * one per device definition. A concrete device such as `HMA-1` publishes the
 * same messages with its own type in the topics; `instantiateBaseline` performs
 * that substitution for the end-to-end replay.
 */

/** A 12 hex digit id so the Bluetooth `connections` branch is exercised. */
export const BASELINE_DEVICE_ID = '0123456789ab';

export interface DiscoveryBaseline {
  deviceType: string;
  /** Where the device state used for gating came from. */
  state: string;
  /**
   * Discovery topic to published config. `null` marks a component hm2mqtt
   * actively removes (an empty retained payload); components it defers on are
   * absent entirely.
   */
  components: Record<string, unknown>;
}

function deviceStateFromFixture(deviceType: string): { state: object; source: string } {
  const fixture = findDeviceFixture(deviceType);
  if (!fixture) {
    // No canned reading for this type: gates that need device data stay closed.
    // The baseline still captures every ungated component.
    return { state: {}, source: 'empty' };
  }
  const merged: Record<string, unknown> = {};
  for (const payload of Object.values(fixture.responses)) {
    for (const parsed of Object.values(parseMessage(payload, deviceType, BASELINE_DEVICE_ID))) {
      Object.assign(merged, parsed);
    }
  }
  return { state: merged, source: `fixture:${fixture.deviceType}` };
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sortKeys) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    ) as T;
  }
  return value;
}

export function generateBaseline(deviceType: string): DiscoveryBaseline {
  const device: Device = { deviceType, deviceId: BASELINE_DEVICE_ID };
  const { state, source } = deviceStateFromFixture(deviceType);
  const topics = {
    deviceTopicOld: `hame_energy/${deviceType}/device/${BASELINE_DEVICE_ID}/ctrl`,
    deviceTopicNew: `marstek_energy/${deviceType}/device/${BASELINE_DEVICE_ID}/ctrl`,
    deviceControlTopicOld: `hame_energy/${deviceType}/App/${BASELINE_DEVICE_ID}/ctrl`,
    deviceControlTopicNew: `marstek_energy/${deviceType}/App/${BASELINE_DEVICE_ID}/ctrl`,
    publishTopic: `${DEFAULT_TOPIC_PREFIX}/${deviceType}/device/${BASELINE_DEVICE_ID}`,
    controlSubscriptionTopic: `${DEFAULT_TOPIC_PREFIX}/${deviceType}/control/${BASELINE_DEVICE_ID}`,
    availabilityTopic: `${DEFAULT_TOPIC_PREFIX}/${deviceType}/availability/${BASELINE_DEVICE_ID}`,
  };

  const additionalDeviceInfo = {};
  for (const message of getDeviceDefinition(deviceType)?.messages ?? []) {
    Object.assign(additionalDeviceInfo, message.getAdditionalDeviceInfo(state as never));
  }

  const configs = generateDiscoveryConfigs(
    device,
    topics,
    additionalDeviceInfo,
    DEFAULT_TOPIC_PREFIX,
    DEFAULT_AUTODISCOVERY_TOPIC_PREFIX,
    state,
  );

  const components: Record<string, unknown> = {};
  for (const { topic, config } of configs.sort((a, b) => a.topic.localeCompare(b.topic))) {
    components[topic] = config == null ? null : sortKeys(config);
  }
  return { deviceType, state: source, components };
}

export function generateAllBaselines(): DiscoveryBaseline[] {
  return [...getRegisteredDeviceTypes()]
    .sort((a, b) => a.localeCompare(b))
    .map(deviceType => generateBaseline(deviceType));
}

/**
 * Rewrite a baseline for a concrete device, e.g. the `HMA` baseline as the
 * `HMA-1` with the id a scenario configures. Only the device type and the id
 * differ — they appear in the discovery topics, the node id, the unique ids,
 * the model id and the device name — so the substitution is a whole-word
 * replacement of each.
 */
export function instantiateBaseline(
  baseline: DiscoveryBaseline,
  device: { deviceType: string; deviceId: string },
): DiscoveryBaseline {
  // The type is a token in topics (`/HMA/`), node ids (`HMA_0123…`), the model
  // id and the device name. A word boundary is not enough: `_` is a word
  // character, so `\bHMA\b` would miss `HMA_0123…`.
  const typePattern = new RegExp(`(?<![A-Za-z0-9])${baseline.deviceType}(?![A-Za-z0-9])`, 'g');
  const rewritten = JSON.parse(
    JSON.stringify(baseline.components)
      .replace(typePattern, device.deviceType)
      .replace(new RegExp(BASELINE_DEVICE_ID, 'g'), device.deviceId),
  ) as Record<string, unknown>;
  return { ...baseline, deviceType: device.deviceType, components: rewritten };
}

/** File name a baseline is stored under, e.g. `HMA` -> `HMA.json`. */
export function baselineFileName(deviceType: string): string {
  return `${deviceType.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
}

export function serializeBaseline(baseline: DiscoveryBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}
