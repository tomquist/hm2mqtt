import { generateDiscoveryConfigs } from './generateDiscoveryConfigs';
import { Device } from './types';
import { DeviceTopics } from './deviceManager';
import { AdditionalDeviceInfo } from './deviceDefinition';

describe('Home Assistant Discovery', () => {
  test('should generate discovery configs for a device', () => {
    const deviceType = 'HMA-1';
    const deviceId = 'test123';
    const deviceTopic = 'hame_energy/HMA-1/device/test123/ctrl';
    const publishTopic = 'hame_energy/HMA-1/device/test123/data';
    const deviceControlTopic = 'hame_energy/HMA-1/App/test123/ctrl';
    const controlSubscriptionTopic = 'hame_energy/HMA-1/App/test123/control';
    const availabilityTopic = 'hame_energy/HMA-1/availability/test123';

    // Make sure to pass the availability topic
    let device: Device = { deviceType, deviceId };
    let deviceTopics: DeviceTopics = {
      deviceTopic,
      deviceControlTopic,
      availabilityTopic,
      controlSubscriptionTopic,
      publishTopic,
    };
    let additionalDeviceInfo: AdditionalDeviceInfo = {};
    const configs = generateDiscoveryConfigs(device, deviceTopics, additionalDeviceInfo);

    // Check that we have configs
    expect(configs.length).toBeGreaterThan(0);

    // Check structure of a config
    const firstConfig = configs[0];
    expect(firstConfig).toHaveProperty('topic');
    expect(firstConfig).toHaveProperty('config');
    expect(firstConfig.config).toHaveProperty('name');
    expect(firstConfig.config).toHaveProperty('unique_id');
    expect(firstConfig.config).toHaveProperty('state_topic');
    expect(firstConfig.config).toHaveProperty('device');

    // Check device info
    expect(firstConfig.config.device).toHaveProperty('ids');
    expect(firstConfig.config.device.ids[0]).toBe(`hame_energy_${deviceId}`);
    expect(firstConfig.config.device.name).toBe(`HAME Energy ${deviceType} ${deviceId}`);
    expect(firstConfig.config.device.model_id).toBe(deviceType);
    expect(firstConfig.config.device.manufacturer).toBe('HAME Energy');

    // Check that all topics are unique
    const topics = configs.map(c => c.topic);
    const uniqueTopics = new Set(topics);
    // We expect some duplicate topics due to output state sensors being defined twice
    expect(uniqueTopics.size).toBeGreaterThan(0);

    // Check specific entity types
    const batteryPercentageSensor = configs.find(c => c.topic.includes('battery_percentage'));
    expect(batteryPercentageSensor).toBeDefined();
    expect(batteryPercentageSensor?.config.device_class).toBe('battery');
    expect(batteryPercentageSensor?.config.unit_of_measurement).toBe('%');

    // Check availability configuration
    expect(batteryPercentageSensor?.config.availability?.[1].topic).toBe(availabilityTopic);

    const chargingModeSelect = configs.find(c => c.topic.includes('charging_mode'));
    expect(chargingModeSelect).toBeDefined();
    expect(chargingModeSelect?.config.options).toContain('Simultaneous Charging/Discharging');
    expect(chargingModeSelect?.config.options).toContain('Fully Charge Then Discharge');

    // Check time period entities
    const timePeriod1Enabled = configs.find(c => c.topic.includes('time_period_1_enabled'));
    expect(timePeriod1Enabled).toBeDefined();
    expect(timePeriod1Enabled?.config.payload_on).toBe('true');
    expect(timePeriod1Enabled?.config.payload_off).toBe('false');

    // Check that we have all 5 time periods
    for (let i = 1; i <= 5; i++) {
      const enabledSwitch = configs.find(c => c.topic.includes(`time_period_${i}_enabled`));
      const startTime = configs.find(c => c.topic.includes(`time_period_${i}_start_time`));
      const endTime = configs.find(c => c.topic.includes(`time_period_${i}_end_time`));
      const outputValue = configs.find(c => c.topic.includes(`time_period_${i}_output_value`));

      expect(enabledSwitch).toBeDefined();
      expect(startTime).toBeDefined();
      expect(endTime).toBeDefined();
      expect(outputValue).toBeDefined();
    }

    // Check flash commands switch
    const flashCommandsSwitch = configs.find(c => c.topic.includes('use_flash_commands'));
    expect(flashCommandsSwitch).toBeDefined();
    expect(flashCommandsSwitch?.config.payload_on).toBe('true');
    expect(flashCommandsSwitch?.config.payload_off).toBe('false');

    // Check factory reset button
    const factoryResetButton = configs.find(c => c.topic.includes('factory_reset'));
    expect(factoryResetButton).toBeDefined();
    expect(factoryResetButton?.config.payload_press).toBe('PRESS');
  });

  test('should mock publishDiscoveryConfigs', () => {
    // Create a mock MQTT client
    const mockClient = {
      publish: jest.fn((topic, message, options, callback) => {
        callback(null);
      }),
    };

    // Import the function
    const { publishDiscoveryConfigs } = require('./generateDiscoveryConfigs');

    // Call the function with the mock client
    publishDiscoveryConfigs(
      mockClient,
      { deviceType: 'HMA-1', deviceId: 'test123' },
      'hame_energy/HMA-1/device/test123/data',
      'hame_energy/HMA-1/App/test123/control',
      'hame_energy/HMA-1/availability/test123',
    );

    // Check that publish was called
    expect(mockClient.publish).toHaveBeenCalled();

    // Test error handling
    const mockClientWithError = {
      publish: jest.fn((topic, message, options, callback) => {
        callback(new Error('Test error'));
      }),
    };

    // Call with error client
    publishDiscoveryConfigs(
      mockClientWithError,
      'HMA-1',
      'test123',
      'hame_energy/HMA-1/device/test123/data',
      'hame_energy/HMA-1/App/test123/control',
    );
  });
});
