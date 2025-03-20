import { Device } from './types';
import { DeviceManager } from './deviceManager';
import { getDeviceDefinition, HaStatefulAdvertiseBuilder, KeyPath } from './deviceDefinition';
import { HaComponentConfig } from './homeAssistantDiscovery';

type RecursiveReadonly<T> = {
  readonly [P in keyof T]: RecursiveReadonly<T[P]>;
};

/**
 * Interface for control handler parameters
 */
export interface ControlHandlerParams<T> {
  device: Device;
  message: string;
  publishCallback: (payload: string) => void;
  deviceState: RecursiveReadonly<T>;
  updateDeviceState: (
    update: (state: RecursiveReadonly<T>) => Partial<T> | undefined,
  ) => RecursiveReadonly<T>;
}

export type AdvertiseBuilderArgs = {
  commandTopic: string;
  stateTopic: string;
};
export type HaNonStatefulComponentAdvertiseBuilder = (
  args: AdvertiseBuilderArgs,
) => HaComponentConfig;

/**
 * Interface for control handler definition
 */
export type ControlHandlerDefinition<T> = {
  command: string;
  handler: (params: ControlHandlerParams<T>) => void;
};

/**
 * Control Handler class
 */
export class ControlHandler {
  /**
   * Create a new ControlHandler
   *
   * @param deviceManager - Device manager instance
   * @param publishCallback - Callback to publish messages
   */
  constructor(
    private deviceManager: DeviceManager,
    private publishCallback: (device: Device, payload: string) => void,
  ) {}

  /**
   * Handle individual control topics
   *
   * @param device - The device configuration
   * @param topic - The control topic
   * @param message - The message payload
   */
  handleControlTopic(device: Device, topic: string, message: string): void {
    console.log(`Processing control topic for ${device.deviceId}: ${topic}, message: ${message}`);
    try {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (!topics) {
        console.error(`No topics found for device ${device.deviceId}`);
        return;
      }

      const controlTopicBase = topics.controlSubscriptionTopic;
      const controlPath = topic.substring(controlTopicBase.length + 1); // +1 for the slash
      const deviceDefinition = getDeviceDefinition(device.deviceType);
      for (const messageDefinition of deviceDefinition?.messages ?? []) {
        const handlerParams: ControlHandlerParams<any> = {
          device,
          message,
          publishCallback: payload => this.publishCallback(device, payload),
          deviceState: this.deviceManager.getDeviceState(device) as any,
          updateDeviceState: update =>
            this.deviceManager.updateDeviceState(
              device,
              messageDefinition.publishPath,
              update as any,
            ) as any,
        };

        const handler = messageDefinition.commands.find(h => h.command === controlPath);
        if (handler) {
          handler.handler(handlerParams);
          return;
        }
      }

      console.warn('Unknown control topic:', topic);
    } catch (error) {
      console.error('Error handling control topic:', error);
    }
  }
}
