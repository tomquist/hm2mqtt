import { DeviceTopics } from './deviceManager.js';
import { HaDiscoveryConfig } from './homeAssistantDiscovery.js';
import { MqttClient } from 'mqtt';
import logger from './logger.js';
import {
  AdditionalDeviceInfo,
  getDeviceDefinition,
  HaStatefulAdvertiseBuilder,
  KeyPath,
  TypeAtPath,
} from './deviceDefinition.js';
import { Device } from './types.js';

const MAC_REGEX = /^[0-9a-fA-F]{12}$/;

function formatMac(id: string): string {
  const parts = id.toUpperCase().match(/.{2}/g);
  return parts ? parts.join(':') : id.toUpperCase();
}

export interface HaAdvertisement<T, KP extends KeyPath<T> | []> {
  keyPath: KP;
  advertise: HaStatefulAdvertiseBuilder<KP extends KeyPath<T> ? TypeAtPath<T, KeyPath<T>> : void>;
  enabled?: (state: T) => boolean | undefined;
}

export function generateDiscoveryConfigs(
  device: Device,
  topics: DeviceTopics,
  additionalDeviceInfo: AdditionalDeviceInfo,
  topicPrefix: string,
  autodiscoveryTopicPrefix: string,
  deviceState: any = {},
): Array<{ topic: string; config: HaDiscoveryConfig | null }> {
  const deviceDefinition = getDeviceDefinition(device.deviceType);
  const configs: Array<{ topic: string; config: any }> = [];

  const deviceInfo = {
    ids: [`hame_energy_${device.deviceId}`],
    name: `HAME Energy ${device.deviceType} ${device.deviceId}`,
    model_id: device.deviceType,
    manufacturer: 'HAME Energy',
    ...(additionalDeviceInfo.firmwareVersion != null
      ? { sw_version: additionalDeviceInfo.firmwareVersion }
      : {}),
    ...(MAC_REGEX.test(device.deviceId)
      ? { connections: [['bluetooth', formatMac(device.deviceId)]] }
      : {}),
  };
  const origin = {
    name: 'hm2mqtt',
    url: 'https://github.com/tomquist/hm2mqtt',
  };

  // Add availability configuration if topic is provided
  const availabilityConfig = {
    availability: [
      {
        topic: `${topicPrefix}/availability`,
        payload_available: 'online',
        payload_not_available: 'offline',
      },
      ...(topics.availabilityTopic
        ? [
            {
              topic: topics.availabilityTopic,
              payload_available: 'online',
              payload_not_available: 'offline',
            },
          ]
        : []),
    ],
  };
  let nodeId = `${device.deviceType}_${device.deviceId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  for (const messageDefinition of deviceDefinition?.messages ?? []) {
    for (const field of messageDefinition.advertisements) {
      if (field.advertise == null) {
        continue;
      }
      const advertisement = field.advertise({
        commandTopic: topics.controlSubscriptionTopic,
        stateTopic: `${topics.publishTopic}/${messageDefinition.publishPath}`,
        keyPath: field.keyPath,
      });
      const { type: platform, id: _objectId, ...config } = advertisement;
      const objectId = _objectId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const topic = `${autodiscoveryTopicPrefix}/${platform}/${nodeId}/${objectId}/config`;

      if (field.enabled) {
        const enabledResult = field.enabled(deviceState);
        if (enabledResult === undefined) {
          // Defer decision - don't publish anything yet
          continue;
        }
        if (enabledResult === false) {
          // Explicitly disabled
          configs.push({ topic, config: null });
          continue;
        }
      }

      // Component is enabled (or has no enabled check)
      configs.push({
        topic,
        config: {
          ...config,
          ...availabilityConfig,
          unique_id: `${device.deviceId}_${objectId}`,
          device: deviceInfo,
          origin,
        },
      });
    }
  }

  // Clear the retained discovery config of every entity this device used to
  // advertise. An empty payload is what makes Home Assistant drop the entity;
  // without it a renamed or removed entity lingers forever at unknown.
  for (const retired of deviceDefinition?.retiredEntities ?? []) {
    const objectId = retired.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const topic = `${autodiscoveryTopicPrefix}/${retired.platform}/${nodeId}/${objectId}/config`;
    if (configs.some(config => config.topic === topic)) {
      // The entity is still advertised under this identity, so clearing it would
      // delete a live entity. Only a wrong device definition gets here.
      logger.warn(`Skipping retirement of ${topic}: an advertised entity uses the same topic`);
      continue;
    }
    configs.push({ topic, config: null });
  }

  return configs;
}

export function publishDiscoveryConfigs(
  client: MqttClient,
  device: Device,
  deviceTopics: DeviceTopics,
  additionalDeviceInfo: AdditionalDeviceInfo,
  topicPrefix: string,
  autodiscoveryTopicPrefix: string,
  deviceState: any = {},
): void {
  const configs = generateDiscoveryConfigs(
    device,
    deviceTopics,
    additionalDeviceInfo,
    topicPrefix,
    autodiscoveryTopicPrefix,
    deviceState,
  );

  configs.forEach(({ topic, config }) => {
    let message = config == null ? '' : JSON.stringify(config);
    logger.trace(message);
    client.publish(topic, message, { qos: 1, retain: true }, err => {
      if (err) {
        logger.error(`Error publishing discovery config to ${topic}:`, err);
        return;
      }
      if (config == null) {
        logger.debug(`Discovery config for ${topic} is disabled`);
      } else {
        logger.debug(`Published discovery config to ${topic}`);
      }
    });
  });
}
