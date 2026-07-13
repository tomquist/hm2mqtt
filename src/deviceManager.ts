import { Device, MqttConfig } from './types.js';
import {
  getDeviceDefinition,
  extractBaseType,
  getSuggestedDeviceType,
  BaseDeviceData,
  FieldDefinition,
  KeyPath,
  MessageDefinition,
} from './deviceDefinition.js';
import { calculateNewVersionTopicId, decryptNewVersionTopicId } from './utils/crypt.js';
import logger from './logger.js';

/**
 * Number of confirming readings (beyond the first drop) required before a
 * backward jump in a `monotonic` counter is accepted as a genuine reset.
 * A transient corrupt reading recovers on the next poll and is rejected; a real
 * period reset persists and is accepted once confirmed.
 */
const MONOTONIC_RESET_CONFIRMATIONS = 1;

/**
 * Interface for device state data
 */
export type DeviceStateData = object;
/**
 * Device topic structure
 */
export interface DeviceTopics {
  deviceTopicOld: string;
  deviceTopicNew: string;
  deviceControlTopicOld: string;
  deviceControlTopicNew: string;

  publishTopic: string;
  controlSubscriptionTopic: string;
  availabilityTopic: string;
}

/**
 * Type for device key (deviceType:deviceId)
 */
type DeviceKey = `${string}:${string}`;

/**
 * Device Manager class to handle device state and topics
 */
export class DeviceManager {
  // Device state and topic maps
  private deviceTopics: Record<DeviceKey, DeviceTopics> = {};
  private deviceStates: Record<DeviceKey, Record<string, DeviceStateData> | undefined> = {};
  private deviceResponseTimeouts: Record<DeviceKey, NodeJS.Timeout[]> = {};
  // Consecutive below-previous reading counts per device, per monotonic field id.
  private monotonicBelowCount: Record<DeviceKey, Record<string, number>> = {};
  private readonly encryptedDeviceTypes = new Set(['HMA', 'HMF', 'HMK', 'HMJ']);

  constructor(
    private config: MqttConfig,
    private readonly onUpdateState: (
      device: Device,
      path: string,
      deviceState: DeviceStateData,
    ) => void,
  ) {
    let validDeviceCount = 0;

    this.config.devices.forEach(device => {
      const deviceDefinition = getDeviceDefinition(device.deviceType);
      if (!deviceDefinition) {
        const baseType = extractBaseType(device.deviceType);
        const suggestion = getSuggestedDeviceType(baseType);
        if (suggestion) {
          logger.warn(
            `Skipping unknown device type: ${device.deviceType}. Did you mean "${suggestion}"?`,
          );
        } else {
          logger.warn(`Skipping unknown device type: ${device.deviceType}`);
        }
        return;
      }
      validDeviceCount++;

      const deviceKey = this.getDeviceKey(device);
      logger.info(`Initializing topics for device: ${deviceKey}`);
      let deviceId = device.deviceId;
      let deviceIdNew = this.shouldEncryptDeviceId(device.deviceType)
        ? calculateNewVersionTopicId(deviceId)
        : deviceId;

      const prefix = this.config.topicPrefix;
      this.deviceTopics[deviceKey] = {
        deviceTopicOld: `hame_energy/${device.deviceType}/device/${deviceId}/ctrl`,
        deviceTopicNew: `marstek_energy/${device.deviceType}/device/${deviceIdNew}/ctrl`,
        deviceControlTopicOld: `hame_energy/${device.deviceType}/App/${deviceId}/ctrl`,
        deviceControlTopicNew: `marstek_energy/${device.deviceType}/App/${deviceIdNew}/ctrl`,
        publishTopic: `${prefix}/${device.deviceType}/device/${device.deviceId}`,
        controlSubscriptionTopic: `${prefix}/${device.deviceType}/control/${device.deviceId}`,
        availabilityTopic: `${prefix}/${device.deviceType}/availability/${device.deviceId}`,
      };

      // Initialize response timeout tracker
      this.deviceResponseTimeouts[deviceKey] = [];

      logger.debug(`Topics for ${deviceKey}:`, this.deviceTopics[deviceKey]);
    });

    if (validDeviceCount === 0) {
      throw new Error(
        'No valid devices configured. All configured devices have unknown device types.',
      );
    }
  }

  private getDeviceKey(device: Device): DeviceKey {
    return `${device.deviceType}:${device.deviceId}`;
  }

  private shouldEncryptDeviceId(deviceType: string): boolean {
    const baseType = extractBaseType(deviceType);
    return this.encryptedDeviceTypes.has(baseType.toUpperCase());
  }

  /**
   * Get device topics for a device
   *
   * @param device - The device configuration
   * @returns The device topics
   */
  getDeviceTopics(device: Device): DeviceTopics | undefined {
    const deviceKey = this.getDeviceKey(device);
    return this.deviceTopics[deviceKey];
  }

  /**
   * Get device state for a device
   *
   * @param device - The device configuration
   * @returns The device state
   */
  getDeviceState(device: Device): DeviceStateData | undefined {
    const deviceKey = this.getDeviceKey(device);
    const stateByPath = this.deviceStates[deviceKey];
    const mergedState = Object.values(stateByPath ?? {}).reduce(
      (acc, state) => ({ ...acc, ...state }),
      {},
    );
    return mergedState;
  }

  private getDeviceStateForPath<T extends DeviceStateData | undefined>(
    device: Device,
    publishPath: string,
  ): DeviceStateData & T {
    const deviceKey = this.getDeviceKey(device);
    const stateByPath = this.deviceStates[deviceKey] ?? {};
    return (stateByPath[publishPath] ??
      this.getDefaultDeviceState(device, publishPath)) as DeviceStateData & T;
  }

  private getDefaultDeviceState<T extends DeviceStateData | undefined>(
    device: Device,
    publishPath: string,
  ): DeviceStateData & T {
    const deviceDefinition = getDeviceDefinition(device.deviceType);
    const deviceKey = this.getDeviceKey(device);
    const defaultState = deviceDefinition?.messages.find(
      msg => msg.publishPath === publishPath,
    )?.defaultState;
    return (defaultState ?? {}) as DeviceStateData & T;
  }

  /**
   * Update device state
   *
   * @param device - The device configuration
   * @param path - The path to update
   * @param updater - Function to update the device state
   */
  updateDeviceState<T extends DeviceStateData | undefined>(
    device: Device,
    path: string,
    updater: (state: DeviceStateData) => T,
  ): DeviceStateData & T {
    const deviceKey = this.getDeviceKey(device);
    const candidate = updater(this.getDeviceStateForPath(device, path));
    this.guardMonotonicFields(device, path, this.getDeviceStateForPath(device, path), candidate);
    let newDeviceState: T = {
      ...this.getDeviceStateForPath(device, path),
      ...candidate,
    };
    this.deviceStates[deviceKey] = {
      ...this.deviceStates[deviceKey],
      [path]: newDeviceState,
    };
    this.onUpdateState(device, path, newDeviceState);
    return newDeviceState as DeviceStateData & T;
  }

  /**
   * Suppress transient corrupt backward jumps in cumulative (`monotonic`)
   * counters. A reading lower than the last good value is rejected — the last
   * good value is written back into the candidate — until a subsequent reading
   * confirms the drop persists, at which point it is accepted as a genuine
   * period reset. Mutates `candidate` in place.
   */
  private guardMonotonicFields(
    device: Device,
    path: string,
    prevState: DeviceStateData | undefined,
    candidate: DeviceStateData | undefined,
  ): void {
    if (candidate == null) {
      return;
    }
    const fields =
      getDeviceDefinition(device.deviceType)?.messages.find(msg => msg.publishPath === path)
        ?.fields ?? [];
    const deviceKey = this.getDeviceKey(device);

    for (const field of fields) {
      if (!field.monotonic) {
        continue;
      }
      const fieldPath = (field as FieldDefinition<any, KeyPath<any>>).path;
      const nextVal = getAtPath(candidate, fieldPath);
      if (typeof nextVal !== 'number' || !Number.isFinite(nextVal)) {
        continue;
      }

      const fieldId = `${path}|${fieldPath.join('.')}`;
      const prevVal = getAtPath(prevState, fieldPath);
      const counts = (this.monotonicBelowCount[deviceKey] ??= {});

      if (typeof prevVal !== 'number' || !Number.isFinite(prevVal) || nextVal >= prevVal) {
        // First good reading, or a normal non-decreasing value: accept.
        delete counts[fieldId];
        continue;
      }

      // Backward jump.
      const count = (counts[fieldId] ?? 0) + 1;
      if (count > MONOTONIC_RESET_CONFIRMATIONS) {
        // Drop confirmed across consecutive readings: accept as a genuine reset.
        delete counts[fieldId];
        continue;
      }
      counts[fieldId] = count;
      logger.warn(
        `Rejecting backward jump for ${device.deviceType}:${device.deviceId} ${fieldPath.join('.')}: ${prevVal} -> ${nextVal} (keeping previous value, awaiting confirmation)`,
      );
      setAtPath(candidate, fieldPath, prevVal);
    }
  }

  /**
   * Get all control topics for a device
   *
   * @param device - The device configuration
   * @returns Array of control topics
   */
  getControlTopics(device: Device): string[] {
    const deviceKey = this.getDeviceKey(device);
    const controlTopicBase = this.deviceTopics[deviceKey].controlSubscriptionTopic;
    const deviceDefinitions = getDeviceDefinition(device.deviceType);

    return (
      deviceDefinitions?.messages?.flatMap(msg =>
        msg.commands.map(({ command }) => `${controlTopicBase}/${command}`),
      ) ?? []
    );
  }

  hasRunningResponseTimeouts(device: Device): boolean {
    const deviceKey = this.getDeviceKey(device);
    return this.deviceResponseTimeouts[deviceKey].length > 0;
  }

  /**
   * Set a response timeout for a device
   *
   * @param timeout - The timeout handler
   * @param device - The device configuration
   */
  setResponseTimeout(device: Device, timeout: NodeJS.Timeout): void {
    const deviceKey = this.getDeviceKey(device);
    this.deviceResponseTimeouts[deviceKey].push(timeout);
  }

  /**
   * Clear all response timeouts for a device
   *
   * @param device - The device configuration
   */
  clearResponseTimeout(device: Device): void {
    const deviceKey = this.getDeviceKey(device);
    const timeouts = this.deviceResponseTimeouts[deviceKey];
    if (timeouts && timeouts.length > 0) {
      timeouts.forEach(timeout => clearTimeout(timeout));
      this.deviceResponseTimeouts[deviceKey] = [];
    }
  }

  /**
   * Get all devices
   *
   * @returns Array of device configurations
   */
  getDevices(): Device[] {
    return this.config.devices;
  }

  /**
   * Get device by key
   *
   * @param deviceKey - The device key
   * @returns The device configuration or undefined
   */
  getDeviceByKey(deviceKey: DeviceKey): Device | undefined {
    return this.config.devices.find(device => this.getDeviceKey(device) === deviceKey);
  }

  /**
   * Find device for a topic
   *
   * @param topic - The MQTT topic
   * @returns Object with device, deviceKey, and topicType if found
   */
  findDeviceForTopic(topic: string):
    | {
        device: Device;
        topicType: 'device' | 'control';
      }
    | undefined {
    for (const device of this.config.devices) {
      const deviceKey = this.getDeviceKey(device);
      const topics = this.deviceTopics[deviceKey];

      if (topic === topics.deviceTopicOld || topic === topics.deviceTopicNew) {
        return { device, topicType: 'device' };
      } else if (topic.startsWith(topics.controlSubscriptionTopic)) {
        return { device, topicType: 'control' };
      }
    }

    return undefined;
  }

  /**
   * Get polling interval from config
   *
   * @returns The polling interval in milliseconds
   */
  getPollingInterval(): number {
    const allPollingIntervals = this.getDevices().flatMap(device => {
      return (
        getDeviceDefinition(device.deviceType)
          ?.messages.filter(message => message.enabled)
          .map(message => {
            return this.getMessagePollingInterval(message);
          })
          ?.filter(n => n != null) ?? []
      );
    });

    // Check if there are any valid polling intervals
    if (allPollingIntervals.length === 0) {
      throw new Error('No valid devices configured');
    }

    function gcd2(a: number, b: number): number {
      if (b === 0) {
        return a;
      }
      return gcd2(b, a % b);
    }

    return allPollingIntervals.reduce(gcd2, allPollingIntervals[0]);
  }

  /** Resolve a message's configured polling interval in milliseconds. */
  getMessagePollingInterval(
    message: Pick<MessageDefinition<BaseDeviceData>, 'pollInterval' | 'pollIntervalConfig'>,
  ): number {
    if (message.pollIntervalConfig === 'cellDataPollingInterval') {
      return this.config.cellDataPollingInterval;
    }
    return message.pollInterval;
  }

  /**
   * Get response timeout from config
   *
   * @returns The response timeout in milliseconds
   */
  getResponseTimeout(): number {
    return this.config.responseTimeout || 15000; // Default to 15 seconds if not specified
  }
}

/**
 * Read the value at a nested path, or undefined if any segment is missing.
 */
function getAtPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
  let current: any = obj;
  for (const key of path) {
    if (current == null) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Set the value at a nested path, creating intermediate objects as needed.
 */
function setAtPath(obj: any, path: ReadonlyArray<string | number>, value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] == null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}
