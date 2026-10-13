import { jest } from '@jest/globals';
import './device/registry.js';
import { generateDiscoveryConfigs, publishDiscoveryConfigs } from './generateDiscoveryConfigs.js';
import { parseMessage } from './parser.js';
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

  test('should clear the pass-through sensors on HMJ, which never reports them', () => {
    const configsFor = (deviceType: string) => {
      const device: Device = { deviceType, deviceId: 'test123' };
      const deviceTopics: DeviceTopics = {
        deviceTopicOld: `hame_energy/${deviceType}/device/test123/ctrl`,
        deviceTopicNew: `marstek_energy/${deviceType}/device/test123/ctrl`,
        publishTopic: `hame_energy/${deviceType}/device/test123/data`,
        deviceControlTopicOld: `hame_energy/${deviceType}/App/test123/ctrl`,
        deviceControlTopicNew: `marstek_energy/${deviceType}/App/test123/ctrl`,
        controlSubscriptionTopic: `hame_energy/${deviceType}/control/test123/control`,
        availabilityTopic: `hame_energy/${deviceType}/availability/test123`,
      };
      return generateDiscoveryConfigs(
        device,
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        { deviceType, deviceInfo: { deviceVersion: 116 } },
      );
    };
    const passThrough = (deviceType: string, input: 1 | 2) =>
      configsFor(deviceType).find(
        c =>
          c.topic.includes(`binary_sensor/`) &&
          c.topic.endsWith(`/input${input}_pass_through/config`),
      );

    for (const input of [1, 2] as const) {
      const hmj = passThrough('HMJ-2', input);
      expect(hmj).toBeDefined();
      expect(hmj?.config).toBeNull();

      const hma = passThrough('HMA-1', input);
      expect(hma?.config).not.toBeNull();
    }
    // The charging flag in bit 0 stays.
    expect(
      configsFor('HMJ-2').find(c => c.topic.endsWith('/input1_charging/config'))?.config,
    ).not.toBeNull();
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

    // dod present: the config is advertised with the HMG's 30..90 step:1 range
    const withDod = dodConfigs({ depthOfDischarge: 88 });
    expect(withDod).toHaveLength(1);
    expect(withDod[0].config).not.toBeNull();
    expect(withDod[0].config).toMatchObject({ min: 30, max: 90, step: 1 });

    // The other models stop at 88 %.
    const vnse3 = generateDiscoveryConfigs(
      { deviceType: 'VNSE3-0', deviceId: 'venus123' },
      jupiterTopics('VNSE3-0', 'venus123'),
      {},
      DEFAULT_TOPIC_PREFIX,
      'homeassistant',
      { depthOfDischarge: 88 },
    ).find(c => c.topic.includes('depth_of_discharge'));
    expect(vnse3?.config).toMatchObject({ min: 30, max: 88, step: 1 });
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

  test('should gate the Venus Bluetooth advertising switch on the bl setting and build', () => {
    const bleConfigs = (deviceType: string, state: object) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'venus123' },
        jupiterTopics(deviceType, 'venus123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => c.topic.includes('/bluetooth_advertising/'));

    // HMG before 156 has no setting: the switch is removed.
    expect(bleConfigs('HMG-50', { deviceVersion: 155 })).toEqual([
      expect.objectContaining({ config: null }),
    ]);
    expect(
      isOffered(bleConfigs('HMG-50', { deviceVersion: 156, bluetoothAdvertisingEnabled: true })),
    ).toBe(true);
    // Build not known yet: deferred.
    expect(bleConfigs('VNSA-0', {})).toEqual([]);
    // The VNSA 143 reading in #218 has no bl.
    expect(bleConfigs('VNSA-0', { deviceVersion: 143 })).toEqual([
      expect.objectContaining({ config: null }),
    ]);
  });

  test('should offer the Venus local API wherever the device reports it', () => {
    const localApiConfigs = (deviceType: string, payload: string) => {
      const state: Record<string, unknown> = {};
      for (const parsed of Object.values(parseMessage(payload, deviceType, 'venus123'))) {
        Object.assign(state, parsed);
      }
      return generateDiscoveryConfigs(
        { deviceType, deviceId: 'venus123' },
        jupiterTopics(deviceType, 'venus123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => /\/local_api_(enabled|port)\//.test(c.topic));
    };

    // Real Venus D control firmware 147 reading: api=0,port=30000.
    const vnsd147 =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=800,err_a=4,dev_n=147,grd_y=0,wor_m=5,tim_0=0|0|23|59|127|250|0,cts_m=0,bac_u=0,tra_a=74,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=3,wif_s=72,inc_a=0,set_v=1,mcp_w=2200,mdp_w=800,ct_t=3,phase_t=1,dchrg_t=0,bms_v=116,fc_v=202409090159,wifi_n=XXX,seq_s=3,ctrl_r=0,par=0,gen=0,ble=3,shelly_p=1010,c_ratio=100,udp=0,api=0,net=0,port=30000,inv_v=115,id=2|0|0|0|0,lk=0,bp=291,ei=0,eb=0,rp=347,gp=801,vp=801,bl=1,dod=88,bl_p=-1,led=1,as=3,mppt=104,pv1=2584|1,pv2=2638|1,pv3=3180|1,pv4=3080|1,pack=2|3|2|0,pv=24|24,fu=0|0,em=0';
    const vnsd = localApiConfigs('VNSD-0', vnsd147);
    expect(vnsd).toHaveLength(2);
    expect(vnsd.every(c => c.config !== null)).toBe(true);

    // HMG control firmware 149 has no local API: removed.
    const hmg149 =
      'tot_i=8848,tot_o=7097,ele_d=537,ele_m=8848,grd_d=328,grd_m=7097,inc_d=0,inc_m=0,grd_f=0,grd_o=613,grd_t=3,gct_s=1,cel_s=3,cel_p=327,cel_c=64,err_t=0,err_a=0,dev_n=149,grd_y=0,wor_m=0,tim_0=0|0|8|2|127|300|1,tim_1=0|0|5|23|127|350|0,tim_2=17|21|23|59|127|600|1,tim_3=9|31|16|30|127|-800|1,tim_4=0|0|0|0|0|0|0,tim_5=0|0|0|0|0|0|0,tim_6=0|0|0|0|0|0|0,tim_7=0|0|0|0|0|0|0,tim_8=0|0|0|0|0|0|0,tim_9=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=33,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=4,phase_t=1,dchrg_t=1,bms_v=212,fc_v=202409090159,wifi_n=XXX,seq_s=0,ctrl_r=1,par=255,gen=255,ble=3,shelly_p=1010,c_ratio=90';
    const hmg = localApiConfigs('HMG-1', hmg149);
    expect(hmg).toHaveLength(2);
    expect(hmg.every(c => c.config === null)).toBe(true);
  });

  test('should offer the Venus working modes each model and build supports', () => {
    const options = (deviceType: string, state: object) => {
      const configs = generateDiscoveryConfigs(
        { deviceType, deviceId: 'venus123' },
        jupiterTopics(deviceType, 'venus123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => c.topic.includes('/working_mode/'));
      expect(configs).toHaveLength(1);
      return (configs[0].config as unknown as { options: string[] }).options;
    };

    expect(options('HMG-50', { deviceVersion: 156 })).toEqual([
      'Automatic',
      'Manual',
      'AI',
      'Passive (Local API)',
    ]);
    expect(options('HMG-1', {})).not.toContain('Trading');
    expect(options('HMG-1', { deviceVersion: 146 })).toContain('Trading');
    expect(options('VNSA-0', { deviceVersion: 151 })).toEqual([
      'Automatic',
      'Manual',
      'AI',
      'Passive (Local API)',
      'Modbus',
    ]);
  });

  test('should remove the Venus price, income, error and grid type sensors where unfilled', () => {
    const ids = [
      'charging_price',
      'discharge_price',
      'daily_income',
      'monthly_income',
      'total_income',
      'error_code',
      'warning_code',
      'grid_type',
    ];
    const offered = (deviceType: string, payload: string) => {
      const state: Record<string, unknown> = {};
      for (const parsed of Object.values(parseMessage(payload, deviceType, 'venus123'))) {
        Object.assign(state, parsed);
      }
      const configs = generateDiscoveryConfigs(
        { deviceType, deviceId: 'venus123' },
        jupiterTopics(deviceType, 'venus123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      );
      return Object.fromEntries(
        ids.map(id => {
          const matching = configs.filter(c => c.topic.includes(`/${id}/`));
          expect([id, matching.length]).toEqual([id, 1]);
          return [id, matching[0].config !== null];
        }),
      );
    };

    // Real HMG-50 control firmware 156 reading (#240).
    const hmg156 =
      'tot_i=102607,tot_o=84500,ele_d=469,ele_m=1119,grd_d=391,grd_m=930,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=56,cel_c=11,err_t=0,err_a=0,dev_n=156,grd_y=0,wor_m=0,tim_0=0|0|0|0|0|0|0,tim_1=0|0|0|0|0|0|0,tim_2=0|0|0|0|0|0|0,tim_3=0|0|0|0|0|0|0,tim_4=0|0|0|0|0|0|0,tim_5=0|0|0|0|0|0|0,tim_6=0|0|0|0|0|0|0,tim_7=0|0|0|0|0|0|0,tim_8=0|0|0|0|0|0|0,tim_9=0|0|23|59|127|-2500|1,cts_m=0,bac_u=1,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=2,wif_s=49,inc_a=0,set_v=1,mcp_w=-1,mdp_w=800,ct_t=5,phase_t=1,dchrg_t=0,bms_v=216,fc_v=202501211626,wifi_n=XXX,seq_s=0,ctrl_r=1,par=0,gen=255,ble=2,shelly_p=1010,c_ratio=100,udp=0,api=0,port=30000,id=2|0|1|255|0,bl=1,dod=88';
    expect(Object.values(offered('HMG-50', hmg156)).some(Boolean)).toBe(false);

    // Real Venus D control firmware 147 reading: only the error words are real.
    const vnsd147 =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=800,err_a=4,dev_n=147,grd_y=0,wor_m=5,tim_0=0|0|23|59|127|250|0,cts_m=0,bac_u=0,tra_a=74,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=3,wif_s=72,inc_a=0,set_v=1,mcp_w=2200,mdp_w=800,ct_t=3,phase_t=1,dchrg_t=0,bms_v=116,fc_v=202409090159,wifi_n=XXX,seq_s=3,ctrl_r=0,par=0,gen=0,ble=3,shelly_p=1010,c_ratio=100,udp=0,api=0,net=0,port=30000,inv_v=115,id=2|0|0|0|0,lk=0,bp=291,ei=0,eb=0,rp=347,gp=801,vp=801,bl=1,dod=88,bl_p=-1,led=1,as=3,mppt=104,pv1=2584|1,pv2=2638|1,pv3=3180|1,pv4=3080|1,pack=2|3|2|0,pv=24|24,fu=0|0,em=0';
    expect(offered('VNSD-0', vnsd147)).toEqual({
      charging_price: false,
      discharge_price: false,
      daily_income: false,
      monthly_income: false,
      total_income: false,
      error_code: true,
      warning_code: true,
      grid_type: false,
    });

    // HMG control firmware 146 still reports prices and income.
    const hmg146 = hmg156.replace('dev_n=156', 'dev_n=146');
    expect(offered('HMG-50', hmg146)).toEqual({
      charging_price: true,
      discharge_price: true,
      daily_income: true,
      monthly_income: true,
      total_income: true,
      error_code: false,
      warning_code: false,
      grid_type: false,
    });

    // HMG control firmware 152: income, but no prices.
    const hmg152 = offered('HMG-50', hmg156.replace('dev_n=156', 'dev_n=152'));
    expect([hmg152.daily_income, hmg152.charging_price]).toEqual([true, false]);
  });

  test('should offer the Venus Restart button on every VNS build and HMG from 151', () => {
    const restart = (deviceType: string, state: object) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'venus123' },
        jupiterTopics(deviceType, 'venus123'),
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => c.topic.includes('/button/') && c.topic.includes('/restart/'));

    expect(restart('HMG-50', { deviceVersion: 149 })).toEqual([
      expect.objectContaining({ config: null }),
    ]);
    expect(isOffered(restart('HMG-50', { deviceVersion: 151 }))).toBe(true);
    // HMG build not known yet: deferred.
    expect(restart('HMG-50', {})).toEqual([]);
    // Every VNS build has it, so no device data is needed.
    expect(isOffered(restart('VNSA-0', {}))).toBe(true);
    expect(restart('VNSE3-0', {})[0].config).toMatchObject({
      command_topic: expect.any(String),
      payload_press: 'PRESS',
      enabled_by_default: false,
    });
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

  test('should give the HME-3 and HME-5 (CT003) the SMR reader entities, not the CT002 ones', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'f',
      publishTopic: 'g',
    };
    const topicsFor = (deviceType: string) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: '0123456789ab' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        { totalEnergy: 455348, phase1Charge: 100 },
      ).map(c => c.topic.replace('0123456789ab', '<id>').replace(deviceType, '<type>'));

    for (const deviceType of ['HME-3', 'HME-5']) {
      const topics = topicsFor(deviceType);
      expect(topics.sort()).toEqual(topicsFor('SMR-0').sort());
      expect(topics.some(t => t.includes('/total_energy/'))).toBe(true);
      expect(topics.some(t => t.includes('/p1_device_connected/'))).toBe(true);
      expect(topics.some(t => /switch\/.*phase\d_measurement_reversed/.test(t))).toBe(false);
      expect(topics.some(t => /phase\d_charge/.test(t))).toBe(false);
    }
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

  test('should label the meter Bluetooth and WiFi states', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'f',
      publishTopic: 'g',
    };

    for (const deviceType of ['HME-4', 'HME-3', 'TPM-CN', 'TPM2-0', 'SMR-0']) {
      const configs = generateDiscoveryConfigs(
        { deviceType, deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        {},
      );
      const configFor = (objectId: string) =>
        configs.find(c => c.topic.endsWith(`/${objectId}/config`))?.config;

      // ble_s is the Bluetooth module state; the id stays bluetooth_signal
      const bluetooth = configFor('bluetooth_signal');
      expect(bluetooth).toMatchObject({ name: 'Bluetooth State' });
      expect(bluetooth?.value_template).toContain('"5":"Connected"');
      expect(bluetooth?.value_template).toContain('"6":"Disconnected"');
      expect(bluetooth?.unit_of_measurement).toBeUndefined();
      expect(bluetooth?.state_class).toBeUndefined();

      const wifi = configFor('wifi_status');
      expect(wifi).toMatchObject({ name: 'WiFi Status' });
      expect(wifi?.value_template).toContain('"2":"Connected"');
      expect(wifi?.value_template).toContain('"3":"No access point"');
      expect(wifi?.unit_of_measurement).toBeUndefined();
      expect(wifi?.state_class).toBeUndefined();
    }
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

  test('should defer the CT002 voltage, current and energy configs until they are reported', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'f',
      publishTopic: 'hm2mqtt/HME-4/device/meter',
    };
    const configs = (deviceType: string, state: object) =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      );
    const byObjectId = (list: ReturnType<typeof configs>, objectId: string) =>
      list.find(c => c.topic.endsWith(`/${objectId}/config`))?.config;
    const isNew = (topic: string) =>
      /(voltage|current|reactive_power|voltage_angle|positive_energy|negative_energy)\/config$/.test(
        topic,
      );

    expect(configs('HME-4', {}).filter(c => isNew(c.topic))).toHaveLength(0);

    const reported = configs('HME-4', {
      phase1Voltage: 231,
      phase1Current: 1.25,
      phase1ReactivePower: 12,
      phase12VoltageAngle: 120,
      phase1PositiveEnergy: 12500,
      totalNegativeEnergy: 5040,
    });
    expect(byObjectId(reported, 'phase1_voltage')).toMatchObject({
      device_class: 'voltage',
      unit_of_measurement: 'V',
      state_topic: 'hm2mqtt/HME-4/device/meter/phase_measurements',
    });
    expect(byObjectId(reported, 'phase1_voltage')?.enabled_by_default).toBeUndefined();
    expect(byObjectId(reported, 'phase1_current')).toMatchObject({
      device_class: 'current',
      unit_of_measurement: 'A',
    });
    expect(byObjectId(reported, 'phase1_reactive_power')).toMatchObject({
      enabled_by_default: false,
    });
    expect(byObjectId(reported, 'phase12_voltage_angle')).toMatchObject({
      enabled_by_default: false,
    });
    expect(byObjectId(reported, 'phase1_positive_energy')).toMatchObject({
      device_class: 'energy',
      unit_of_measurement: 'Wh',
      state_class: 'total_increasing',
      enabled_by_default: false,
      state_topic: 'hm2mqtt/HME-4/device/meter/energy',
    });
    expect(byObjectId(reported, 'total_negative_energy')).toMatchObject({
      state_class: 'total_increasing',
    });
    // Phases that were not reported stay deferred
    expect(byObjectId(reported, 'phase2_voltage')).toBeUndefined();

    // TPM-CN has no cd=31/cd=32
    expect(configs('TPM-CN', { phase1Voltage: 231 }).filter(c => isNew(c.topic))).toHaveLength(0);
  });

  test('should defer the CT002 phase energy configs until cd=19 is answered', () => {
    const deviceTopics: DeviceTopics = {
      deviceTopicOld: 'a',
      deviceTopicNew: 'b',
      deviceControlTopicOld: 'c',
      deviceControlTopicNew: 'd',
      availabilityTopic: 'e',
      controlSubscriptionTopic: 'f',
      publishTopic: 'hm2mqtt/TPM-CN/device/meter',
    };
    const phaseEnergyConfigs = (state: object, deviceType = 'TPM-CN') =>
      generateDiscoveryConfigs(
        { deviceType, deviceId: 'meter' },
        deviceTopics,
        {},
        DEFAULT_TOPIC_PREFIX,
        'homeassistant',
        state,
      ).filter(c => /phase\d_(charge|discharge)/.test(c.topic));

    expect(phaseEnergyConfigs({})).toHaveLength(0);

    const counters = {
      phase1Charge: 100,
      phase2Charge: 200,
      phase3Charge: 300,
      phase1Discharge: 10,
      phase2Discharge: 20,
      phase3Discharge: 30,
    };
    const answered = phaseEnergyConfigs(counters);
    expect(answered).toHaveLength(6);
    expect(phaseEnergyConfigs(counters, 'TPM2-0')).toHaveLength(6);
    // The HME CT002s have no cd=19, so they never get these entities
    expect(phaseEnergyConfigs(counters, 'HME-4')).toHaveLength(0);
    // Published on their own path, and with no unit claimed
    expect(answered[0].config).toMatchObject({
      state_topic: 'hm2mqtt/TPM-CN/device/meter/phase_energy',
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
});
