import { DeviceTopics } from './deviceManager';
import { HaDiscoveryConfig } from './homeAssistantDiscovery';
import { MqttClient } from 'mqtt';
import {
  AdditionalDeviceInfo,
  getDeviceDefinition,
  HaStatefulAdvertiseBuilder,
  KeyPath,
  TypeAtPath,
} from './deviceDefinition';
import { Device } from './types';

export interface HaAdvertisement<T, KP extends KeyPath<T> | []> {
  keyPath: KP;
  advertise: HaStatefulAdvertiseBuilder<KP extends KeyPath<T> ? TypeAtPath<T, KeyPath<T>> : void>;
}

export function generateDiscoveryConfigs(
  device: Device,
  topics: DeviceTopics,
  additionalDeviceInfo: AdditionalDeviceInfo,
): Array<{ topic: string; config: HaDiscoveryConfig }> {
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
        topic: 'hm2mqtt/availability',
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
      const {
        type: platform,
        id: _objectId,
        ...config
      } = field.advertise({
        commandTopic: topics.controlSubscriptionTopic,
        stateTopic: `${topics.publishTopic}/${messageDefinition.publishPath}`,
        keyPath: field.keyPath,
      });
      const objectId = _objectId.replace(/[^a-zA-Z0-9_-]/g, '_');
      configs.push({
        topic: `homeassistant/${platform}/${nodeId}/${objectId}/config`,
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
): void {
  const configs = generateDiscoveryConfigs(device, deviceTopics, additionalDeviceInfo);

  configs.forEach(({ topic, config }) => {
    let message = JSON.stringify(config);
    console.log(message);
    client.publish(topic, message, { qos: 1, retain: true }, err => {
      if (err) {
        console.error(`Error publishing discovery config to ${topic}:`, err);
        return;
      }
      console.log(`Published discovery config to ${topic}`);
    });
  });
}
