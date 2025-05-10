import { DeviceManager } from './deviceManager';
import { MqttConfig } from './types';
import { calculateNewVersionTopicId } from './utils/crypt';

describe('DeviceManager', () => {
  const mockConfig: MqttConfig = {
    brokerUrl: 'mqtt://localhost',
    clientId: 'test-client',
    devices: [
      {
        deviceType: 'HMA-1',
        deviceId: 'test123',
      },
      {
        deviceType: 'HMA-1',
        deviceId: 'test456',
        topicPrefix: 'custom_prefix',
      },
      {
        deviceType: 'HMA-1',
        deviceId: 'test7890abcd', // 12-character MAC address
        topicPrefix: 'marstek_energy', // Indicates we need to use the new encrypted device ID
      },
    ],
  };

  const mockOnUpdateState = jest.fn();

  let deviceManager: DeviceManager;

  beforeEach(() => {
    deviceManager = new DeviceManager(mockConfig, mockOnUpdateState);
  });

  it('should initialize with default topic prefix', () => {
    const device = mockConfig.devices[0];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopic).toBe('hame_energy/HMA-1/device/test123/ctrl');
    expect(topics?.publishTopic).toBe('hm2mqtt/HMA-1/device/test123');
    expect(topics?.deviceControlTopic).toBe('hame_energy/HMA-1/App/test123/ctrl');
    expect(topics?.controlSubscriptionTopic).toBe('hm2mqtt/HMA-1/control/test123');
    expect(topics?.availabilityTopic).toBe('hm2mqtt/HMA-1/availability/test123');
  });

  it('should use custom topic prefix when specified', () => {
    const device = mockConfig.devices[1];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopic).toBe('custom_prefix/HMA-1/device/test456/ctrl');
    expect(topics?.publishTopic).toBe('hm2mqtt/HMA-1/device/test456');
    expect(topics?.deviceControlTopic).toBe('custom_prefix/HMA-1/App/test456/ctrl');
    expect(topics?.controlSubscriptionTopic).toBe('hm2mqtt/HMA-1/control/test456');
    expect(topics?.availabilityTopic).toBe('hm2mqtt/HMA-1/availability/test456');
  });

  it('should use encrypted device ID when topic prefix is marstek_energy', () => {
    const device = mockConfig.devices[2];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopic).toBe(
      `marstek_energy/HMA-1/device/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.publishTopic).toBe(`hm2mqtt/HMA-1/device/test7890abcd`);
    expect(topics?.deviceControlTopic).toBe(
      `marstek_energy/HMA-1/App/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.controlSubscriptionTopic).toBe(`hm2mqtt/HMA-1/control/test7890abcd`);
    expect(topics?.availabilityTopic).toBe(`hm2mqtt/HMA-1/availability/test7890abcd`);
  });
});
