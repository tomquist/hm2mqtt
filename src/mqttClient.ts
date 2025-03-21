import * as mqtt from 'mqtt';
import { Device, MqttConfig } from './types';
import { DeviceManager } from './deviceManager';
import { publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { AdditionalDeviceInfo, BaseDeviceData, getDeviceDefinition } from './deviceDefinition';

export class MqttClient {
  private client: mqtt.MqttClient;
  private pollingInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: MqttConfig,
    private deviceManager: DeviceManager,
    private messageHandler: (topic: string, message: Buffer) => void,
  ) {
    this.client = this.setupClient();
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
        topic: `hame_energy/availability`,
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
    this.publish('hame_energy/availability', 'online', { qos: 1, retain: true });

    // For each device, subscribe to topics and set up polling
    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (!topics) {
        console.error(`No topics found for device ${device.deviceId}`);
        return;
      }
      this.subscribe(topics.deviceTopic);
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

    const controlTopic = topics.deviceControlTopic;
    const availabilityTopic = topics.availabilityTopic;

    console.log(`Requesting device data for ${device.deviceId} on topic: ${controlTopic}`);

    const needsRefreshRuntimeInfo = deviseDefinition.messages.some((message, idx) => {
      if (idx > 0) {
        return false;
      }
      let lastRequestTimeKey = `${device.deviceId}:${message}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      let now = Date.now();
      return lastRequestTime == null || lastRequestTime <= now - message.pollInterval;
    });

    if (!needsRefreshRuntimeInfo && !this.deviceManager.hasRunningResponseTimeouts(device)) {
      // Set a timeout for the response
      const timeout = setTimeout(() => {
        console.warn(`No response received from ${device.deviceId} within timeout period`);

        // Mark device as offline
        this.publish(availabilityTopic, 'offline', { qos: 1, retain: true });
      }, this.deviceManager.getResponseTimeout());

      // Store the timeout
      this.deviceManager.setResponseTimeout(device, timeout);
    }

    for (const [idx, message] of deviseDefinition.messages.entries()) {
      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      let now = Date.now();
      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        this.lastRequestTime.set(lastRequestTimeKey, now);
        const payload = message.refreshDataPayload;
        setTimeout(
          () => {
            this.publish(controlTopic, payload, { qos: 1 }).catch(err => {
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
    publishPromises.push(
      this.publish('hame_energy/availability', 'offline', { qos: 1, retain: true }),
    );

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
}
