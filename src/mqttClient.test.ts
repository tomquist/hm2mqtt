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
      autodiscoveryEnabled: true,
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
      autodiscoveryEnabled: true,
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

  test('publishes no discovery configs when auto discovery is disabled', () => {
    mockPublishDiscoveryConfigs.mockClear();
    // Cleared so the connect handler picked up below is the one this test registers
    mockOn.mockClear();
    jest.useFakeTimers();

    try {
      const device: Device = { deviceType: 'HMJ-2', deviceId: 'abc123' };
      const topics = {
        deviceTopicOld: 'hame_energy/HMJ-2/device/abc123/ctrl',
        deviceTopicNew: 'marstek_energy/HMJ-2/device/abc123/ctrl',
        publishTopic: 'hm2mqtt/HMJ-2/device/abc123/data',
        deviceControlTopicOld: 'hame_energy/HMJ-2/App/abc123/ctrl',
        deviceControlTopicNew: 'marstek_energy/HMJ-2/App/abc123/ctrl',
        controlSubscriptionTopic: 'hm2mqtt/HMJ-2/control/abc123/control',
        availabilityTopic: 'hm2mqtt/HMJ-2/availability/abc123',
      };

      const deviceManager: any = {
        getDeviceTopics: jest.fn(() => topics),
        getDeviceState: jest.fn(() => ({})),
        getDevices: jest.fn(() => [device]),
        getControlTopics: jest.fn(() => []),
        getPollingInterval: jest.fn(() => 60000),
      };

      const config: any = {
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        topicPrefix: 'hm2mqtt',
        autodiscoveryTopicPrefix: 'homeassistant',
        autodiscoveryEnabled: false,
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());

      // The first cd=1 response would normally announce the device
      mqttClient.onDeviceDataReceived(device, 'data');
      expect(mockPublishDiscoveryConfigs).not.toHaveBeenCalled();

      // Neither the connect handler nor the hourly re-publish announce anything
      const connectHandler = mockOn.mock.calls.find(
        ([event]) => event === 'connect',
      )?.[1] as () => void;
      connectHandler();
      jest.advanceTimersByTime(3600000);
      expect(mockPublishDiscoveryConfigs).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
      autodiscoveryEnabled: true,
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
        autodiscoveryEnabled: true,
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

  function pollFor(messages: any[]): { payloads: string[]; setResponseTimeout: jest.Mock } {
    jest.useFakeTimers();
    try {
      mockGetDeviceDefinition.mockReturnValue({ messages } as any);
      mockPublish.mockClear();

      const device: Device = { deviceType: 'VNSD-0', deviceId: 'venus1' };
      const setResponseTimeout = jest.fn();
      const deviceManager: any = {
        getDeviceTopics: () => topics,
        getDeviceState: () => ({}),
        getDevices: () => [],
        getResponseTimeout: () => 5000,
        setResponseTimeout,
        clearResponseTimeout: jest.fn(),
      };
      const config: any = {
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        topicPrefix: 'homeassistant',
        autodiscoveryTopicPrefix: 'homeassistant',
        autodiscoveryEnabled: true,
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      mqttClient.requestDeviceData(device);
      jest.advanceTimersByTime(1000);

      return { payloads: mockPublish.mock.calls.map((c: any[]) => c[1]), setResponseTimeout };
    } finally {
      jest.useRealTimers();
    }
  }

  test('sends nothing at all when every message is disabled', () => {
    const { payloads } = pollFor([
      makeMessage({ refreshDataPayload: 'cd=13', publishPath: 'cells', enabled: false }),
      makeMessage({ refreshDataPayload: 'cd=21', publishPath: 'calibration', enabled: false }),
    ]);
    expect(payloads).toEqual([]);
  });

  test('a disabled message does not arm a response timeout it can never answer', () => {
    // The send loop always skipped disabled messages, so the assertion above
    // held before this change too. This is the behaviour that actually moved:
    // the due-check loop used to see the disabled message, mark the device as
    // needing a refresh and — because the message controls availability — arm a
    // response timeout for a request that is never sent. Nothing could answer
    // it, so it would fire and count towards marking the device offline.
    const { payloads, setResponseTimeout } = pollFor([
      makeMessage({
        refreshDataPayload: 'cd=1',
        publishPath: 'data',
        controlsDeviceAvailability: true,
        enabled: false,
      }),
    ]);
    expect(payloads).toEqual([]);
    expect(setResponseTimeout).not.toHaveBeenCalled();
  });
});

describe('MqttClient forced refresh', () => {
  const topics = {
    deviceTopicOld: 'hame_energy/HMA-1/device/b2500/ctrl',
    deviceTopicNew: 'marstek_energy/HMA-1/device/b2500/ctrl',
    publishTopic: 'homeassistant/HMA-1/device/b2500/data',
    deviceControlTopicOld: 'hame_energy/HMA-1/App/b2500/ctrl',
    deviceControlTopicNew: 'marstek_energy/HMA-1/App/b2500/ctrl',
    controlSubscriptionTopic: 'homeassistant/HMA-1/control/b2500/control',
    availabilityTopic: 'homeassistant/HMA-1/availability/b2500',
  };

  const device: Device = { deviceType: 'HMA-1', deviceId: 'b2500' };

  function makeMessage(overrides: any) {
    return {
      isMessage: () => true,
      getAdditionalDeviceInfo: () => ({}),
      // Long enough that nothing is ever due again during a test
      pollInterval: 60000,
      controlsDeviceAvailability: false,
      enabled: true,
      ...overrides,
    };
  }

  /**
   * Poll once so every message has a recent `lastRequestTime`, then return a
   * client that is well inside its polling interval.
   */
  function setUpPolledClient(messages: any[], state: any = {}) {
    mockGetDeviceDefinition.mockReturnValue({ messages } as any);
    const deviceManager: any = {
      getDeviceTopics: () => topics,
      getDeviceState: () => state,
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
      autodiscoveryEnabled: true,
    };
    const mqttClient = new MqttClient(config, deviceManager, jest.fn());
    mqttClient.requestDeviceData(device);
    jest.advanceTimersByTime(1000);
    mockPublish.mockClear();
    return mqttClient;
  }

  function payloadsAfter(fn: () => void): string[] {
    fn();
    jest.advanceTimersByTime(1000);
    return mockPublish.mock.calls.map((c: any[]) => c[1]);
  }

  const runtime = () =>
    makeMessage({
      refreshDataPayload: 'cd=1',
      publishPath: 'data',
      controlsDeviceAvailability: true,
    });
  const cells = (overrides: any = {}) =>
    makeMessage({ refreshDataPayload: 'cd=13', publishPath: 'cells', ...overrides });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('re-reads only the forced message while the poll interval is still running', () => {
    const mqttClient = setUpPolledClient([runtime(), cells()]);

    // Without forcing, nothing is due yet
    expect(payloadsAfter(() => mqttClient.requestDeviceData(device))).toEqual([]);

    const payloads = payloadsAfter(() =>
      mqttClient.requestDeviceData(device, { forceMessageIndices: [0] }),
    );
    expect(payloads).toContain('cd=1');
    expect(payloads).not.toContain('cd=13');
  });

  test('re-anchors the poll schedule so a forced read is not followed by a due one', () => {
    // Not the availability message: advancing past its response timeout below
    // would publish `offline` and pollute the payload assertion.
    const mqttClient = setUpPolledClient([cells()]);

    // The regular poll ran at t=0, so the next one is due at t=60000. Forcing a
    // read at t=1000 has to move that deadline to t=61000.
    payloadsAfter(() => mqttClient.requestDeviceData(device, { forceMessageIndices: [0] }));
    mockPublish.mockClear();

    // Land at t=60500, between the two deadlines. Without re-anchoring the
    // message reads as due here and this request would publish.
    jest.advanceTimersByTime(58500);
    expect(payloadsAfter(() => mqttClient.requestDeviceData(device))).toEqual([]);
  });

  test('does not force a disabled message', () => {
    const mqttClient = setUpPolledClient([runtime(), cells({ enabled: false })]);

    expect(
      payloadsAfter(() => mqttClient.requestDeviceData(device, { forceMessageIndices: [1] })),
    ).toEqual([]);
  });

  test('does not force a message its poll predicate rules out', () => {
    const mqttClient = setUpPolledClient([runtime(), cells({ shouldPoll: () => false })]);

    expect(
      payloadsAfter(() => mqttClient.requestDeviceData(device, { forceMessageIndices: [1] })),
    ).toEqual([]);
  });

  test('ignores an out-of-range index', () => {
    const mqttClient = setUpPolledClient([runtime()]);

    expect(
      payloadsAfter(() => mqttClient.requestDeviceData(device, { forceMessageIndices: [7] })),
    ).toEqual([]);
  });
});
