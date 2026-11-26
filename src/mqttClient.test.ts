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
import logger from './logger.js';

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
      communicationDiagnostics: false,
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
      communicationDiagnostics: false,
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

  test.each([
    ['cd=01', 1],
    ['cd=10', 0],
  ])('a response to a %s poll publishes discovery %i time(s)', (refreshDataPayload, expected) => {
    mockPublishDiscoveryConfigs.mockClear();
    // The Venus E Mini polls with the zero-padded cd=01 (#450)
    const defaultImplementation = mockGetDeviceDefinition.getMockImplementation()!;
    mockGetDeviceDefinition.mockImplementation(() => ({
      messages: [
        {
          refreshDataPayload,
          publishPath: 'data',
          getAdditionalDeviceInfo: () => ({ firmwareVersion: undefined }),
        },
      ],
    }));

    try {
      const device: Device = { deviceType: 'VNSEMINI-0', deviceId: 'abc123' };
      const deviceManager: any = {
        getDeviceTopics: jest.fn(() => ({})),
        getDeviceState: jest.fn(() => ({})),
        getDevices: jest.fn(() => []),
      };
      const config: any = {
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        topicPrefix: 'homeassistant',
        autodiscoveryTopicPrefix: 'homeassistant',
        communicationDiagnostics: false,
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      mqttClient.onDeviceDataReceived(device, 'data');

      expect(mockPublishDiscoveryConfigs).toHaveBeenCalledTimes(expected);
    } finally {
      mockGetDeviceDefinition.mockImplementation(defaultImplementation);
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
      communicationDiagnostics: false,
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
        communicationDiagnostics: false,
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
        communicationDiagnostics: false,
      };

      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      mqttClient.requestDeviceData(device);
      jest.advanceTimersByTime(1000);

      return { payloads: mockPublish.mock.calls.map((c: any[]) => c[1]), setResponseTimeout };
    } finally {
      jest.useRealTimers();
    }
  }

  test('never requests a derived message', () => {
    const { payloads } = pollFor([
      makeMessage({ refreshDataPayload: 'cd=1', publishPath: 'data' }),
      makeMessage({
        refreshDataPayload: 'cd=999',
        publishPath: 'cellBalancing',
        polled: false,
      }),
    ]);
    expect(payloads).toContain('cd=1');
    expect(payloads).not.toContain('cd=999');
  });

  test('sends nothing at all when every message is derived or disabled', () => {
    const { payloads } = pollFor([
      makeMessage({ refreshDataPayload: 'cd=13', publishPath: 'cells', enabled: false }),
      makeMessage({
        refreshDataPayload: 'cd=999',
        publishPath: 'cellBalancing',
        polled: false,
      }),
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

describe('MqttClient poll offset', () => {
  test('sends a message with a poll offset that much later than the others', () => {
    jest.useFakeTimers();
    try {
      const message = (overrides: any) => ({
        isMessage: () => true,
        getAdditionalDeviceInfo: () => ({}),
        pollInterval: 1000,
        controlsDeviceAvailability: false,
        enabled: true,
        ...overrides,
      });
      mockGetDeviceDefinition.mockReturnValue({
        messages: [
          message({ refreshDataPayload: 'cd=1', publishPath: 'data' }),
          message({ refreshDataPayload: 'cd=31', publishPath: 'm', pollOffsetMs: 2000 }),
        ],
      } as any);
      mockPublish.mockClear();

      const deviceManager: any = {
        getDeviceTopics: () => ({
          deviceControlTopicOld: 'old',
          deviceControlTopicNew: 'new',
          availabilityTopic: 'avail',
        }),
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
        communicationDiagnostics: false,
      };
      const mqttClient = new MqttClient(config, deviceManager, jest.fn());
      const payloads = () => mockPublish.mock.calls.map((c: any[]) => c[1]);

      mqttClient.requestDeviceData({ deviceType: 'HME-4', deviceId: 'meter' });
      jest.advanceTimersByTime(0);
      expect(payloads()).toEqual(['cd=1', 'cd=1']);

      // The second message keeps its usual 100 ms slot plus the offset
      jest.advanceTimersByTime(2099);
      expect(payloads()).not.toContain('cd=31');
      jest.advanceTimersByTime(1);
      expect(payloads()).toEqual(['cd=1', 'cd=1', 'cd=31', 'cd=31']);
    } finally {
      jest.useRealTimers();
    }
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
      communicationDiagnostics: false,
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

  // The polling timer fires every poll interval, but the time it reads is not
  // exactly one interval after the last one: the event loop's clock can lag the
  // real one by a few milliseconds. A message that was due must not be skipped
  // for that, which would push its next read a whole interval back.
  test('polls a message whose interval elapsed while the timer fired a moment early', () => {
    const mqttClient = setUpPolledClient([cells()]);

    // The regular poll ran at t=0; land at t=59999.
    jest.advanceTimersByTime(58999);
    expect(payloadsAfter(() => mqttClient.requestDeviceData(device))).toContain('cd=13');
  });

  test('polls a message exactly one interval after it was last requested', () => {
    const mqttClient = setUpPolledClient([cells()]);

    jest.advanceTimersByTime(59000);
    expect(payloadsAfter(() => mqttClient.requestDeviceData(device))).toContain('cd=13');
  });

  test('does not poll a message that is still a second away from due', () => {
    const mqttClient = setUpPolledClient([cells()]);

    jest.advanceTimersByTime(58000);
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

describe('MqttClient connection logging', () => {
  test('does not log the broker password (regression #424)', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    try {
      const config: any = {
        brokerUrl: 'mqtt://user:secret@broker:1883',
        clientId: 'test-client',
        topicPrefix: 'homeassistant',
        autodiscoveryTopicPrefix: 'homeassistant',
        communicationDiagnostics: false,
      };
      const deviceManager: any = { getDevices: jest.fn(() => []) };

      new MqttClient(config, deviceManager, jest.fn());

      const logged = infoSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain('secret');
      expect(logged).toContain('mqtt://user:***@broker:1883');
    } finally {
      infoSpy.mockRestore();
    }
  });
});

describe('MqttClient communication diagnostics', () => {
  const device: Device = {
    deviceType: 'HMJ-2',
    deviceId: 'diagnostics-test',
  };

  const config: any = {
    brokerUrl: 'mqtt://localhost:1883',
    clientId: 'diagnostics-client',
    topicPrefix: 'hm2mqtt',
    autodiscoveryTopicPrefix: 'homeassistant',
    communicationDiagnostics: true,
  };

  function createClient() {
    return new MqttClient(
      config,
      {
        getDevices: () => [],
      } as any,
      jest.fn(),
    );
  }

  test('starts with empty communication statistics', () => {
    const client = createClient();

    expect(client.getCommunicationStats(device)).toEqual({
      totalTimeouts: 0,
      consecutiveTimeouts: 0,
      receivedMessages: 0,
      lastMessageAt: null,
      lastTimeoutAt: null,
    });
  });

  test('records incoming device messages', () => {
    const client = createClient();

    client.recordDeviceMessage(device);
    client.recordDeviceMessage(device);

    const stats = client.getCommunicationStats(device);

    expect(stats.receivedMessages).toBe(2);
    expect(stats.lastMessageAt).not.toBeNull();
    expect(stats.consecutiveTimeouts).toBe(0);
  });

  test('keeps statistics isolated between devices', () => {
    const client = createClient();

    client.recordDeviceMessage(device);

    expect(
      client.getCommunicationStats({
        ...device,
        deviceId: 'another-device',
      }).receivedMessages,
    ).toBe(0);
  });
});

describe('MqttClient communication timeout lifecycle', () => {
  const device: Device = {
    deviceType: 'HMJ-2',
    deviceId: 'timeout-test',
  };

  const config: any = {
    brokerUrl: 'mqtt://localhost:1883',
    clientId: 'timeout-test-client',
    topicPrefix: 'hm2mqtt',
    autodiscoveryTopicPrefix: 'homeassistant',
    communicationDiagnostics: true,
    allowedConsecutiveTimeouts: 3,
  };

  let previousDefinition: any;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPublish.mockClear();

    previousDefinition = mockGetDeviceDefinition.getMockImplementation();

    mockGetDeviceDefinition.mockReturnValue({
      messages: [
        {
          refreshDataPayload: 'cd=1',
          publishPath: 'data',
          enabled: true,
          pollInterval: 60000,
          controlsDeviceAvailability: true,
          getAdditionalDeviceInfo: () => ({}),
        },
      ],
    } as any);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();

    if (previousDefinition) {
      mockGetDeviceDefinition.mockImplementation(previousDefinition);
    }
  });

  function createClient() {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const manager: any = {
      getDevices: () => [],
      getDeviceTopics: () => ({
        deviceControlTopicOld: 'old/control',
        deviceControlTopicNew: 'new/control',
        availabilityTopic: 'test/availability',
      }),
      getDeviceState: () => ({}),
      getResponseTimeout: () => 5000,

      setResponseTimeout: (_device: Device, timer: ReturnType<typeof setTimeout>) => {
        timers.push(timer);
      },

      clearResponseTimeout: () => {
        timers.splice(0).forEach(timer => {
          clearTimeout(timer);
        });
      },
    };

    const client = new MqttClient(config, manager, jest.fn());

    return { client, manager };
  }

  function expirePoll(client: InstanceType<typeof MqttClient>) {
    client.requestDeviceData(device);
    jest.advanceTimersByTime(60000);
  }

  test('records real timeout callbacks and preserves the offline threshold', () => {
    const { client } = createClient();

    expirePoll(client);

    expect(client.getCommunicationStats(device).totalTimeouts).toBe(1);

    expect(client.getCommunicationStats(device).consecutiveTimeouts).toBe(1);

    expect(client.getCommunicationStats(device).lastTimeoutAt).not.toBeNull();

    expect(
      mockPublish.mock.calls.some(call => call[0] === 'test/availability' && call[1] === 'offline'),
    ).toBe(false);

    expirePoll(client);
    expirePoll(client);

    expect(client.getCommunicationStats(device).totalTimeouts).toBe(3);

    expect(client.getCommunicationStats(device).consecutiveTimeouts).toBe(3);

    expect(
      mockPublish.mock.calls.some(call => call[0] === 'test/availability' && call[1] === 'offline'),
    ).toBe(true);
  });

  test('preserves cumulative statistics when communication recovers', () => {
    const { client, manager } = createClient();

    expirePoll(client);
    expirePoll(client);

    client.requestDeviceData(device);
    jest.advanceTimersByTime(1000);

    // Simulate the existing incoming-message lifecycle.
    client.resetTimeoutCounter(device.deviceId);
    manager.clearResponseTimeout(device);
    client.recordDeviceMessage(device);

    jest.advanceTimersByTime(59000);

    const recovered = client.getCommunicationStats(device);

    expect(recovered.totalTimeouts).toBe(2);
    expect(recovered.consecutiveTimeouts).toBe(0);
    expect(recovered.receivedMessages).toBe(1);
    expect(recovered.lastMessageAt).not.toBeNull();

    expirePoll(client);

    const nextTimeout = client.getCommunicationStats(device);

    expect(nextTimeout.totalTimeouts).toBe(3);
    expect(nextTimeout.consecutiveTimeouts).toBe(1);

    expect(
      mockPublish.mock.calls.some(call => call[0] === 'test/availability' && call[1] === 'offline'),
    ).toBe(false);
  });
});

describe('MqttClient communication publishing', () => {
  const device: Device = {
    deviceType: 'HMJ-2',
    deviceId: 'publishing-test',
  };

  const topics = {
    deviceTopicOld: 'old/device',
    deviceTopicNew: 'new/device',
    publishTopic: 'hm2mqtt/test/device',
    deviceControlTopicOld: 'old/control',
    deviceControlTopicNew: 'new/control',
    controlSubscriptionTopic: 'test/control',
    availabilityTopic: 'test/availability',
  };

  const stateTopic = `${topics.publishTopic}/communication`;

  const config = {
    brokerUrl: 'mqtt://localhost:1883',
    clientId: 'publishing-test-client',
    topicPrefix: 'hm2mqtt',
    autodiscoveryTopicPrefix: 'homeassistant',
    communicationDiagnostics: false,
    devices: [device],
    allowedConsecutiveTimeouts: 3,
  };

  let previousDefinition: any;

  function setConnected(connected: boolean) {
    Object.assign(mockClient, { connected });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    mockPublish.mockClear();
    mockOn.mockClear();
    mockSubscribe.mockClear();

    previousDefinition = mockGetDeviceDefinition.getMockImplementation();

    mockGetDeviceDefinition.mockReturnValue({
      messages: [
        {
          refreshDataPayload: 'cd=1',
          publishPath: 'data',
          enabled: true,
          pollInterval: 60000,
          controlsDeviceAvailability: true,
          getAdditionalDeviceInfo: () => ({}),
        },
      ],
    } as any);

    setConnected(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    Reflect.deleteProperty(mockClient, 'connected');

    if (previousDefinition) {
      mockGetDeviceDefinition.mockImplementation(previousDefinition);
    }
  });

  function createClient(enabled = true) {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const manager: any = {
      getDevices: () => [device],
      getDeviceTopics: () => topics,
      getControlTopics: () => [],
      getDeviceState: () => ({}),
      getPollingInterval: () => 60000,
      getResponseTimeout: () => 5000,

      setResponseTimeout: (_device: Device, timer: ReturnType<typeof setTimeout>) => {
        timers.push(timer);
      },

      clearResponseTimeout: () => {
        timers.splice(0).forEach(timer => clearTimeout(timer));
      },
    };

    return new MqttClient(
      {
        ...config,
        communicationDiagnostics: enabled,
      },
      manager,
      jest.fn(),
    );
  }

  function connect() {
    setConnected(true);

    const event = mockOn.mock.calls.find(call => call[0] === 'connect');

    expect(event).toBeDefined();

    (event![1] as () => void)();
  }

  function stateMessages() {
    return mockPublish.mock.calls.filter(call => call[0] === stateTopic);
  }

  function discoveryMessages() {
    return mockPublish.mock.calls.filter(
      call =>
        typeof call[0] === 'string' &&
        call[0].startsWith('homeassistant/sensor/') &&
        call[0].includes('/communication_') &&
        call[0].endsWith('/config'),
    );
  }

  test('publishes five retained diagnostic configs and initial state', () => {
    createClient();
    connect();

    const discovery = discoveryMessages();

    expect(discovery).toHaveLength(5);

    for (const call of discovery) {
      const payload = JSON.parse(String(call[1]));

      expect(payload.entity_category).toBe('diagnostic');
      expect(payload.enabled_by_default).toBe(false);
      expect(payload.state_topic).toBe(stateTopic);

      expect(call[2]).toEqual({
        qos: 1,
        retain: true,
      });
    }

    const state = stateMessages();

    expect(state).toHaveLength(1);

    expect(JSON.parse(String(state[0][1]))).toEqual({
      totalTimeouts: 0,
      consecutiveTimeouts: 0,
      receivedMessages: 0,
      lastMessageAt: null,
      lastTimeoutAt: null,
    });

    expect(state[0][2]).toEqual({
      qos: 1,
      retain: true,
    });
  });

  test('publishes updated statistics after a device message', () => {
    const client = createClient();

    client.recordDeviceMessage(device);

    const state = stateMessages();

    expect(state).toHaveLength(1);

    expect(JSON.parse(String(state[0][1]))).toMatchObject({
      receivedMessages: 1,
      consecutiveTimeouts: 0,
    });
  });

  test('publishes statistics when the response timeout expires', () => {
    const client = createClient();

    client.requestDeviceData(device);
    jest.advanceTimersByTime(5000);

    const state = stateMessages();

    expect(state).toHaveLength(1);

    expect(JSON.parse(String(state[0][1]))).toMatchObject({
      totalTimeouts: 1,
      consecutiveTimeouts: 1,
      receivedMessages: 0,
    });
  });

  test('republishes current statistics after reconnect', () => {
    const client = createClient();

    connect();
    client.recordDeviceMessage(device);

    setConnected(false);
    client.recordDeviceMessage(device);

    mockPublish.mockClear();

    connect();

    expect(discoveryMessages()).toHaveLength(5);
    expect(stateMessages()).toHaveLength(1);

    expect(JSON.parse(String(stateMessages()[0][1]))).toMatchObject({
      receivedMessages: 2,
    });
  });

  test('republishes diagnostics after reconnect following a cd=1 response', () => {
    const client = createClient();

    connect();
    client.recordDeviceMessage(device);
    client.onDeviceDataReceived(device, 'data');

    setConnected(false);
    client.recordDeviceMessage(device);

    const expectedStats = client.getCommunicationStats(device);

    mockPublish.mockClear();

    connect();

    expect(discoveryMessages()).toHaveLength(5);

    for (const call of discoveryMessages()) {
      expect(JSON.parse(String(call[1]))).toMatchObject({
        entity_category: 'diagnostic',
        enabled_by_default: false,
        state_topic: stateTopic,
      });

      expect(call[2]).toEqual({
        qos: 1,
        retain: true,
      });
    }

    expect(stateMessages()).toHaveLength(1);
    expect(JSON.parse(String(stateMessages()[0][1]))).toEqual(expectedStats);
    expect(expectedStats.receivedMessages).toBe(2);
  });

  test('does not collect statistics when disabled', () => {
    const client = createClient(false);

    client.recordDeviceMessage(device);
    client.requestDeviceData(device);

    jest.advanceTimersByTime(5000);

    expect(stateMessages()).toHaveLength(0);

    expect(client.getCommunicationStats(device)).toEqual({
      totalTimeouts: 0,
      consecutiveTimeouts: 0,
      receivedMessages: 0,
      lastMessageAt: null,
      lastTimeoutAt: null,
    });
  });

  test('clears retained diagnostic configs and state when disabled', () => {
    createClient(false);
    connect();

    expect(discoveryMessages()).toHaveLength(5);

    for (const call of discoveryMessages()) {
      expect(call[1]).toBe('');
      expect(call[2]).toEqual({
        qos: 1,
        retain: true,
      });
    }

    expect(stateMessages()).toHaveLength(1);
    expect(stateMessages()[0][1]).toBe('');
    expect(stateMessages()[0][2]).toEqual({
      qos: 1,
      retain: true,
    });
  });

  test('collects statistics without publishing while disconnected', () => {
    const client = createClient();

    setConnected(false);

    client.recordDeviceMessage(device);

    expect(stateMessages()).toHaveLength(0);

    expect(client.getCommunicationStats(device).receivedMessages).toBe(1);
  });
});
