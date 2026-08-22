import { jest } from '@jest/globals';
import './device/registry.js';
import { generateDiscoveryConfigs, publishDiscoveryConfigs } from './generateDiscoveryConfigs.js';
import { Device } from './types.js';
import { DeviceTopics } from './deviceManager.js';
import { AdditionalDeviceInfo } from './deviceDefinition.js';
import { DEFAULT_TOPIC_PREFIX } from './constants.js';

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

  test('should gate Venus D PV input discovery configs on data presence', () => {
    const device: Device = { deviceType: 'VNSD-0', deviceId: 'venusD123' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/VNSD-0/device/venusD123/ctrl',
      deviceTopicNew: 'marstek_energy/VNSD-0/device/venusD123/ctrl',
      deviceControlTopicOld: 'hame_energy/VNSD-0/App/venusD123/ctrl',
      deviceControlTopicNew: 'marstek_energy/VNSD-0/App/venusD123/ctrl',
      availabilityTopic: 'hame_energy/VNSD-0/availability/venusD123',
      controlSubscriptionTopic: 'hame_energy/VNSD-0/control/venusD123/control',
      publishTopic: 'hame_energy/VNSD-0/device/venusD123/data',
    };

    const pvTopics = (state: object) =>
      generateDiscoveryConfigs(
        device,
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      )
        .map(c => c.topic)
        .filter(t => /pv\d_power|pv\d_connected|total_pv_power/.test(t));

    // No PV data: PV configs are deferred (nothing published)
    expect(pvTopics({ batterySoc: 94 })).toHaveLength(0);

    // PV data present: power, connected and total PV configs are advertised
    const withPv = pvTopics({
      pv1Power: 259.8,
      pv1Connected: true,
      pv2Power: 0,
      pv2Connected: false,
      totalPvPower: 259.8,
    });
    expect(withPv.some(t => t.includes('pv1_power'))).toBe(true);
    expect(withPv.some(t => t.includes('pv1_connected'))).toBe(true);
    expect(withPv.some(t => t.includes('pv2_power'))).toBe(true);
    expect(withPv.some(t => t.includes('total_pv_power'))).toBe(true);
    // pv3/pv4 have no data, so they remain deferred
    expect(withPv.some(t => t.includes('pv3_'))).toBe(false);
    expect(withPv.some(t => t.includes('pv4_'))).toBe(false);
  });

  test('should advertise the Venus parallel mode select disabled by default', () => {
    const device: Device = { deviceType: 'VNSD-0', deviceId: 'venusD123' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/VNSD-0/device/venusD123/ctrl',
      deviceTopicNew: 'marstek_energy/VNSD-0/device/venusD123/ctrl',
      deviceControlTopicOld: 'hame_energy/VNSD-0/App/venusD123/ctrl',
      deviceControlTopicNew: 'marstek_energy/VNSD-0/App/venusD123/ctrl',
      availabilityTopic: 'hame_energy/VNSD-0/availability/venusD123',
      controlSubscriptionTopic: 'hame_energy/VNSD-0/control/venusD123/control',
      publishTopic: 'hame_energy/VNSD-0/device/venusD123/data',
    };
    const configsFor = (state: object) =>
      generateDiscoveryConfigs(
        device,
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      );

    // Without a par reading the select stays deferred
    expect(
      configsFor({ batterySoc: 94 }).some(c => c.topic.includes('/parallel_mode/config')),
    ).toBe(false);

    // Enabling parallel operation rewires the units and disables backup power,
    // so the control must never be advertised as enabled by default.
    const config = configsFor({ parallelMode: 'off' }).find(c =>
      c.topic.includes('/parallel_mode/config'),
    )?.config;
    expect(config).toMatchObject({ enabled_by_default: false });
  });

  const jupiterTopics = (deviceType: string, deviceId: string): DeviceTopics => ({
    deviceTopicOld: `hame_energy/${deviceType}/device/${deviceId}/ctrl`,
    deviceTopicNew: `marstek_energy/${deviceType}/device/${deviceId}/ctrl`,
    deviceControlTopicOld: `hame_energy/${deviceType}/App/${deviceId}/ctrl`,
    deviceControlTopicNew: `marstek_energy/${deviceType}/App/${deviceId}/ctrl`,
    availabilityTopic: `hame_energy/${deviceType}/availability/${deviceId}`,
    controlSubscriptionTopic: `hame_energy/${deviceType}/control/${deviceId}/control`,
    publishTopic: `hame_energy/${deviceType}/device/${deviceId}/data`,
  });

  // An advertisement whose `enabled` predicate returns false is published as an
  // explicit removal (`config: null`), so "offered" means a non-null config.
  const isOffered = (configs: { config: unknown }[]) =>
    configs.length === 1 && configs[0].config !== null;

  test('should gate the Jupiter Bluetooth advertising switch on firmware 141', () => {
    const device: Device = { deviceType: 'HMN-1', deviceId: 'jupiter123' };
    const bleConfigs = (state: object) =>
      generateDiscoveryConfigs(
        device,
        jupiterTopics('HMN-1', 'jupiter123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => c.topic.includes('bluetooth_advertising'));

    expect(isOffered(bleConfigs({ deviceVersion: 140, bluetoothAdvertisingEnabled: true }))).toBe(
      false,
    );
    expect(isOffered(bleConfigs({ deviceVersion: 141, bluetoothAdvertisingEnabled: true }))).toBe(
      true,
    );
  });

  test('should offer Jupiter battery pack recovery on Jupiter Plus only', () => {
    const recoveryConfigs = (deviceType: string, state: object) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'jupiter123' },
        jupiterTopics(deviceType, 'jupiter123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        // The merged device state carries the device type the message was
        // parsed for, just like the state built from a real payload.
        { deviceType, ...state },
      ).filter(c => c.topic.includes('battery_pack_recovery'));

    // Jupiter Plus on new enough firmware: offered
    expect(isOffered(recoveryConfigs('JPLS-8H', { deviceVersion: 135 }))).toBe(true);
    // Jupiter Plus on older firmware: not offered
    expect(isOffered(recoveryConfigs('JPLS-8H', { deviceVersion: 134 }))).toBe(false);
    // Jupiter C / Jupiter E never offer it
    expect(isOffered(recoveryConfigs('HMM-1', { deviceVersion: 240 }))).toBe(false);
    expect(isOffered(recoveryConfigs('HMN-1', { deviceVersion: 240 }))).toBe(false);
  });

  test('should generate discovery configs for the SMR smart meter reader', () => {
    const device: Device = { deviceType: 'SMR-0', deviceId: 'b8d08fc5f943' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/SMR-0/device/b8d08fc5f943/ctrl',
      deviceTopicNew: 'marstek_energy/SMR-0/device/b8d08fc5f943/ctrl',
      deviceControlTopicOld: 'hame_energy/SMR-0/App/b8d08fc5f943/ctrl',
      deviceControlTopicNew: 'marstek_energy/SMR-0/App/b8d08fc5f943/ctrl',
      availabilityTopic: 'hame_energy/SMR-0/availability/b8d08fc5f943',
      controlSubscriptionTopic: 'hame_energy/SMR-0/control/b8d08fc5f943/control',
      publishTopic: 'hame_energy/SMR-0/device/b8d08fc5f943/data',
    };

    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      {},
    );
    const byObjectId = (objectId: string) =>
      configs.find(c => c.topic.endsWith(`/${objectId}/config`));

    expect(byObjectId('total_power')?.config).toMatchObject({
      device_class: 'power',
      unit_of_measurement: 'W',
      state_topic: 'hame_energy/SMR-0/device/b8d08fc5f943/data/data',
    });

    // eng_t is a net reading in 0.1 Wh, so it is scaled and reported as `total`
    expect(byObjectId('total_energy')?.config).toMatchObject({
      device_class: 'energy',
      unit_of_measurement: 'Wh',
      state_class: 'total',
    });

    expect(byObjectId('p1_device_connected')?.config).toMatchObject({
      device_class: 'connectivity',
      payload_on: true,
      payload_off: false,
    });

    // Diagnostics are advertised but off by default
    expect(byObjectId('meter_number')?.config).toMatchObject({ enabled_by_default: false });
    expect(byObjectId('phase_read_status')?.config).toMatchObject({ enabled_by_default: false });
  });

  test('should advertise the shared meter components for both CT002 and SMR', () => {
    const objectIds = (deviceType: string, deviceId: string, state: object = {}) => {
      const deviceTopics: DeviceTopics = {
        deviceTopicOld: 'a',
        deviceTopicNew: 'b',
        deviceControlTopicOld: 'c',
        deviceControlTopicNew: 'd',
        availabilityTopic: 'e',
        controlSubscriptionTopic: 'f',
        publishTopic: 'g',
      };
      return generateDiscoveryConfigs(
        { deviceType, deviceId },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).map(c => c.topic.split('/').at(-2));
    };

    // The phase direction components are deferred until the device reports cur_d
    const withDirection = {
      phase1MeasurementReversed: false,
      phase2MeasurementReversed: false,
      phase3MeasurementReversed: false,
    };

    const shared = [
      'timestamp',
      'phase1_power',
      'phase2_power',
      'phase3_power',
      'total_power',
      'phase1_measurement_reversed',
      'phase2_measurement_reversed',
      'phase3_measurement_reversed',
      'slave_count',
      'bluetooth_signal',
      'wifi_rssi',
      'fc4_version',
      'firmware_version',
      'wifi_status',
    ];

    const ct002 = objectIds('HME-4', 'abcd', withDirection);
    const smr = objectIds('SMR-0', 'b8d08fc5f943', withDirection);
    for (const id of shared) {
      expect(ct002).toContain(id);
      expect(smr).toContain(id);
    }

    // The CT002 gets the shared components plus the meter buttons; the SMR
    // adds its own reader-specific ones on top
    const buttons = ['refresh', 'factory_reset', 'hardware_reset'];
    expect(ct002.sort()).toEqual([...shared, ...buttons].sort());
    expect(smr).toContain('total_energy');
    expect(ct002).not.toContain('total_energy');

    // Without cur_d data the direction components are deferred entirely
    const noDirection = objectIds('HME-4', 'abcd');
    expect(noDirection).not.toContain('phase1_measurement_reversed');
  });

  test('should expose the phase direction as a switch on CT002 but read-only on SMR', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'hm2mqtt/control/meter',
      publishTopic: 'g',
    };
    const state = { phase1MeasurementReversed: true };
    const configFor = (deviceType: string) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).find(c => c.topic.endsWith('/phase1_measurement_reversed/config'));

    const ct002 = configFor('HME-4');
    expect(ct002?.topic).toContain('/switch/');
    expect(ct002?.config).toMatchObject({
      command_topic: 'hm2mqtt/control/meter/phase1-measurement-reversed',
      enabled_by_default: false,
    });

    // cd=5 means something else on the SMR, so it stays read-only there
    const smr = configFor('SMR-0');
    expect(smr?.topic).toContain('/binary_sensor/');
    expect(smr?.config).not.toHaveProperty('command_topic');
  });

  test('should advertise refresh and reset buttons on every meter type', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'hm2mqtt/control/meter',
      publishTopic: 'g',
    };

    for (const deviceType of ['HME-4', 'TPM-CN', 'TPM2-0', 'SMR-0']) {
      const configs = generateDiscoveryConfigs(
        { deviceType, deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        {},
      ).filter(c => c.topic.includes('/button/'));

      expect(configs.map(c => c.topic.split('/').at(-2)).sort()).toEqual([
        'factory_reset',
        'hardware_reset',
        'refresh',
      ]);
      // Destructive or redundant, so off by default
      for (const c of configs) {
        expect(c.config).toMatchObject({ enabled_by_default: false });
      }
      expect(configs.find(c => c.topic.includes('refresh'))?.config).toMatchObject({
        command_topic: 'hm2mqtt/control/meter/refresh',
        payload_press: 'PRESS',
      });
    }
  });

  test('should defer the CT002 phase energy configs until cd=19 is answered', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'f',
      publishTopic: 'hm2mqtt/HME-4/device/meter',
    };
    const phaseEnergyConfigs = (state: object) =>
      generateDiscoveryConfigs(
        { deviceType: 'HME-4', deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => /phase\d_(charge|discharge)/.test(c.topic));

    expect(phaseEnergyConfigs({})).toHaveLength(0);

    const answered = phaseEnergyConfigs({
      phase1Charge: 100,
      phase2Charge: 200,
      phase3Charge: 300,
      phase1Discharge: 10,
      phase2Discharge: 20,
      phase3Discharge: 30,
    });
    expect(answered).toHaveLength(6);
    // Published on their own path, and with no unit claimed
    expect(answered[0].config).toMatchObject({
      state_topic: 'hm2mqtt/HME-4/device/meter/phase_energy',
      enabled_by_default: false,
    });
    // The scale of these counters is unknown, so no unit or device class is claimed
    expect(answered[0].config?.unit_of_measurement).toBeUndefined();
    expect(answered[0].config?.device_class).toBeUndefined();

    // The SMR family gets its energy from eng_t instead
    const smr = generateDiscoveryConfigs(
      { deviceType: 'SMR-0', deviceId: 'meter' },
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      { phase1Charge: 100 },
    ).filter(c => /phase\d_charge/.test(c.topic));
    expect(smr).toHaveLength(0);
  });
  test('should clear the discovery config of the renamed Jupiter daily energy sensor', () => {
    const device: Device = { deviceType: 'HMN-1', deviceId: 'jupiter1' };
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'hame_energy/HMN-1/device/jupiter1/ctrl',
      deviceTopicNew: 'marstek_energy/HMN-1/device/jupiter1/ctrl',
      deviceControlTopicOld: 'hame_energy/HMN-1/App/jupiter1/ctrl',
      deviceControlTopicNew: 'marstek_energy/HMN-1/App/jupiter1/ctrl',
      availabilityTopic: 'hame_energy/HMN-1/availability/jupiter1',
      controlSubscriptionTopic: 'hame_energy/HMN-1/control/jupiter1/control',
      publishTopic: 'hame_energy/HMN-1/device/jupiter1/data',
    };

    const configs = generateDiscoveryConfigs(
      device,
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
    );

    // The pre-1.10.0 identity is cleared, which is what removes the leftover
    // entity from Home Assistant
    const retired = configs.filter(
      c => c.topic === 'homeassistant/sensor/HMN-1_jupiter1/daily_charging_capacity/config',
    );
    expect(retired).toHaveLength(1);
    expect(retired[0].config).toBeNull();

    // ...and the sensor it was renamed to is advertised as usual
    const current = configs.find(
      c => c.topic === 'homeassistant/sensor/HMN-1_jupiter1/daily_power_generation/config',
    );
    expect(current?.config).toMatchObject({
      name: 'Daily Power Generation',
      value_template: '{{ value_json.dailyPowerGeneration }}',
    });

    // Other devices keep their own daily charging capacity sensor
    const venus = generateDiscoveryConfigs(
      { deviceType: 'HMG-50', deviceId: 'venus1' },
      deviceTopics,
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
    ).find(c => /daily_charging_capacity/.test(c.topic));
    expect(venus?.config).not.toBeNull();
  });

  test('should publish an empty retained payload for a retired entity', () => {
    const published: Array<[string, string]> = [];
    const mockClient = {
      publish: jest.fn((topic: string, message: string, options: unknown, callback: any) => {
        published.push([topic, message]);
        callback(null);
      }),
    };

    publishDiscoveryConfigs(
      mockClient as never,
      { deviceType: 'HMN-1', deviceId: 'jupiter1' },
      {
        deviceTopicOld: 'hame_energy/HMN-1/device/jupiter1/ctrl',
        deviceTopicNew: 'marstek_energy/HMN-1/device/jupiter1/ctrl',
        deviceControlTopicOld: 'hame_energy/HMN-1/App/jupiter1/ctrl',
        deviceControlTopicNew: 'marstek_energy/HMN-1/App/jupiter1/ctrl',
        availabilityTopic: 'hame_energy/HMN-1/availability/jupiter1',
        controlSubscriptionTopic: 'hame_energy/HMN-1/control/jupiter1/control',
        publishTopic: 'hame_energy/HMN-1/device/jupiter1/data',
      },
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      {},
    );

    expect(
      published.filter(
        ([topic]) => topic === 'homeassistant/sensor/HMN-1_jupiter1/daily_charging_capacity/config',
      ),
    ).toEqual([['homeassistant/sensor/HMN-1_jupiter1/daily_charging_capacity/config', '']]);
    expect(mockClient.publish.mock.calls[0][2]).toMatchObject({ retain: true });
  });
});
