import { Device, MqttConfig } from './types';
import { getDeviceDefinition } from './deviceDefinition';
import { calculateNewVersionTopicId, decryptNewVersionTopicId } from './utils/crypt';
import logger from './logger';

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
        logger.warn(`Skipping unknown device type: ${device.deviceType}`);
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
    const match = /^(.*)-[\d\w]+$/.exec(deviceType);
    const baseType = match ? match[1] : deviceType;
    return this.encryptedDeviceTypes.has(baseType);
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
    let newDeviceState: T = {
      ...this.getDeviceStateForPath(device, path),
      ...updater(this.getDeviceStateForPath(device, path)),
    };
    this.deviceStates[deviceKey] = {
      ...this.deviceStates[deviceKey],
      [path]: newDeviceState,
    };
    this.onUpdateState(device, path, newDeviceState);
    return newDeviceState as DeviceStateData & T;
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
          ?.messages.map(message => {
            return message.pollInterval;
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

  /**
   * Get response timeout from config
   *
   * @returns The response timeout in milliseconds
   */
  getResponseTimeout(): number {
    return this.config.responseTimeout || 15000; // Default to 15 seconds if not specified
  }
}
