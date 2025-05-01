import { DeviceManager } from './deviceManager';
import { MqttConfig } from './types';

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
    expect(topics?.publishTopic).toBe('hame_energy/HMA-1/device/test123');
    expect(topics?.deviceControlTopic).toBe('hame_energy/HMA-1/App/test123/ctrl');
    expect(topics?.controlSubscriptionTopic).toBe('hame_energy/HMA-1/control/test123');
    expect(topics?.availabilityTopic).toBe('hame_energy/HMA-1/availability/test123');
  });

  it('should use custom topic prefix when specified', () => {
    const device = mockConfig.devices[1];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopic).toBe('custom_prefix/HMA-1/device/test456/ctrl');
    expect(topics?.publishTopic).toBe('custom_prefix/HMA-1/device/test456');
    expect(topics?.deviceControlTopic).toBe('custom_prefix/HMA-1/App/test456/ctrl');
    expect(topics?.controlSubscriptionTopic).toBe('custom_prefix/HMA-1/control/test456');
    expect(topics?.availabilityTopic).toBe('custom_prefix/HMA-1/availability/test456');
  });
});
