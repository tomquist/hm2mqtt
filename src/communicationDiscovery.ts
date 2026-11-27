import type { Device } from './types.js';
import type { AdditionalDeviceInfo } from './deviceDefinition.js';
import { discoveryDeviceInfo } from './discoveryDeviceInfo.js';

const sensors = [
  {
    id: 'communication_total_timeouts',
    name: 'Communication Timeouts',
    key: 'totalTimeouts',
    icon: 'mdi:alert-circle-outline',
  },
  {
    id: 'communication_consecutive_timeouts',
    name: 'Consecutive Timeouts',
    key: 'consecutiveTimeouts',
    icon: 'mdi:connection',
  },
  {
    id: 'communication_received_messages',
    name: 'Received Device Messages',
    key: 'receivedMessages',
    icon: 'mdi:message-processing-outline',
  },
  {
    id: 'communication_last_message',
    name: 'Last Device Message',
    key: 'lastMessageAt',
    deviceClass: 'timestamp',
    icon: 'mdi:clock-outline',
  },
  {
    id: 'communication_last_timeout',
    name: 'Last Communication Timeout',
    key: 'lastTimeoutAt',
    deviceClass: 'timestamp',
    icon: 'mdi:timer-alert-outline',
  },
] as const;

export function communicationStateTopic(publishTopic: string): string {
  return `${publishTopic}/communication`;
}

export function generateCommunicationDiscovery(
  device: Device,
  publishTopic: string,
  topicPrefix: string,
  discoveryPrefix: string,
  enabled: boolean,
  additionalDeviceInfo: AdditionalDeviceInfo = {},
) {
  const nodeId = `${device.deviceType}_${device.deviceId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  return sensors.map(sensor => {
    const topic = `${discoveryPrefix}/sensor/${nodeId}/${sensor.id}/config`;

    if (!enabled) {
      return { topic, config: null };
    }

    const timestamp = 'deviceClass' in sensor;

    return {
      topic,
      config: {
        name: sensor.name,
        unique_id: `${device.deviceId}_${sensor.id}`,
        entity_category: 'diagnostic',
        enabled_by_default: false,
        icon: sensor.icon,
        state_topic: communicationStateTopic(publishTopic),
        value_template: timestamp
          ? `{{ value_json.${sensor.key} | default(none, true) }}`
          : `{{ value_json.${sensor.key} }}`,
        ...(timestamp ? { device_class: sensor.deviceClass } : {}),
        availability: [
          {
            topic: `${topicPrefix}/availability`,
            payload_available: 'online',
            payload_not_available: 'offline',
          },
        ],
        device: discoveryDeviceInfo(device, additionalDeviceInfo),
        origin: {
          name: 'hm2mqtt',
          url: 'https://github.com/tomquist/hm2mqtt',
        },
      },
    };
  });
}
