import * as mqtt from 'mqtt';
import { Device, MqttConfig } from './types.js';
import { DeviceManager } from './deviceManager.js';
import { publishDiscoveryConfigs } from './generateDiscoveryConfigs.js';
import { AdditionalDeviceInfo, BaseDeviceData, getDeviceDefinition } from './deviceDefinition.js';
import logger from './logger.js';

export class MqttClient {
  private client: mqtt.MqttClient;
  private pollingInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private timeoutCounters: Map<string, number> = new Map();
  private allowedConsecutiveTimeouts: number;
  private devicePathsWithData: Set<string> = new Set();
  private lastDiscoveryInfoSignatureByDevice: Map<string, string> = new Map();
  private devicesRespondedToCd1: Set<string> = new Set();

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
        topic: `${this.config.topicPrefix}/availability`,
        payload: 'offline',
        qos: 1 as const,
        retain: true,
      },
    };

    logger.info(
      `Connecting to MQTT broker at ${this.config.brokerUrl} with client ID ${this.config.clientId}`,
    );
    logger.debug(`MQTT username: ${this.config.username ? this.config.username : 'not provided'}`);
    logger.debug(`MQTT password: ${this.config.password ? '******' : 'not provided'}`);

    const client = mqtt.connect(this.config.brokerUrl, options);

    client.on('connect', this.handleConnect.bind(this));
    client.on('reconnect', () => logger.debug('Attempting to reconnect to MQTT broker...'));
    client.on('offline', () => logger.warn('MQTT client is offline'));
    client.on('message', this.messageHandler);
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  /**
   * Handle MQTT connect event
   */
  private handleConnect(): void {
    logger.info('Connected to MQTT broker');

    // Publish global availability status
    this.publish(`${this.config.topicPrefix}/availability`, 'online', {
      qos: 1,
      retain: true,
    });

    // For each device, subscribe to topics and set up polling
    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (!topics) {
        logger.warn(`No topics found for device ${device.deviceId}`);
        return;
      }
      this.subscribe(topics.deviceTopicOld);
      this.subscribe(topics.deviceTopicNew);
      this.subscribeToControlTopics(device);
      this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      // Only (re-)publish discovery for devices that have already responded to a
      // cd=1 request in this process lifetime. Devices that have never replied are
      // not announced until their first cd=1 response arrives.
      if (this.devicesRespondedToCd1.has(this.getDeviceKey(device))) {
        this.publishDiscoveryConfigs(device);
      }
    });

    // Set up periodic polling to trigger device data
    this.setupPeriodicPolling();
  }

  private getDeviceKey(device: Device): string {
    return `${device.deviceType}:${device.deviceId}`;
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

  private getDiscoveryInfoSignatureFromInfo(additionalDeviceInfo: AdditionalDeviceInfo): string {
    return JSON.stringify(additionalDeviceInfo);
  }

  private getDiscoveryInfoSignature(device: Device): string {
    return this.getDiscoveryInfoSignatureFromInfo(this.getAdditionalDeviceInfo(device));
  }

  /**
   * Determine whether the given publish path corresponds to a cd=1 request for
   * this device, i.e. data received on this path is a response to a cd=1 poll.
   *
   * @param device - The device configuration
   * @param publishPath - The message path that received data
   */
  private isCd1Path(device: Device, publishPath: string): boolean {
    const deviceDefinition = getDeviceDefinition(device.deviceType);
    if (!deviceDefinition) {
      return false;
    }
    return deviceDefinition.messages.some(
      message => message.refreshDataPayload === 'cd=1' && message.publishPath === publishPath,
    );
  }

  /**
   * Subscribe to a topic
   *
   * @param topic - The topic to subscribe to
   */
  subscribe(topic: string | string[]): void {
    this.client.subscribe(topic, err => {
      if (err) {
        logger.error(`Subscription error for ${topic}:`, err);
        return;
      }
      logger.debug(`Subscribed to topic: ${topic}`);
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
          logger.error(`Error publishing to ${topic}:`, err);
          reject(err);
          return;
        }
        logger.debug(`Published to ${topic}: ${message}`);
        resolve();
      });
    });
  }

  /**
   * Set up periodic polling
   */
  private setupPeriodicPolling(): void {
    let pollingInterval: number;
    try {
      pollingInterval = this.deviceManager.getPollingInterval();
    } catch (error) {
      logger.error('Failed to get polling interval:', error);
      logger.error('This usually means no valid devices are configured');
      return;
    }

    logger.debug(`Setting up periodic polling every ${pollingInterval / 1000} seconds`);

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
    // Prevent tests/process from being kept alive by the interval
    this.pollingInterval.unref?.();

    // Clear any existing discovery interval
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    // Republish Home Assistant discovery configurations every hour, but only for
    // devices that have responded to a cd=1 request at least once.
    this.discoveryInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => {
        if (this.devicesRespondedToCd1.has(this.getDeviceKey(device))) {
          this.publishDiscoveryConfigs(device);
        }
      });
    }, 3600000); // Every hour
    // Prevent tests/process from being kept alive by the interval
    this.discoveryInterval.unref?.();
  }

  private publishDiscoveryConfigs(device: Device) {
    const topics = this.deviceManager.getDeviceTopics(device);

    if (topics) {
      let additionalDeviceInfo = this.getAdditionalDeviceInfo(device);
      const deviceState = this.deviceManager.getDeviceState(device);
      publishDiscoveryConfigs(
        this.client,
        device,
        topics,
        additionalDeviceInfo,
        this.config.topicPrefix,
        this.config.autodiscoveryTopicPrefix,
        deviceState,
      );
      this.lastDiscoveryInfoSignatureByDevice.set(
        this.getDeviceKey(device),
        this.getDiscoveryInfoSignatureFromInfo(additionalDeviceInfo),
      );
    }
  }

  /**
   * Called when device data is received to potentially re-publish discovery configs
   * on first data receipt (to update enabled states that depend on device data)
   *
   * @param device - The device that received data
   * @param publishPath - The message path that received data (e.g., 'data', 'bms')
   */
  onDeviceDataReceived(device: Device, publishPath: string): void {
    const devicePathKey = `${device.deviceType}:${device.deviceId}:${publishPath}`;
    const deviceKey = this.getDeviceKey(device);

    // Discovery is only announced after the device has responded to a cd=1 request.
    if (!this.devicesRespondedToCd1.has(deviceKey)) {
      // Ignore responses on other paths (e.g. BMS/cell data) until the device has
      // answered a cd=1 request. We deliberately do not record those paths in
      // devicePathsWithData yet, so they still get their normal first-data publish
      // once the device is unlocked below.
      if (!this.isCd1Path(device, publishPath)) {
        return;
      }
      logger.debug(
        `First cd=1 response received for ${device.deviceType}:${device.deviceId} on path ${publishPath}, publishing discovery configs`,
      );
      this.devicesRespondedToCd1.add(deviceKey);
      this.devicePathsWithData.add(devicePathKey);
      this.publishDiscoveryConfigs(device);
      return;
    }

    const previousSignature = this.lastDiscoveryInfoSignatureByDevice.get(deviceKey);
    const currentSignature = this.getDiscoveryInfoSignature(device);

    // If this is the first time we're receiving data for this device+path,
    // re-publish discovery configs now that we have device state
    if (!this.devicePathsWithData.has(devicePathKey)) {
      logger.debug(
        `First data received for ${device.deviceType}:${device.deviceId} on path ${publishPath}, re-publishing discovery configs`,
      );
      this.devicePathsWithData.add(devicePathKey);
      this.publishDiscoveryConfigs(device);
      return;
    }

    // Re-publish discovery when additional device info changed (e.g. firmware version
    // becomes known after an initial timeout), so gated entities get (re-)announced.
    if (previousSignature !== currentSignature) {
      logger.debug(
        `Discovery-relevant info changed for ${device.deviceType}:${device.deviceId}, re-publishing discovery configs`,
      );
      this.publishDiscoveryConfigs(device);
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
      logger.warn(`No definition found for device type ${device.deviceType}`);
      return;
    }

    if (!topics) {
      logger.warn(`No topics found for device ${device.deviceId}`);
      return;
    }

    const controlTopicOld = topics.deviceControlTopicOld;
    const controlTopicNew = topics.deviceControlTopicNew;
    const availabilityTopic = topics.availabilityTopic;

    // Merged device state, used to evaluate state-aware poll predicates
    // (e.g. only polling per-pack BMS details for packs that are present).
    const pollState = (this.deviceManager.getDeviceState(device) ?? {}) as BaseDeviceData;

    // Find the first message that needs to be refreshed
    let now = Date.now();
    let needsRefresh = false;
    let shouldStartTimeout = false;
    for (const [idx, message] of deviseDefinition.messages.entries()) {
      if (message.shouldPoll && !message.shouldPoll(pollState)) {
        continue;
      }
      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        needsRefresh = true;
        shouldStartTimeout = shouldStartTimeout || message.controlsDeviceAvailability;
      }
    }

    if (!needsRefresh) {
      // No message needs to be refreshed
      return;
    }

    if (shouldStartTimeout) {
      const timeout = setTimeout(() => {
        logger.warn(`No response received from ${device.deviceId} within timeout period`);
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
      // Prevent tests/process from being kept alive by the timeout
      timeout.unref?.();
      this.deviceManager.setResponseTimeout(device, timeout);
    }

    // Send requests for all messages that need to be refreshed, but only if no outstanding timeout
    for (const [idx, message] of deviseDefinition.messages.entries()) {
      // Skip polling for disabled messages
      if (!message.enabled) {
        continue;
      }

      // Skip messages whose state-aware poll predicate is not satisfied
      if (message.shouldPoll && !message.shouldPoll(pollState)) {
        continue;
      }

      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        this.lastRequestTime.set(lastRequestTimeKey, now);
        const payload = message.refreshDataPayload;
        setTimeout(
          () => {
            this.publish(controlTopicOld, payload, { qos: 0 }).catch(err => {
              logger.error(`Error requesting device data for ${device.deviceId}:`, err);
            });
            this.publish(controlTopicNew, payload, { qos: 0 }).catch(err => {
              logger.error(`Error requesting device data for ${device.deviceId}:`, err);
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
    logger.error('MQTT client error:', error);
  }

  /**
   * Handle MQTT close event
   */
  private handleClose(): void {
    logger.info('Disconnected from MQTT broker');

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
    logger.info('Closing MQTT connection');

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
      this.publish(`${this.config.topicPrefix}/availability`, 'offline', {
        qos: 1,
        retain: true,
      }),
    );

    // Wait for all publish operations to complete (with timeout)
    try {
      await Promise.race([
        Promise.all(publishPromises),
        new Promise(resolve => setTimeout(resolve, 1000)), // 1 second timeout
      ]);
    } catch (error) {
      logger.error('Error publishing offline status:', error);
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
