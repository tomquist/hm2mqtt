import * as mqtt from 'mqtt';
import { Device, MqttConfig } from './types';
import { DeviceManager } from './deviceManager';
import { publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { AdditionalDeviceInfo, BaseDeviceData, getDeviceDefinition } from './deviceDefinition';

export class MqttClient {
  private client: mqtt.MqttClient;
  private pollingInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private timeoutCounters: Map<string, number> = new Map();
  private allowedConsecutiveTimeouts: number;

  constructor(
    private config: MqttConfig,
    private deviceManager: DeviceManager,
    private messageHandler: (topic: string, message: Buffer) => void,
  ) {
    this.client = this.setupClient();
    this.allowedConsecutiveTimeouts = config.allowedConsecutiveTimeouts ?? 3;
  }

  /**
   * Set up the MQTT client
   *
   * @returns The MQTT client
   */
  private setupClient(): mqtt.MqttClient {
    const options = {
      clientId: this.config.clientId,
      username: this.config.username,
      password: this.config.password,
      clean: true,
      reconnectPeriod: 5000, // Reconnect every 5 seconds
      connectTimeout: 30000, // 30 seconds timeout
      // Set up last will message for availability
      will: {
        topic: `hm2mqtt/availability`,
        payload: 'offline',
        qos: 1 as const,
        retain: true,
      },
    };

    console.log(
      `Connecting to MQTT broker at ${this.config.brokerUrl} with client ID ${this.config.clientId}`,
    );
    console.log(`MQTT username: ${this.config.username ? this.config.username : 'not provided'}`);
    console.log(`MQTT password: ${this.config.password ? '******' : 'not provided'}`);

    const client = mqtt.connect(this.config.brokerUrl, options);

    client.on('connect', this.handleConnect.bind(this));
    client.on('reconnect', () => console.log('Attempting to reconnect to MQTT broker...'));
    client.on('offline', () => console.log('MQTT client is offline'));
    client.on('message', this.messageHandler);
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  /**
   * Handle MQTT connect event
   */
  private handleConnect(): void {
    console.log('Connected to MQTT broker');

    // Publish global availability status
    this.publish(`hm2mqtt/availability`, 'online', {
      qos: 1,
      retain: true,
    });

    // For each device, subscribe to topics and set up polling
    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (!topics) {
        console.error(`No topics found for device ${device.deviceId}`);
        return;
      }
      this.subscribe(topics.deviceTopicOld);
      this.subscribe(topics.deviceTopicNew);
      this.subscribeToControlTopics(device);
      this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      this.publishDiscoveryConfigs(device);
    });

    // Set up periodic polling to trigger device data
    this.setupPeriodicPolling();
  }

  private getAdditionalDeviceInfo(device: Device) {
    const deviceDefinitions = getDeviceDefinition(device.deviceType);
    const deviceState = this.deviceManager.getDeviceState(device);
    let additionalDeviceInfo: AdditionalDeviceInfo = {};
    if (deviceState != null && deviceDefinitions != null) {
      for (const message of deviceDefinitions.messages) {
        additionalDeviceInfo = {
          ...additionalDeviceInfo,
          ...message.getAdditionalDeviceInfo(deviceState as BaseDeviceData),
        };
      }
    }
    return additionalDeviceInfo;
  }

  /**
   * Subscribe to a topic
   *
   * @param topic - The topic to subscribe to
   */
  subscribe(topic: string | string[]): void {
    this.client.subscribe(topic, err => {
      if (err) {
        console.error(`Subscription error for ${topic}:`, err);
        return;
      }
      console.log(`Subscribed to topic: ${topic}`);
    });
  }

  /**
   * Subscribe to control topics for a device
   *
   * @param device - The device configuration
   */
  private subscribeToControlTopics(device: any): void {
    const controlTopics = this.deviceManager.getControlTopics(device);
    this.subscribe(controlTopics);
  }

  /**
   * Publish a message to a topic
   *
   * @param topic - The topic to publish to
   * @param message - The message to publish
   * @param options - MQTT publish options
   * @returns Promise that resolves when the message is published
   */
  publish(topic: string, message: string, options: mqtt.IClientPublishOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, options, err => {
        if (err) {
          console.error(`Error publishing to ${topic}:`, err);
          reject(err);
          return;
        }
        console.log(
          `Published to ${topic}: ${message.length > 100 ? message.substring(0, 100) + '...' : message}`,
        );
        resolve();
      });
    });
  }

  /**
   * Set up periodic polling
   */
  private setupPeriodicPolling(): void {
    const pollingInterval = this.deviceManager.getPollingInterval();
    console.log(`Setting up periodic polling every ${pollingInterval / 1000} seconds`);

    // Initial poll - request data immediately for all devices
    this.deviceManager.getDevices().forEach(device => {
      this.requestDeviceData(device);
    });

    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Set up interval for periodic polling
    this.pollingInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => {
        this.requestDeviceData(device);
      });
    }, pollingInterval);

    // Clear any existing discovery interval
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    // Republish Home Assistant discovery configurations every hour
    this.discoveryInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => {
        this.publishDiscoveryConfigs(device);
      });
    }, 3600000); // Every hour
  }

  private publishDiscoveryConfigs(device: Device) {
    const topics = this.deviceManager.getDeviceTopics(device);

    if (topics) {
      let additionalDeviceInfo = this.getAdditionalDeviceInfo(device);
      publishDiscoveryConfigs(this.client, device, topics, additionalDeviceInfo);
    }
  }

  private lastRequestTime: Map<string, number> = new Map();

  /**
   * Request device data
   *
   * @param device - The device configuration
   */
  requestDeviceData(device: Device): void {
    const topics = this.deviceManager.getDeviceTopics(device);
    const deviseDefinition = getDeviceDefinition(device.deviceType);

    if (!deviseDefinition) {
      console.error(`No definition found for device type ${device.deviceType}`);
      return;
    }

    if (!topics) {
      console.error(`No topics found for device ${device.deviceId}`);
      return;
    }

    const controlTopicOld = topics.deviceControlTopicOld;
    const controlTopicNew = topics.deviceControlTopicNew;
    const availabilityTopic = topics.availabilityTopic;

    // Find the first message that needs to be refreshed
    let now = Date.now();
    let messageToRequestIdx = -1;
    for (const [idx, message] of deviseDefinition.messages.entries()) {
      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        messageToRequestIdx = idx;
        break;
      }
    }

    if (messageToRequestIdx === -1) {
      // No message needs to be refreshed
      return;
    }

    const timeout = setTimeout(() => {
      console.warn(`No response received from ${device.deviceId} within timeout period`);
      // Increment timeout counter
      const currentCount = this.timeoutCounters.get(device.deviceId) || 0;
      const newCount = currentCount + 1;
      this.timeoutCounters.set(device.deviceId, newCount);
      if (newCount >= this.allowedConsecutiveTimeouts) {
        // Mark device as offline after allowed consecutive timeouts
        this.publish(availabilityTopic, 'offline', { qos: 1, retain: true });
      }
      // Clear the timeout
      this.deviceManager.clearResponseTimeout(device);
    }, this.deviceManager.getResponseTimeout());
    this.deviceManager.setResponseTimeout(device, timeout);

    // Send requests for all messages that need to be refreshed, but only if no outstanding timeout
    for (const [idx, message] of deviseDefinition.messages.entries()) {
      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        this.lastRequestTime.set(lastRequestTimeKey, now);
        const payload = message.refreshDataPayload;
        setTimeout(
          () => {
            this.publish(controlTopicOld, payload, { qos: 1 }).catch(err => {
              console.error(`Error requesting device data for ${device.deviceId}:`, err);
            });
            this.publish(controlTopicNew, payload, { qos: 1 }).catch(err => {
              console.error(`Error requesting device data for ${device.deviceId}:`, err);
            });
          },
          // Spread out the requests to avoid flooding the device
          idx * 100,
        );
      }
    }
  }

  /**
   * Handle MQTT error event
   *
   * @param error - The error
   */
  private handleError(error: Error): void {
    console.error('MQTT client error:', error);
  }

  /**
   * Handle MQTT close event
   */
  private handleClose(): void {
    console.log('Disconnected from MQTT broker');

    // Clean up intervals
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  /**
   * Close the MQTT connection
   */
  async close(): Promise<void> {
    console.log('Closing MQTT connection');

    // Publish offline status for all devices
    const publishPromises = this.deviceManager.getDevices().map(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (topics) {
        return this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      }

      return Promise.resolve();
    });

    // Publish global offline status
    publishPromises.push(this.publish(`hm2mqtt/availability`, 'offline', { qos: 1, retain: true }));

    // Wait for all publish operations to complete (with timeout)
    try {
      await Promise.race([
        Promise.all(publishPromises),
        new Promise(resolve => setTimeout(resolve, 1000)), // 1 second timeout
      ]);
    } catch (error) {
      console.error('Error publishing offline status:', error);
    }

    // Clean up intervals
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }

    // End the client connection
    this.client.end();
  }

  public resetTimeoutCounter(deviceId: string): void {
    this.timeoutCounters.set(deviceId, 0);
  }
}
