// Must stay the first import: it loads `.env`, and the device definitions read
// environment variables while they are being imported.
import './loadEnv.js';
import './device/registry.js';
import { Device, MqttConfig } from './types.js';
import { DEFAULT_AUTODISCOVERY_TOPIC_PREFIX, DEFAULT_TOPIC_PREFIX } from './constants.js';
import { DeviceManager, DeviceStateData } from './deviceManager.js';
import { MqttClient } from './mqttClient.js';
import { ControlHandler } from './controlHandler.js';
import logger from './logger.js';
import { DataHandler } from './dataHandler.js';
import { MqttProxy, MqttProxyConfig } from './mqttProxy.js';
import { runShutdownStep } from './shutdown.js';
import { flushPersistence } from './persistence.js';

// MQTT Proxy configuration
const MQTT_PROXY_ENABLED = process.env.MQTT_PROXY_ENABLED === 'true';
const MQTT_PROXY_PORT = parseInt(process.env.MQTT_PROXY_PORT || '1890', 10);

/**
 * Parse device configurations from environment variables
 *
 * @returns Array of device configurations
 */
function parseDeviceConfigurations(): Device[] {
  const devices: Device[] = [];

  // Log all device-related environment variables
  logger.debug('Device environment variables:');
  const deviceEnvVars = Object.keys(process.env)
    .filter(key => key.startsWith('DEVICE_'))
    .sort();

  if (deviceEnvVars.length === 0) {
    logger.warn('No DEVICE_ environment variables found!');
  } else {
    deviceEnvVars.forEach(key => {
      logger.debug(`${key}=${process.env[key]}`);
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
          logger.info(`Registering device: ${deviceType}:${deviceId} from ${key}=${value}`);
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
    logger.warn('This could be due to:');
    logger.warn('1. Missing device configuration in the addon config');
    logger.warn('2. Environment variables not being properly set');

    logger.info('\nEnvironment variables:');
    Object.keys(process.env)
      .filter(key => !key.toLowerCase().includes('password'))
      .sort()
      .forEach(key => {
        logger.info(`${key}=${process.env[key]}`);
      });

    logger.info('\nPlease check your addon configuration and ensure you have added devices.');
    logger.info('Example configuration:');
    logger.info(
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
    autodiscoveryTopicPrefix:
      process.env.AUTODISCOVERY_TOPIC_PREFIX || DEFAULT_AUTODISCOVERY_TOPIC_PREFIX,
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
    logger.info(`Build commit: ${process.env.BUILD_COMMIT || 'unknown'}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
    logger.info(
      `MQTT Proxy: ${MQTT_PROXY_ENABLED ? `enabled on port ${MQTT_PROXY_PORT}` : 'disabled'}`,
    );

    // Log all environment variables in debug mode
    if (logger.levelVal <= logger.levels.values.debug) {
      logger.trace('Environment variables:');
      Object.keys(process.env)
        .filter(key => !key.toLowerCase().includes('password'))
        .sort()
        .forEach(key => {
          logger.trace(`${key}=${process.env[key]}`);
        });

      // Print full configuration
      logger.debug('Full configuration:');
      const config = createMqttConfig(parseDeviceConfigurations());
      logger.debug(
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
    logger.debug('Parsing device configurations...');
    const devices = parseDeviceConfigurations();
    logger.info(`Found ${devices.length} device(s)`);
    devices.forEach(device => {
      logger.info(`- Device: ${device.deviceType}:${device.deviceId}`);
    });

    // Create MQTT configuration
    logger.debug('Creating MQTT configuration...');
    const config = createMqttConfig(devices);
    logger.debug(`MQTT Broker: ${config.brokerUrl}`);
    logger.debug(`MQTT Client ID: ${config.clientId}`);
    logger.debug(
      'Full MQTT config:',
      JSON.stringify(config, (key, value) => (key === 'password' ? '***' : value), 2),
    );

    const deviceStateUpdateHandler = (
      device: Device,
      publishPath: string,
      deviceState: DeviceStateData,
    ) => {
      const topics = deviceManager.getDeviceTopics(device);
      if (!topics) {
        logger.warn(`No topics found for device ${device.deviceId}`);
        return;
      }
      const topic = `${topics.publishTopic}/${publishPath}`;
      logger.debug(`Device state ${topic} updated: ${JSON.stringify(deviceState)}`);
      mqttClient
        .publish(topic, JSON.stringify(deviceState), { qos: 1 })
        .catch(err => logger.error(`Error publishing message for ${device.deviceId}:`, err));
    };

    // Create device manager
    const deviceManager = new DeviceManager(config, deviceStateUpdateHandler);

    // Create handlers
    let mqttClient: MqttClient;

    // Create message handler function
    const messageHandler = (topic: string, message: Buffer) => {
      try {
        logger.debug(`Received message on topic ${topic}: ${message.toString()}`);

        // Find which device this topic belongs to
        const deviceInfo = deviceManager.findDeviceForTopic(topic);

        if (!deviceInfo) {
          logger.warn(`Received message on unrecognized topic: ${topic}`);
          return;
        }
        const topics = deviceManager.getDeviceTopics(deviceInfo.device);
        logger.debug(`Device topics:`, topics);

        const { device, topicType } = deviceInfo;
        logger.debug(
          `Device info: ${device.deviceType}:${device.deviceId}, topic type: ${topicType}`,
        );

        // Handle based on topic type
        switch (topicType) {
          case 'device':
            if (topics) {
              mqttClient.publish(topics.availabilityTopic, 'online', { qos: 1, retain: true });
              mqttClient.resetTimeoutCounter(device.deviceId);
            }

            deviceManager.clearResponseTimeout(device);
            const updatedPaths = dataHandler.handleDeviceData(device, message.toString());
            // Re-publish discovery configs for each message path that received data for the first time
            updatedPaths.forEach(path => mqttClient.onDeviceDataReceived(device, path));
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
        logger.warn(`No topics found for device ${device.deviceId}`);
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
            logger.debug(`Requesting updated device data for ${device.deviceId} after command`);
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
      logger.debug(`MQTT Proxy is enabled on port ${MQTT_PROXY_PORT}`);

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
      } catch (error) {
        logger.error('Failed to start MQTT Proxy:', error);
        logger.warn('Continuing without proxy functionality...');
        mqttProxy = null;
      }
    } else {
      logger.info('MQTT Proxy is disabled (set MQTT_PROXY_ENABLED=true to enable)');
    }

    // Handle process termination. SIGTERM matters as much as SIGINT: Docker and
    // the Home Assistant Supervisor both send it to stop a container, so without
    // a handler an ordinary restart or add-on update skipped this path entirely
    // and the container was killed after the grace period instead — which is
    // also exactly the case the cell balancing history has to survive.
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger.info(`Received ${signal}, shutting down...`);

      // Each step is independent and time-bounded, because neither failing nor
      // hanging may keep the process alive. MqttProxy.stop() waits for its TCP
      // server to close, and a TCP server does not close while a client still
      // holds a connection open — so a device that is still connected would
      // otherwise block the exit until the runtime killed us, which is the
      // outcome this handler exists to avoid. A failure to stop the proxy must
      // also not cost us the MQTT close, which is what publishes the offline
      // availability, nor the flush this whole path exists for.
      await runShutdownStep('flushing the cell balancing history', async () => flushPersistence());

      const proxy = mqttProxy;
      if (proxy) {
        logger.info('Stopping MQTT Proxy...');
        await runShutdownStep('stopping the MQTT proxy', () => proxy.stop());
      }
      await runShutdownStep('closing the MQTT connection', () => mqttClient.close());

      process.exit();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    logger.debug('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application');
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
      if (logger.levelVal <= logger.levels.values.debug) {
        logger.debug('Stack trace:', error.stack);
      }
    } else {
      logger.error('Error:', error);
    }
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
