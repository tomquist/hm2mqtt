import { MqttClient } from './mqttClient';
import { Device } from './types';

jest.mock('mqtt', () => {
  const mockClient = {
    on: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
    end: jest.fn(),
  };

  return {
    connect: jest.fn(() => mockClient),
  };
});

jest.mock('./generateDiscoveryConfigs', () => ({
  publishDiscoveryConfigs: jest.fn(),
}));

jest.mock('./deviceDefinition', () => ({
  getDeviceDefinition: jest.fn(() => ({
    messages: [
      {
        getAdditionalDeviceInfo: (state: any) => ({
          firmwareVersion: state?.fw,
        }),
      },
    ],
  })),
}));

describe('MqttClient discovery re-publish', () => {
  test('re-publishes discovery when additional device info changes after first data on same path (regression #235)', () => {
    const { publishDiscoveryConfigs } = require('./generateDiscoveryConfigs');

    const device: Device = { deviceType: 'HMJ-2', deviceId: 'abc123' };
    const topics = {
      deviceTopicOld: 'hame_energy/HMJ-2/device/abc123/ctrl',
      deviceTopicNew: 'marstek_energy/HMJ-2/device/abc123/ctrl',
      publishTopic: 'homeassistant/HMJ-2/device/abc123/data',
      deviceControlTopicOld: 'hame_energy/HMJ-2/App/abc123/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMJ-2/App/abc123/ctrl',
      controlSubscriptionTopic: 'homeassistant/HMJ-2/control/abc123/control',
      availabilityTopic: 'homeassistant/HMJ-2/availability/abc123',
    };

    let currentState: any = { fw: undefined };
    const deviceManager: any = {
      getDeviceTopics: jest.fn(() => topics),
      getDeviceState: jest.fn(() => currentState),
      getDevices: jest.fn(() => []),
    };

    const config: any = {
      brokerUrl: 'mqtt://localhost:1883',
      clientId: 'test-client',
      topicPrefix: 'homeassistant',
      autodiscoveryTopicPrefix: 'homeassistant',
    };

    const mqttClient = new MqttClient(config, deviceManager, jest.fn());

    // First successful data for this path, but firmware is still unknown
    mqttClient.onDeviceDataReceived(device, 'data');

    // Later on the same path, firmware info becomes available
    currentState = { fw: '116.6' };
    mqttClient.onDeviceDataReceived(device, 'data');

    // We expect discovery to be re-published again so newly enabled entities appear
    expect(publishDiscoveryConfigs).toHaveBeenCalledTimes(2);

    // Verify the second publish carries firmware info
    expect(publishDiscoveryConfigs).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      device,
      topics,
      expect.objectContaining({ firmwareVersion: '116.6' }),
      'homeassistant',
      'homeassistant',
      expect.objectContaining({ fw: '116.6' }),
    );
  });
});
