import { Device } from './types.js';
import { DeviceManager } from './deviceManager.js';
import { BaseDeviceData, getDeviceDefinition } from './deviceDefinition.js';
import { HaComponentConfig } from './homeAssistantDiscovery.js';

import logger from './logger.js';
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

export interface ControlPublishOptions {
  namespace: 'hame_energy' | 'marstek_energy';
  automaticRefresh: false;
}

export interface DeviceControlSessionContext {
  device: Device;
  publish: (payload: string, options: ControlPublishOptions) => Promise<void>;
  updateState: (path: string, update: Partial<BaseDeviceData>) => void;
}

export interface DeviceControlSession {
  handleCommand(command: string, message: string, retained: boolean): boolean;
  receive(message: string, namespace: ControlPublishOptions['namespace'], retained: boolean): void;
  disconnect(): void;
}

/**
 * Control Handler class
 */
export class ControlHandler {
  private sessions = new Map<string, DeviceControlSession>();
  /**
   * Create a new ControlHandler
   *
   * @param deviceManager - Device manager instance
   * @param publishCallback - Callback to publish messages. `messageIndex` is the
   *   index of the message definition the command belongs to, so the caller can
   *   re-read exactly that message after the write instead of every message.
   */
  constructor(
    private deviceManager: DeviceManager,
    private publishCallback: (
      device: Device,
      payload: string,
      messageIndex: number,
      options?: ControlPublishOptions,
    ) => void | Promise<void>,
  ) {}

  private getSession(device: Device): DeviceControlSession | undefined {
    const key = `${device.deviceType}:${device.deviceId}`;
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }
    const definition = getDeviceDefinition(device.deviceType);
    const factory = definition?.createControlSession;
    if (!factory) {
      return undefined;
    }
    const messageIndex = definition.messages.findIndex(message => message.publishPath === 'data');
    const session = factory({
      device,
      publish: async (payload, options) => {
        await this.publishCallback(device, payload, messageIndex, options);
      },
      updateState: (path, update) =>
        this.deviceManager.updateDeviceState(device, path, () => ({
          deviceType: device.deviceType,
          deviceId: device.deviceId,
          timestamp: new Date().toISOString(),
          values: {},
          ...update,
        })),
    });
    this.sessions.set(key, session);
    return session;
  }

  handleDeviceMessage(device: Device, topic: string, message: string, retained = false): void {
    const namespace = topic.startsWith('marstek_energy/') ? 'marstek_energy' : 'hame_energy';
    this.getSession(device)?.receive(message, namespace, retained);
  }

  disconnect(): void {
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
  }

  /**
   * Handle individual control topics
   *
   * @param device - The device configuration
   * @param topic - The control topic
   * @param message - The message payload
   */
  handleControlTopic(device: Device, topic: string, message: string, retained = false): void {
    logger.debug(`Processing control topic for ${device.deviceId}: ${topic}, message: ${message}`);
    try {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (!topics) {
        logger.error(`No topics found for device ${device.deviceId}`);
        return;
      }

      const controlTopicBase = topics.controlSubscriptionTopic;
      const controlPath = topic.substring(controlTopicBase.length + 1); // +1 for the slash
      if (this.getSession(device)?.handleCommand(controlPath, message, retained)) {
        return;
      }
      const deviceDefinition = getDeviceDefinition(device.deviceType);
      for (const [messageIndex, messageDefinition] of (
        deviceDefinition?.messages ?? []
      ).entries()) {
        const handlerParams: ControlHandlerParams<any> = {
          device,
          message,
          publishCallback: payload => this.publishCallback(device, payload, messageIndex),
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

      logger.warn('Unknown control topic:', topic);
    } catch (error) {
      logger.error('Error handling control topic:', error);
    }
  }
}
