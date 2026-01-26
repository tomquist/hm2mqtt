import { DeviceTopics } from './deviceManager';
import { HaDiscoveryConfig } from './homeAssistantDiscovery';
import { MqttClient } from 'mqtt';
import logger from './logger';
import {
  AdditionalDeviceInfo,
  getDeviceDefinition,
  HaStatefulAdvertiseBuilder,
  KeyPath,
  TypeAtPath,
  FieldInfo,
  FieldDefinition,
  BaseDeviceData,
} from './deviceDefinition';
import { Device } from './types';
import { Transform } from './transforms';

export interface HaAdvertisement<T, KP extends KeyPath<T> | []> {
  keyPath: KP;
  advertise: HaStatefulAdvertiseBuilder<KP extends KeyPath<T> ? TypeAtPath<T, KeyPath<T>> : void>;
  enabled?: (state: T) => boolean | undefined;
}

export interface DiscoveryOptions {
  /**
   * When true, generates Jinja2 templates that parse raw MQTT messages directly.
   * The value_template will decompose the raw message into key-value pairs,
   * extract the relevant values, and apply transforms using Jinja2.
   */
  useJinjaTemplates?: boolean;
}

/**
 * Find the field definition that matches the given key path.
 * Returns undefined if no match is found or if the path is empty (non-stateful components).
 */
function findMatchingField<T extends BaseDeviceData>(
  fields: FieldDefinition<T, KeyPath<T>>[],
  keyPath: KeyPath<T> | [],
): FieldInfo | undefined {
  if (keyPath.length === 0) {
    return undefined;
  }

  for (const field of fields) {
    // Compare paths - they should match exactly
    if (field.path.length === keyPath.length && field.path.every((p, i) => p === keyPath[i])) {
      // Check if transform is a declarative Transform object
      const transform = field.transform;
      if (transform && typeof transform === 'object' && 'type' in transform) {
        return {
          key: field.key,
          transform: transform as Transform,
        };
      }
      // Field found but transform is a function or undefined
      return {
        key: field.key,
        transform: undefined,
      };
    }
  }

  return undefined;
}

export function generateDiscoveryConfigs(
  device: Device,
  topics: DeviceTopics,
  additionalDeviceInfo: AdditionalDeviceInfo,
  topicPrefix: string,
  deviceState: any = {},
  options: DiscoveryOptions = {},
): Array<{ topic: string; config: HaDiscoveryConfig | null }> {
  const { useJinjaTemplates = false } = options;
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
    for (const advertisement of messageDefinition.advertisements) {
      if (advertisement.advertise == null) {
        continue;
      }

      // Find matching field definition when using Jinja templates
      const fieldInfo = useJinjaTemplates
        ? findMatchingField(messageDefinition.fields, advertisement.keyPath)
        : undefined;

      // In Jinja mode, use the original device topic where raw messages arrive;
      // otherwise use the parsed JSON topic
      const stateTopic = useJinjaTemplates
        ? topics.deviceTopicOld
        : `${topics.publishTopic}/${messageDefinition.publishPath}`;

      const haComponent = advertisement.advertise({
        commandTopic: topics.controlSubscriptionTopic,
        stateTopic,
        keyPath: advertisement.keyPath,
        fieldInfo,
      });
      const { type: platform, id: _objectId, ...config } = haComponent;
      const objectId = _objectId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const topic = `homeassistant/${platform}/${nodeId}/${objectId}/config`;

      if (advertisement.enabled) {
        const enabledResult = advertisement.enabled(deviceState);
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
  return configs;
}

export function publishDiscoveryConfigs(
  client: MqttClient,
  device: Device,
  deviceTopics: DeviceTopics,
  additionalDeviceInfo: AdditionalDeviceInfo,
  topicPrefix: string,
  deviceState: any = {},
  options: DiscoveryOptions = {},
): void {
  const configs = generateDiscoveryConfigs(
    device,
    deviceTopics,
    additionalDeviceInfo,
    topicPrefix,
    deviceState,
    options,
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
