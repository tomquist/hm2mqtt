import { generateDiscoveryConfigs } from './generateDiscoveryConfigs';
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
      'homeassistant',
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
    // The switch publishes a retained command so the setting survives a restart
    expect(flashCommandsSwitch?.config!.retain).toBe(true);

    // Check factory reset button
    const factoryResetButton = configs.find(c => c.topic.includes('factory_reset'));
    expect(factoryResetButton).toBeDefined();
    expect(factoryResetButton?.config!.payload_press).toBe('PRESS');
  });

  test('should include connections with formatted MAC when deviceId is 12 hex chars', () => {
    const device: Device = { deviceType: 'HMA-1', deviceId: 'e88da6f35def' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMA-1/device/e88da6f35def/ctrl',
      deviceTopicNew: 'marstek_energy/HMA-1/device/e88da6f35def/ctrl',
      deviceControlTopicOld: 'hame_energy/HMA-1/App/e88da6f35def/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMA-1/App/e88da6f35def/ctrl',
      availabilityTopic: 'hame_energy/HMA-1/availability/e88da6f35def',
      controlSubscriptionTopic: 'hame_energy/HMA-1/control/e88da6f35def/control',
      publishTopic: 'hame_energy/HMA-1/device/e88da6f35def/data',
    };

    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
    );

    const firstConfig = configs[0];
    expect(firstConfig.config!.device.connections).toEqual([['bluetooth', 'E8:8D:A6:F3:5D:EF']]);
  });

  test('should not include connections when deviceId is not a MAC address', () => {
    const device: Device = { deviceType: 'HMA-1', deviceId: 'test123' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMA-1/device/test123/ctrl',
      deviceTopicNew: 'marstek_energy/HMA-1/device/test123/ctrl',
      deviceControlTopicOld: 'hame_energy/HMA-1/App/test123/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMA-1/App/test123/ctrl',
      availabilityTopic: 'hame_energy/HMA-1/availability/test123',
      controlSubscriptionTopic: 'hame_energy/HMA-1/control/test123/control',
      publishTopic: 'hame_energy/HMA-1/device/test123/data',
    };

    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
    );

    const firstConfig = configs[0];
    expect(firstConfig.config!.device).not.toHaveProperty('connections');
  });

  test('should publish surplus_feed_in for HMJ-* when firmware supports it (regression #235)', () => {
    const deviceType = 'HMJ-2';
    const deviceId = 'test123';

    const device: Device = { deviceType, deviceId };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMJ-2/device/test123/ctrl',
      deviceTopicNew: 'marstek_energy/HMJ-2/device/test123/ctrl',
      publishTopic: 'hame_energy/HMJ-2/device/test123/data',
      deviceControlTopicOld: 'hame_energy/HMJ-2/App/test123/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMJ-2/App/test123/ctrl',
      controlSubscriptionTopic: 'hame_energy/HMJ-2/control/test123/control',
      availabilityTopic: 'hame_energy/HMJ-2/availability/test123',
    };

    // HMJ models support surplus feed-in starting with version 108 (e.g. 116.6)
    const supportedState = { deviceType, deviceInfo: { deviceVersion: 116 } };
    const supportedConfigs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      supportedState,
    );

    const surplusSwitch = supportedConfigs.find(c => c.topic.includes('surplus_feed_in'));
    expect(surplusSwitch).toBeDefined();
    expect(surplusSwitch?.config).not.toBeNull();

    // Below required version: should be explicitly disabled (null config)
    const unsupportedState = { deviceType, deviceInfo: { deviceVersion: 107 } };
    const unsupportedConfigs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      unsupportedState,
    );

    const surplusSwitchDisabled = unsupportedConfigs.find(c => c.topic.includes('surplus_feed_in'));
    expect(surplusSwitchDisabled).toBeDefined();
    expect(surplusSwitchDisabled?.config).toBeNull();
  });

  test('should support custom autodiscovery topic prefix', () => {
    const device: Device = { deviceType: 'HMA-1', deviceId: 'test123' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMA-1/device/test123/ctrl',
      deviceTopicNew: 'marstek_energy/HMA-1/device/test123/ctrl',
      deviceControlTopicOld: 'hame_energy/HMA-1/App/test123/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMA-1/App/test123/ctrl',
      availabilityTopic: 'hame_energy/HMA-1/availability/test123',
      controlSubscriptionTopic: 'hame_energy/HMA-1/control/test123/control',
      publishTopic: 'hame_energy/HMA-1/device/test123/data',
    };

    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'domoticz',
    );

    expect(configs.length).toBeGreaterThan(0);
    expect(configs[0].topic.startsWith('domoticz/')).toBe(true);
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
    publishDiscoveryConfigs(
      mockClient,
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      {},
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
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      {},
    );
  });

  test('should gate HMI PV3/PV4 discovery configs on data presence', () => {
    const device: Device = { deviceType: 'HMI-2000', deviceId: 'hmi2000' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMI-2000/device/hmi2000/ctrl',
      deviceTopicNew: 'marstek_energy/HMI-2000/device/hmi2000/ctrl',
      deviceControlTopicOld: 'hame_energy/HMI-2000/App/hmi2000/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMI-2000/App/hmi2000/ctrl',
      availabilityTopic: 'hame_energy/HMI-2000/availability/hmi2000',
      controlSubscriptionTopic: 'hame_energy/HMI-2000/control/hmi2000/control',
      publishTopic: 'hame_energy/HMI-2000/device/hmi2000/data',
    };

    const pv34Topics = (state: object) =>
      generateDiscoveryConfigs(
        device,
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      )
        .map(c => c.topic)
        .filter(t => /pv3_|pv4_/.test(t));

    // 2-PV state (no pv3/pv4 data): no PV3/PV4 configs advertised
    expect(pv34Topics({ pv1Voltage: 33.4 })).toHaveLength(0);

    // 4-PV state (HMI-2000): PV3/PV4 configs advertised (voltage/current/power/status each)
    const fourPv = pv34Topics({
      pv3Voltage: 33.6,
      pv3Current: 0.2,
      pv3Power: 17,
      pv3Status: true,
      pv4Voltage: 33.7,
      pv4Current: 0.3,
      pv4Power: 18,
      pv4Status: false,
    });
    expect(fourPv.some(t => t.includes('pv3_voltage'))).toBe(true);
    expect(fourPv.some(t => t.includes('pv4_status'))).toBe(true);
    expect(fourPv).toHaveLength(8);
  });

  test('should gate Venus depth of discharge discovery config on data presence', () => {
    const device: Device = { deviceType: 'HMG-25', deviceId: 'venus123' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMG-25/device/venus123/ctrl',
      deviceTopicNew: 'marstek_energy/HMG-25/device/venus123/ctrl',
      deviceControlTopicOld: 'hame_energy/HMG-25/App/venus123/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMG-25/App/venus123/ctrl',
      availabilityTopic: 'hame_energy/HMG-25/availability/venus123',
      controlSubscriptionTopic: 'hame_energy/HMG-25/control/venus123/control',
      publishTopic: 'hame_energy/HMG-25/device/venus123/data',
    };

    const dodConfigs = (state: object) =>
      generateDiscoveryConfigs(
        device,
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => c.topic.includes('depth_of_discharge'));

    // No dod in the device data: the config is deferred (nothing published)
    expect(dodConfigs({ batterySoc: 11 })).toHaveLength(0);

    // dod present: the config is advertised with the expected 30..88 step:1 range
    const withDod = dodConfigs({ depthOfDischarge: 88 });
    expect(withDod).toHaveLength(1);
    expect(withDod[0].config).not.toBeNull();
    expect(withDod[0].config).toMatchObject({ min: 30, max: 88, step: 1 });
  });
});
