import { Device, MqttConfig } from './types';
import { getDeviceDefinition } from './deviceDefinition';

/**
 * Interface for device state data
 */
export type DeviceStateData = object;
/**
 * Device topic structure
 */
export interface DeviceTopics {
  deviceTopic: string;
  publishTopic: string;
  deviceControlTopic: string;
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
  private deviceResponseTimeouts: Record<DeviceKey, NodeJS.Timeout | null> = {};

  constructor(
    private config: MqttConfig,
    private readonly onUpdateState: (
      device: Device,
      path: string,
      deviceState: DeviceStateData,
    ) => void,
  ) {
    this.config.devices.forEach(device => {
      const deviceDefinition = getDeviceDefinition(device.deviceType);
      if (!deviceDefinition) {
        console.warn(`Skipping unknown device type: ${device.deviceType}`);
        return;
      }
      const deviceKey = this.getDeviceKey(device);
      console.log(`Initializing topics for device: ${deviceKey}`);

      this.deviceTopics[deviceKey] = {
        deviceTopic: `hame_energy/${device.deviceType}/device/${device.deviceId}/ctrl`,
        publishTopic: `hame_energy/${device.deviceType}/device/${device.deviceId}`,
        deviceControlTopic: `hame_energy/${device.deviceType}/App/${device.deviceId}/ctrl`,
        controlSubscriptionTopic: `hame_energy/${device.deviceType}/control/${device.deviceId}`,
        availabilityTopic: `hame_energy/${device.deviceType}/availability/${device.deviceId}`,
      };

      // Initialize response timeout tracker
      this.deviceResponseTimeouts[deviceKey] = null;

      console.log(`Topics for ${deviceKey}:`, this.deviceTopics[deviceKey]);
    });
  }

  private getDeviceKey(device: Device): DeviceKey {
    return `${device.deviceType}:${device.deviceId}`;
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
    return this.deviceResponseTimeouts[deviceKey] !== null;
  }

  /**
   * Set a response timeout for a device
   *
   * @param timeout - The timeout handler
   * @param device - The device configuration
   */
  setResponseTimeout(device: Device, timeout: NodeJS.Timeout): void {
    const deviceKey = this.getDeviceKey(device);
    // Clear any existing timeout
    this.clearResponseTimeout(device);
    this.deviceResponseTimeouts[deviceKey] = timeout;
  }

  /**
   * Clear a response timeout for a device
   *
   * @param device - The device configuration
   */
  clearResponseTimeout(device: Device): void {
    const deviceKey = this.getDeviceKey(device);
    if (this.deviceResponseTimeouts[deviceKey]) {
      clearTimeout(this.deviceResponseTimeouts[deviceKey]!);
      this.deviceResponseTimeouts[deviceKey] = null;
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

      if (topic === topics.deviceTopic) {
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
