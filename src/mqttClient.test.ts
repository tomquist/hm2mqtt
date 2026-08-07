import { jest } from '@jest/globals';
import './device/registry.js';

const mockPublish = jest.fn();
const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockEnd = jest.fn();
const mockClient = {
  on: mockOn,
  publish: mockPublish,
  subscribe: mockSubscribe,
  end: mockEnd,
};

jest.unstable_mockModule('mqtt', () => ({
  connect: jest.fn(() => mockClient),
}));

const mockPublishDiscoveryConfigs = jest.fn();
jest.unstable_mockModule('./generateDiscoveryConfigs.js', () => ({
  publishDiscoveryConfigs: mockPublishDiscoveryConfigs,
}));

const mockGetDeviceDefinition = jest.fn(() => ({
  messages: [
    {
      refreshDataPayload: 'cd=1',
      publishPath: 'data',
      getAdditionalDeviceInfo: (state: any) => ({
        firmwareVersion: state?.fw,
      }),
    },
  ],
}));
jest.unstable_mockModule('./deviceDefinition.js', () => ({
  getDeviceDefinition: mockGetDeviceDefinition,
}));

const { MqttClient } = await import('./mqttClient.js');
import type { Device } from './types.js';

describe('MqttClient discovery re-publish', () => {
  test('re-publishes discovery when additional device info changes after first data on same path (regression #235)', () => {
    mockPublishDiscoveryConfigs.mockClear();

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
    expect(mockPublishDiscoveryConfigs).toHaveBeenCalledTimes(2);

    // Verify the second publish carries firmware info
    expect(mockPublishDiscoveryConfigs).toHaveBeenNthCalledWith(
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

  test('only publishes discovery after a cd=1 response, not on non-cd=1 paths', () => {
    mockPublishDiscoveryConfigs.mockClear();

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

    const deviceManager: any = {
      getDeviceTopics: jest.fn(() => topics),
      getDeviceState: jest.fn(() => ({})),
      getDevices: jest.fn(() => []),
    };

    const config: any = {
      brokerUrl: 'mqtt://localhost:1883',
      clientId: 'test-client',
      topicPrefix: 'homeassistant',
      autodiscoveryTopicPrefix: 'homeassistant',
    };

    const mqttClient = new MqttClient(config, deviceManager, jest.fn());

    // A response on a non-cd=1 path (e.g. BMS data) must not announce discovery
    mqttClient.onDeviceDataReceived(device, 'bms');
    expect(mockPublishDiscoveryConfigs).not.toHaveBeenCalled();

    // The first cd=1 response unlocks discovery
    mqttClient.onDeviceDataReceived(device, 'data');
    expect(mockPublishDiscoveryConfigs).toHaveBeenCalledTimes(1);

    // The previously-seen non-cd=1 path still gets its normal first-data publish
    mqttClient.onDeviceDataReceived(device, 'bms');
    expect(mockPublishDiscoveryConfigs).toHaveBeenCalledTimes(2);
  });
});

describe('MqttClient subscribe', () => {
  test('skips subscribing when the topic list is empty (regression #371)', () => {
    mockSubscribe.mockClear();

    const deviceManager: any = {
      getDevices: jest.fn(() => []),
    };
    const config: any = {
      brokerUrl: 'mqtt://localhost:1883',
      clientId: 'test-client',
      topicPrefix: 'homeassistant',
      autodiscoveryTopicPrefix: 'homeassistant',
    };

    const mqttClient = new MqttClient(config, deviceManager, jest.fn());

    mqttClient.subscribe([]);
    expect(mockSubscribe).not.toHaveBeenCalled();

    mqttClient.subscribe(['homeassistant/HME-4/control/ct002/control/refresh']);
    expect(mockSubscribe).toHaveBeenCalledWith(
      ['homeassistant/HME-4/control/ct002/control/refresh'],
      expect.any(Function),
    );
  });
});

describe('MqttClient shouldPoll gating', () => {
  const topics = {
    deviceTopicOld: 'hame_energy/VNSD-0/device/venus1/ctrl',
    deviceTopicNew: 'marstek_energy/VNSD-0/device/venus1/ctrl',
    publishTopic: 'homeassistant/VNSD-0/device/venus1/data',
    deviceControlTopicOld: 'hame_energy/VNSD-0/App/venus1/ctrl',
    deviceControlTopicNew: 'marstek_energy/VNSD-0/App/venus1/ctrl',
    controlSubscriptionTopic: 'homeassistant/VNSD-0/control/venus1/control',
    availabilityTopic: 'homeassistant/VNSD-0/availability/venus1',
  };

  function makeMessage(overrides: any) {
    return {
      isMessage: () => true,
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 1000,
      controlsDeviceAvailability: false,
      enabled: true,
      ...overrides,
    };
  }

  function pollPayloads(packMask: number | undefined): string[] {
    jest.useFakeTimers();
    try {
      mockGetDeviceDefinition.mockReturnValue({
        messages: [
          makeMessage({
            refreshDataPayload: 'cd=1',
            publishPath: 'data',
            controlsDeviceAvailability: true,
          }),
          // bms_idx=1 -> pack 2 -> present iff mask bit 1 set
          makeMessage({
            refreshDataPayload: 'cd=42,bms_idx=1',
            publishPath: 'bmsPack1',
            shouldPoll: (state: any) =>
              state?.packMask != null && (state.packMask & (1 << 1)) !== 0,
          }),
          // bms_idx=2 -> pack 3 -> present iff mask bit 2 set
          makeMessage({
            refreshDataPayload: 'cd=42,bms_idx=2',
            publishPath: 'bmsPack2',
            shouldPoll: (state: any) =>
              state?.packMask != null && (state.packMask & (1 << 2)) !== 0,
          }),
        ],
      } as any);

      mockPublish.mockClear();

      const device: Device = { deviceType: 'VNSD-0', deviceId: 'venus1' };
      const deviceManager: any = {
        getDeviceTopics: () => topics,
        getDeviceState: () => (packMask != null ? { packMask } : undefined),
        getDevices: () => [],
        getResponseTimeout: () => 5000,
        setResponseTimeout: jest.fn(),
        clearResponseTimeout: jest.fn(),
      };
      const config: any = {
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        topicPrefix: 'homeassistant',
        autodiscoveryTopicPrefix: 'homeassistant',
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      mqttClient.requestDeviceData(device);
      jest.advanceTimersByTime(1000);

      return mockPublish.mock.calls.map((c: any[]) => c[1]);
    } finally {
      jest.useRealTimers();
    }
  }

  test('polls only present packs (mask=3 -> pack 2 present, pack 3 absent)', () => {
    const payloads = pollPayloads(3);
    expect(payloads).toContain('cd=1');
    expect(payloads).toContain('cd=42,bms_idx=1');
    expect(payloads).not.toContain('cd=42,bms_idx=2');
  });

  test('polls no pack details until the pack mask is known', () => {
    const payloads = pollPayloads(undefined);
    expect(payloads).toContain('cd=1');
    expect(payloads).not.toContain('cd=42,bms_idx=1');
    expect(payloads).not.toContain('cd=42,bms_idx=2');
  });

  function pollPayloadsFor(messages: any[]): string[] {
    jest.useFakeTimers();
    try {
      mockGetDeviceDefinition.mockReturnValue({ messages } as any);
      mockPublish.mockClear();

      const device: Device = { deviceType: 'VNSD-0', deviceId: 'venus1' };
      const deviceManager: any = {
        getDeviceTopics: () => topics,
        getDeviceState: () => ({}),
        getDevices: () => [],
        getResponseTimeout: () => 5000,
        setResponseTimeout: jest.fn(),
        clearResponseTimeout: jest.fn(),
      };
      const config: any = {
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        topicPrefix: 'homeassistant',
        autodiscoveryTopicPrefix: 'homeassistant',
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      mqttClient.requestDeviceData(device);
      jest.advanceTimersByTime(1000);

      return mockPublish.mock.calls.map((c: any[]) => c[1]);
    } finally {
      jest.useRealTimers();
    }
  }

  test('sends nothing at all when every message is disabled', () => {
    const payloads = pollPayloadsFor([
      makeMessage({ refreshDataPayload: 'cd=13', publishPath: 'cells', enabled: false }),
      makeMessage({ refreshDataPayload: 'cd=21', publishPath: 'calibration', enabled: false }),
    ]);
    expect(payloads).toEqual([]);
  });
});
