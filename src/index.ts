import * as dotenv from 'dotenv';
// Load environment variables
dotenv.config();

import { Device, MqttConfig } from './types';
import { DEFAULT_TOPIC_PREFIX } from './constants';
import { DeviceManager, DeviceStateData } from './deviceManager';
import { MqttClient } from './mqttClient';
import { ControlHandler } from './controlHandler';
import logger from './logger';
import { DataHandler } from './dataHandler';
import { MqttProxy, MqttProxyConfig } from './mqttProxy';

// Debug mode
const DEBUG = process.env.DEBUG === 'true';

// MQTT Proxy configuration
const MQTT_PROXY_ENABLED = process.env.MQTT_PROXY_ENABLED === 'true';
const MQTT_PROXY_PORT = parseInt(process.env.MQTT_PROXY_PORT || '1890', 10);

// Debug logger
function debug(...args: any[]) {
  if (DEBUG) {
    logger.debug('[DEBUG]', ...args);
  }
}

/**
 * Parse device configurations from environment variables
 *
 * @returns Array of device configurations
 */
function parseDeviceConfigurations(): Device[] {
  const devices: Device[] = [];

  // Log all device-related environment variables
  logger.info('Device environment variables:');
  const deviceEnvVars = Object.keys(process.env)
    .filter(key => key.startsWith('DEVICE_'))
    .sort();

  if (deviceEnvVars.length === 0) {
    logger.warn('No DEVICE_ environment variables found!');
  } else {
    deviceEnvVars.forEach(key => {
      logger.info(`${key}=${process.env[key]}`);
    });
  }

  Object.keys(process.env).forEach(key => {
    if (key.startsWith('DEVICE_')) {
      const value = process.env[key];
      if (value) {
        const parts = value.split(':');
        const deviceType = parts[0];
        const deviceId = parts[1];

        if (deviceType && deviceId) {
          logger.info(`Adding device: ${deviceType}:${deviceId} from ${key}=${value}`);
          devices.push({
            deviceType,
            deviceId,
          });
        } else {
          logger.warn(
            `Invalid device format for ${key}=${value}, expected format: deviceType:deviceId`,
          );
        }
      }
    }
  });

  if (devices.length === 0) {
    logger.error('No devices found in environment variables');
    logger.error('This could be due to:');
    logger.error('1. Missing device configuration in the addon config');
    logger.error('2. Environment variables not being properly set');

    logger.error('\nEnvironment variables:');
    Object.keys(process.env)
      .filter(key => !key.toLowerCase().includes('password'))
      .sort()
      .forEach(key => {
        logger.error(`${key}=${process.env[key]}`);
      });

    logger.error('\nPlease check your addon configuration and ensure you have added devices.');
    logger.error('Example configuration:');
    logger.error(
      JSON.stringify(
        {
          devices: [
            { deviceType: 'HMA-1', deviceId: '12345' },
            { deviceType: 'HMA-1', deviceId: '67890' },
          ],
          pollingInterval: 60,
          responseTimeout: 30,
          debug: true,
        },
        null,
        2,
      ),
    );

    throw new Error('No devices configured');
  }

  return devices;
}

/**
 * Create MQTT configuration from environment variables
 *
 * @param devices - Array of device configurations
 * @returns MQTT configuration
 */
function createMqttConfig(devices: Device[]): MqttConfig {
  return {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    clientId: process.env.MQTT_CLIENT_ID || `hm2mqtt-${Math.random().toString(16).slice(2, 8)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    topicPrefix: process.env.MQTT_TOPIC_PREFIX || DEFAULT_TOPIC_PREFIX,
    devices,
    responseTimeout: parseInt(process.env.MQTT_RESPONSE_TIMEOUT || '15', 10) * 1000,
    allowedConsecutiveTimeouts: parseInt(process.env.MQTT_ALLOWED_CONSECUTIVE_TIMEOUTS || '3', 10),
  };
}

/**
 * Main application function
 */
async function main() {
  try {
    logger.info('Starting hm2mqtt application...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
    logger.info(`Debug mode: ${DEBUG ? 'enabled' : 'disabled'}`);
    logger.info(
      `MQTT Proxy: ${MQTT_PROXY_ENABLED ? `enabled on port ${MQTT_PROXY_PORT}` : 'disabled'}`,
    );

    // Log all environment variables in debug mode
    if (DEBUG) {
      logger.info('Environment variables:');
      Object.keys(process.env)
        .filter(key => !key.toLowerCase().includes('password'))
        .sort()
        .forEach(key => {
          logger.info(`${key}=${process.env[key]}`);
        });

      // Print full configuration
      logger.info('Full configuration:');
      const config = createMqttConfig(parseDeviceConfigurations());
      logger.info(
        JSON.stringify(
          config,
          (key, value) => {
            // Mask password fields
            if (key.toLowerCase().includes('password')) return '***';
            return value;
          },
          2,
        ),
      );
    }

    // Parse device configurations
    logger.info('Parsing device configurations...');
    const devices = parseDeviceConfigurations();
    logger.info(`Found ${devices.length} device(s)`);
    devices.forEach(device => {
      logger.info(`- Device: ${device.deviceType}:${device.deviceId}`);
    });

    // Create MQTT configuration
    logger.info('Creating MQTT configuration...');
    const config = createMqttConfig(devices);
    logger.info(`MQTT Broker: ${config.brokerUrl}`);
    logger.info(`MQTT Client ID: ${config.clientId}`);
    debug(
      'Full MQTT config:',
      JSON.stringify(config, (key, value) => (key === 'password' ? '***' : value), 2),
    );

    const deviceStateUpdateHandler = (
      device: Device,
      publishPath: string,
      deviceState: DeviceStateData,
    ) => {
      logger.info('Device state updated');
      const topics = deviceManager.getDeviceTopics(device);
      if (!topics) {
        logger.warn(`No topics found for device ${device.deviceId}`);
        return;
      }
      mqttClient
        .publish(`${topics.publishTopic}/${publishPath}`, JSON.stringify(deviceState), { qos: 1 })
        .catch(err => logger.error(`Error publishing message for ${device.deviceId}:`, err));
    };

    // Create device manager
    const deviceManager = new DeviceManager(config, deviceStateUpdateHandler);

    // Create handlers
    let mqttClient: MqttClient;

    // Create message handler function
    const messageHandler = (topic: string, message: Buffer) => {
      try {
        logger.info(`Received message on topic: ${topic}`);
        debug(`Message content: ${message.toString()}`);

        // Find which device this topic belongs to
        const deviceInfo = deviceManager.findDeviceForTopic(topic);

        if (!deviceInfo) {
          logger.warn(`Received message on unrecognized topic: ${topic}`);
          return;
        }
        const topics = deviceManager.getDeviceTopics(deviceInfo.device);
        debug(`Device topics:`, topics);

        const { device, topicType } = deviceInfo;
        debug(`Device info: ${device.deviceType}:${device.deviceId}, topic type: ${topicType}`);

        // Handle based on topic type
        switch (topicType) {
          case 'device':
            if (topics) {
              mqttClient.publish(topics.availabilityTopic, 'online', { qos: 1, retain: true });
              mqttClient.resetTimeoutCounter(device.deviceId);
            }

            deviceManager.clearResponseTimeout(device);
            dataHandler.handleDeviceData(device, message.toString());
            break;

          case 'control':
            controlHandler.handleControlTopic(device, topic, message.toString());
            break;
        }
      } catch (error) {
        logger.error('Error processing message:', error);
      }
    };

    // Create MQTT client
    mqttClient = new MqttClient(config, deviceManager, messageHandler);

    // Create control handler
    const controlHandler = new ControlHandler(deviceManager, (device, payload) => {
      const topics = deviceManager.getDeviceTopics(device);

      if (!topics) {
        logger.error(`No topics found for device ${device.deviceId}`);
        return;
      }

      Promise.all([
        mqttClient.publish(topics.deviceControlTopicOld, payload, { qos: 1 }),
        mqttClient.publish(topics.deviceControlTopicNew, payload, { qos: 1 }),
      ])
        .then(() => {
          // Request updated device data after sending a command
          // Wait a short delay to allow the device to process the command
          setTimeout(() => {
            logger.info(`Requesting updated device data for ${device.deviceId} after command`);
            mqttClient.requestDeviceData(device);
          }, 500);
        })
        .catch(err => {
          logger.error(`Error sending command to ${device.deviceId}:`, err);
        });
    });

    // Create data handler
    const dataHandler = new DataHandler(deviceManager);

    // Initialize MQTT Proxy if enabled
    let mqttProxy: MqttProxy | null = null;
    if (MQTT_PROXY_ENABLED) {
      logger.info('MQTT Proxy is enabled');
      logger.info(`MQTT Proxy will start on port ${MQTT_PROXY_PORT}`);

      const proxyConfig: MqttProxyConfig = {
        port: MQTT_PROXY_PORT,
        mainBrokerUrl: config.brokerUrl,
        mainBrokerUsername: config.username,
        mainBrokerPassword: config.password,
        proxyClientId: `${config.clientId}-proxy`,
        autoResolveClientIdConflicts: true, // Enable automatic client ID conflict resolution
      };

      mqttProxy = new MqttProxy(proxyConfig, deviceManager);

      try {
        await mqttProxy.start();
        logger.info(`MQTT Proxy started successfully on port ${MQTT_PROXY_PORT}`);
        logger.info('B2500 devices can now connect to this proxy to avoid client ID conflicts');
      } catch (error) {
        logger.error('Failed to start MQTT Proxy:', error);
        logger.warn('Continuing without proxy functionality...');
        mqttProxy = null;
      }
    } else {
      logger.info('MQTT Proxy is disabled (set MQTT_PROXY_ENABLED=true to enable)');
    }

    // Handle process termination
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');

      if (mqttProxy) {
        logger.info('Stopping MQTT Proxy...');
        await mqttProxy.stop();
      }

      await mqttClient.close();
      process.exit();
    });

    // Export for testing
    if (process.env.NODE_ENV === 'test') {
      module.exports.__test__ = {
        deviceManager,
        mqttClient,
        controlHandler,
        dataHandler,
      };
    }

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Start the application
try {
  main().catch(error => {
    logger.error('Unhandled error in main application:', error);
    logger.error('Error details:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
} catch (error) {
  logger.error('Unhandled error in main application:', error);
  logger.error('Error details:', error instanceof Error ? error.stack : String(error));

  // Log environment information to help with debugging
  logger.error('Environment information:');
  logger.error(`Node.js version: ${process.version}`);
  logger.error(`Platform: ${process.platform}`);
  logger.error(`Working directory: ${process.cwd()}`);

  // Exit with error code
  process.exit(1);
}

// Log uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit here to allow the application to continue running
});
