import { jest } from '@jest/globals';
import './device/registry.js';
import { DeviceManager } from './deviceManager.js';
import { MqttConfig } from './types.js';
import { DEFAULT_TOPIC_PREFIX } from './constants.js';
import { calculateNewVersionTopicId } from './utils/crypt.js';
import logger from './logger.js';

describe('DeviceManager', () => {
  const mockConfig: MqttConfig = {
    brokerUrl: 'mqtt://localhost',
    clientId: 'test-client',
    topicPrefix: DEFAULT_TOPIC_PREFIX,
    autodiscoveryTopicPrefix: 'homeassistant',
    devices: [
      {
        deviceType: 'HMA-1',
        deviceId: 'test123',
      },
    ],
  };

  const mockOnUpdateState = jest.fn();

  let deviceManager: DeviceManager;

  beforeEach(() => {
    deviceManager = new DeviceManager(mockConfig, mockOnUpdateState);
  });

  it('should initialize with correct topics', () => {
    const device = mockConfig.devices[0];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopicOld).toBe('hame_energy/HMA-1/device/test123/ctrl');
    expect(topics?.deviceTopicNew).toBe(
      `marstek_energy/HMA-1/device/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.publishTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/device/test123`);
    expect(topics?.deviceControlTopicOld).toBe('hame_energy/HMA-1/App/test123/ctrl');
    expect(topics?.deviceControlTopicNew).toBe(
      `marstek_energy/HMA-1/App/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.controlSubscriptionTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/control/test123`);
    expect(topics?.availabilityTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/availability/test123`);
  });

  it('should use custom topic prefix', () => {
    const customConfig: MqttConfig = {
      ...mockConfig,
      topicPrefix: 'customPrefix',
    };
    const dm = new DeviceManager(customConfig, mockOnUpdateState);
    const device = customConfig.devices[0];
    const topics = dm.getDeviceTopics(device);
    expect(topics?.publishTopic).toBe('customPrefix/HMA-1/device/test123');
    expect(topics?.controlSubscriptionTopic).toBe('customPrefix/HMA-1/control/test123');
    expect(topics?.availabilityTopic).toBe('customPrefix/HMA-1/availability/test123');
  });

  it('should handle invalid device types gracefully', () => {
    const invalidConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'INVALID-TYPE',
          deviceId: 'test123',
        },
      ],
    };

    // DeviceManager constructor should throw an error for invalid devices
    expect(() => new DeviceManager(invalidConfig, mockOnUpdateState)).toThrow(
      'No valid devices configured. All configured devices have unknown device types.',
    );
  });

  it('should handle mix of valid and invalid device types', () => {
    const mixedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'INVALID-TYPE',
          deviceId: 'invalid123',
        },
        {
          deviceType: 'HMA-1',
          deviceId: 'valid123',
        },
      ],
    };

    const dm = new DeviceManager(mixedConfig, mockOnUpdateState);

    // Invalid device should not have topics
    const invalidTopics = dm.getDeviceTopics(mixedConfig.devices[0]);
    expect(invalidTopics).toBeUndefined();

    // Valid device should have topics
    const validTopics = dm.getDeviceTopics(mixedConfig.devices[1]);
    expect(validTopics).toBeDefined();

    // getPollingInterval should work since there's at least one valid device
    expect(() => dm.getPollingInterval()).not.toThrow();
  });

  it('should log "Did you mean" for typo in device type', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const typoConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        { deviceType: 'HWJ-2', deviceId: 'typo123' },
        { deviceType: 'HMA-1', deviceId: 'valid123' },
      ],
    };

    new DeviceManager(typoConfig, mockOnUpdateState);
    expect(warnSpy).toHaveBeenCalledWith(
      'Skipping unknown device type: HWJ-2. Did you mean "HMJ"?',
    );
    warnSpy.mockRestore();
  });

  it('should not suggest for completely unrelated device type', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const unrelatedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        { deviceType: 'ZZZZZ-1', deviceId: 'bad123' },
        { deviceType: 'HMA-1', deviceId: 'valid123' },
      ],
    };

    new DeviceManager(unrelatedConfig, mockOnUpdateState);
    expect(warnSpy).toHaveBeenCalledWith('Skipping unknown device type: ZZZZZ-1');
    warnSpy.mockRestore();
  });

  it('should match device type case-insensitively', () => {
    const caseConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [{ deviceType: 'hma-1', deviceId: 'case123' }],
    };

    const dm = new DeviceManager(caseConfig, mockOnUpdateState);
    const topics = dm.getDeviceTopics(caseConfig.devices[0]);
    expect(topics).toBeDefined();
  });

  it('should not encrypt new topics for non-HMA/HMF/HMK/HMJ devices', () => {
    const nonEncryptedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'HMB-1',
          deviceId: 'test123',
        },
      ],
    };

    const dm = new DeviceManager(nonEncryptedConfig, mockOnUpdateState);
    const device = nonEncryptedConfig.devices[0];
    const topics = dm.getDeviceTopics(device);
    expect(topics?.deviceTopicNew).toBe('marstek_energy/HMB-1/device/test123/ctrl');
    expect(topics?.deviceControlTopicNew).toBe('marstek_energy/HMB-1/App/test123/ctrl');
  });

  describe('monotonic counter guard', () => {
    const venusConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [{ deviceType: 'VNSE3-0', deviceId: 'venus123' }],
    };

    let dm: DeviceManager;
    const device = venusConfig.devices[0];

    beforeEach(() => {
      dm = new DeviceManager(venusConfig, jest.fn());
    });

    const setCharging = (totalChargingCapacity: number) =>
      dm.updateDeviceState(device, 'data', () => ({ totalChargingCapacity }));
    const setDaily = (dailyChargingCapacity: number) =>
      dm.updateDeviceState(device, 'data', () => ({ dailyChargingCapacity }));
    const charging = () => (dm.getDeviceState(device) as any).totalChargingCapacity;
    const daily = () => (dm.getDeviceState(device) as any).dailyChargingCapacity;

    it('accepts the first reading', () => {
      setCharging(339.93);
      expect(charging()).toBe(339.93);
    });

    it('accepts normal non-decreasing readings', () => {
      setCharging(339.93);
      setCharging(340.5);
      expect(charging()).toBe(340.5);
    });

    it('suppresses a single corrupt backward jump and recovers', () => {
      setCharging(339.93);
      setCharging(33.99); // dropped-digit corruption
      expect(charging()).toBe(339.93); // rejected, last good value kept
      setCharging(339.93); // next poll recovers
      expect(charging()).toBe(339.93);
    });

    it('accepts a genuine reset once a following reading confirms it', () => {
      setDaily(5.0);
      setDaily(0.1); // first drop -> rejected pending confirmation
      expect(daily()).toBe(5.0);
      setDaily(0.2); // second consecutive low reading -> confirmed reset
      expect(daily()).toBe(0.2);
    });

    it('clears the pending drop when the value recovers before confirmation', () => {
      setDaily(5.0);
      setDaily(0.5); // glitch -> rejected
      expect(daily()).toBe(5.0);
      setDaily(5.1); // recovery resets the confirmation counter
      expect(daily()).toBe(5.1);
      setDaily(0.5); // a later isolated glitch must again be rejected (count reset)
      expect(daily()).toBe(5.1);
    });

    it('guards nested cumulative paths without dropping sibling fields', () => {
      const b2500 = new DeviceManager(mockConfig, jest.fn());
      const hma = mockConfig.devices[0];
      b2500.updateDeviceState(hma, 'data', () => ({
        dailyStats: { batteryChargingPower: 100, batteryDischargePower: 50 },
      }));
      b2500.updateDeviceState(hma, 'data', () => ({
        dailyStats: { batteryChargingPower: 10, batteryDischargePower: 60 },
      }));
      const stats = (b2500.getDeviceState(hma) as any).dailyStats;
      expect(stats.batteryChargingPower).toBe(100); // corrupt drop rejected
      expect(stats.batteryDischargePower).toBe(60); // sibling increase preserved
    });
  });
});
