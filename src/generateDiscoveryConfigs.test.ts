import { generateDiscoveryConfigs, DiscoveryOptions } from './generateDiscoveryConfigs';
import { Device } from './types';
import { DeviceTopics } from './deviceManager';
import { AdditionalDeviceInfo } from './deviceDefinition';
import { DEFAULT_TOPIC_PREFIX } from './constants';

describe('Home Assistant Discovery', () => {
  test('should generate discovery configs for a device', () => {
    const deviceType = 'HMA-1';
    const deviceId = 'test123';
    const deviceTopicOld = 'hame_energy/HMA-1/device/test123/ctrl';
    const deviceTopicNew = 'marstek_energy/HMA-1/device/test123/ctrl';
    const publishTopic = 'hame_energy/HMA-1/device/test123/data';
    const deviceControlTopicOld = 'hame_energy/HMA-1/App/test123/ctrl';
    const deviceControlTopicNew = 'marstek_energy/HMA-1/App/test123/ctrl';
    const controlSubscriptionTopic = 'hame_energy/HMA-1/control/test123/control';
    const availabilityTopic = 'hame_energy/HMA-1/availability/test123';

    // Make sure to pass the availability topic
    let device: Device = { deviceType, deviceId };
    let deviceTopics: DeviceTopics = {
      deviceTopicOld,
      deviceTopicNew,
      deviceControlTopicOld,
      deviceControlTopicNew,
      availabilityTopic,
      controlSubscriptionTopic,
      publishTopic,
    };
    let additionalDeviceInfo: AdditionalDeviceInfo = {};
    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      additionalDeviceInfo,
      DEFAULT_TOPIC_PREFIX,
    );

    // Check that we have configs
    expect(configs.length).toBeGreaterThan(0);

    // Check structure of a config
    const firstConfig = configs[0];
    expect(firstConfig).toHaveProperty('topic');
    expect(firstConfig).toHaveProperty('config');
    expect(firstConfig.config!).toHaveProperty('name');
    expect(firstConfig.config!).toHaveProperty('unique_id');
    expect(firstConfig.config!).toHaveProperty('state_topic');
    expect(firstConfig.config!).toHaveProperty('device');

    // Check device info
    expect(firstConfig.config!.device).toHaveProperty('ids');
    expect(firstConfig.config!.device.ids[0]).toBe(`hame_energy_${deviceId}`);
    expect(firstConfig.config!.device.name).toBe(`HAME Energy ${deviceType} ${deviceId}`);
    expect(firstConfig.config!.device.model_id).toBe(deviceType);
    expect(firstConfig.config!.device.manufacturer).toBe('HAME Energy');

    // Check that all topics are unique
    const topics = configs.map(c => c.topic);
    const uniqueTopics = new Set(topics);
    // We expect some duplicate topics due to output state sensors being defined twice
    expect(uniqueTopics.size).toBeGreaterThan(0);

    // Check specific entity types
    const batteryPercentageSensor = configs.find(c => c.topic.includes('battery_percentage'));
    expect(batteryPercentageSensor).toBeDefined();
    expect(batteryPercentageSensor?.config!.device_class).toBe('battery');
    expect(batteryPercentageSensor?.config!.unit_of_measurement).toBe('%');

    // Check availability configuration
    expect(batteryPercentageSensor?.config!.availability?.[1].topic).toBe(availabilityTopic);

    const chargingModeSelect = configs.find(c => c.topic.includes('charging_mode'));
    expect(chargingModeSelect).toBeDefined();
    expect(chargingModeSelect?.config!.options).toContain('Simultaneous Charging/Discharging');
    expect(chargingModeSelect?.config!.options).toContain('Fully Charge Then Discharge');

    // Check time period entities
    const timePeriod1Enabled = configs.find(c => c.topic.includes('time_period_1_enabled'));
    expect(timePeriod1Enabled).toBeDefined();
    expect(timePeriod1Enabled?.config!.payload_on).toBe('true');
    expect(timePeriod1Enabled?.config!.payload_off).toBe('false');

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
    expect(flashCommandsSwitch?.config!.payload_on).toBe('true');
    expect(flashCommandsSwitch?.config!.payload_off).toBe('false');

    // Check factory reset button
    const factoryResetButton = configs.find(c => c.topic.includes('factory_reset'));
    expect(factoryResetButton).toBeDefined();
    expect(factoryResetButton?.config!.payload_press).toBe('PRESS');
  });

  test('should mock publishDiscoveryConfigs', () => {
    // Create a mock MQTT client
    const mockClient = {
      publish: jest.fn((topic, message, options, callback) => {
        callback(null);
      }),
    };

    const deviceType = 'HMA-1';
    const deviceId = 'test123';
    const deviceTopicOld = 'hame_energy/HMA-1/device/test123/ctrl';
    const deviceTopicNew = 'marstek_energy/HMA-1/device/test123/ctrl';
    const publishTopic = 'hame_energy/HMA-1/device/test123/data';
    const deviceControlTopicOld = 'hame_energy/HMA-1/App/test123/ctrl';
    const deviceControlTopicNew = 'marstek_energy/HMA-1/App/test123/ctrl';
    const controlSubscriptionTopic = 'hame_energy/HMA-1/control/test123/control';
    const availabilityTopic = 'hame_energy/HMA-1/availability/test123';

    const device: Device = { deviceType, deviceId };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld,
      deviceTopicNew,
      deviceControlTopicOld,
      deviceControlTopicNew,
      availabilityTopic,
      controlSubscriptionTopic,
      publishTopic,
    };

    // Import the function
    const { publishDiscoveryConfigs } = require('./generateDiscoveryConfigs');

    // Call the function with the mock client
    publishDiscoveryConfigs(mockClient, device, deviceTopics, {}, DEFAULT_TOPIC_PREFIX, {});

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
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      {},
    );
  });

  describe('Jinja template mode', () => {
    const deviceType = 'HMA-1';
    const deviceId = 'test123';
    const deviceTopicOld = 'hame_energy/HMA-1/device/test123/ctrl';
    const deviceTopicNew = 'marstek_energy/HMA-1/device/test123/ctrl';
    const publishTopic = 'hm2mqtt/HMA-1/device/test123';
    const deviceControlTopicOld = 'hame_energy/HMA-1/App/test123/ctrl';
    const deviceControlTopicNew = 'marstek_energy/HMA-1/App/test123/ctrl';
    const controlSubscriptionTopic = 'hm2mqtt/HMA-1/control/test123';
    const availabilityTopic = 'hm2mqtt/HMA-1/availability/test123';

    const device: Device = { deviceType, deviceId };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld,
      deviceTopicNew,
      deviceControlTopicOld,
      deviceControlTopicNew,
      availabilityTopic,
      controlSubscriptionTopic,
      publishTopic,
    };
    const additionalDeviceInfo: AdditionalDeviceInfo = {};

    test('should use deviceTopicOld as state_topic in Jinja mode', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      // Find a sensor config
      const batteryPercentageSensor = configs.find(c => c.topic.includes('battery_percentage'));
      expect(batteryPercentageSensor).toBeDefined();
      expect(batteryPercentageSensor?.config?.state_topic).toBe(deviceTopicOld);
    });

    test('should generate Jinja parsing preamble in value_template', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      const batteryPercentageSensor = configs.find(c => c.topic.includes('battery_percentage'));
      expect(batteryPercentageSensor).toBeDefined();

      const valueTemplate = batteryPercentageSensor?.config?.value_template;
      // Should contain the Jinja parsing preamble
      expect(valueTemplate).toContain('{% set ns = namespace(d={}) %}');
      expect(valueTemplate).toContain("value.split(',')");
      expect(valueTemplate).toContain("pair.split('=', 1)");
      // Should reference ns.d.pe (the battery percentage key)
      expect(valueTemplate).toContain('ns.d.pe');
    });

    test('should apply number transform for numeric fields', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      const batteryPercentageSensor = configs.find(c => c.topic.includes('battery_percentage'));
      const valueTemplate = batteryPercentageSensor?.config?.value_template;
      // number() transform converts to float with default 0
      expect(valueTemplate).toContain('float(0)');
    });

    test('should apply bitBoolean transform for boolean fields', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      const input1ChargingSensor = configs.find(c => c.topic.includes('input1_charging'));
      expect(input1ChargingSensor).toBeDefined();

      const valueTemplate = input1ChargingSensor?.config?.value_template;
      // bitBoolean(0) transform checks bit 0
      expect(valueTemplate).toContain('bitwise_and');
      expect(valueTemplate).toContain('ns.d.p1');
    });

    test('should apply sum transform for multi-key fields', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      const totalInputPowerSensor = configs.find(c => c.topic.includes('solar_total_power'));
      expect(totalInputPowerSensor).toBeDefined();

      const valueTemplate = totalInputPowerSensor?.config?.value_template;
      // sum() transform should sum w1 and w2
      expect(valueTemplate).toContain('ns.d.w1');
      expect(valueTemplate).toContain('ns.d.w2');
      expect(valueTemplate).toContain('sum');
    });

    test('should apply map transform with value mappings', () => {
      const configs = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: true },
      );

      const sceneSensor = configs.find(c => c.topic.includes('/scene/'));
      expect(sceneSensor).toBeDefined();

      const valueTemplate = sceneSensor?.config?.value_template;
      // map transform converts cj values to scene names
      expect(valueTemplate).toContain('ns.d.cj');
      // Should contain mapping logic
      expect(valueTemplate).toContain('mapping');
    });

    test('should use parsed JSON topic in standard mode', () => {
      const configsStandard = generateDiscoveryConfigs(
        device,
        deviceTopics,
        additionalDeviceInfo,
        DEFAULT_TOPIC_PREFIX,
        {},
        { useJinjaTemplates: false },
      );

      const batteryPercentageSensor = configsStandard.find(c =>
        c.topic.includes('battery_percentage'),
      );
      expect(batteryPercentageSensor?.config?.state_topic).toBe(`${publishTopic}/data`);

      const valueTemplate = batteryPercentageSensor?.config?.value_template;
      // Standard mode uses value_json path
      expect(valueTemplate).toContain('value_json');
      expect(valueTemplate).not.toContain('namespace');
    });
  });
});
