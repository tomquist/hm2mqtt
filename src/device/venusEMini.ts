import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import { VenusEMiniDeviceData } from '../types.js';
import { sensorComponent } from '../homeAssistantDiscovery.js';
import { chain, divide, identity, map, negate, number, round } from '../transforms.js';

/**
 * Marstek Venus E mini, device type `VNSEMINI-X`.
 *
 * Despite the name it is not a Venus in protocol terms. The Venus family
 * (`HMG`, `VNSE3`, `VNSA`, `VNSD`) answers `cd=1` with the `cel_p`/`tot_i`/…
 * key set handled in `venus.ts`; the Venus E mini belongs to a newer family —
 * shared with the Venus X, Venus G and Venus G PV — that is polled with
 * `cd=01` (the leading zero is part of the payload) and reports a completely
 * different set of keys. Pointing hm2mqtt at `VNSE3-0` for a Venus E mini is
 * why those devices never answered.
 *
 * The device carries a 2 kWh battery, so `be` runs from 0 to 2000 Wh.
 */

// `dev_sta` is the field the app itself keys the device's state off, so a
// payload carrying it together with the battery and power trio is a Venus E
// mini runtime response and nothing else.
const requiredRuntimeInfoKeys = ['soc', 'be', 'dpt', 'lp', 'inv_p', 'cm', 'dev_sta'];

function isVenusEMiniRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(key => key in values);
}

registerDeviceDefinition(
  {
    deviceTypes: ['VNSEMINI'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=01',
    isMessage: isVenusEMiniRuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    // The runtime payload carries no firmware version, so there is nothing to
    // add to the Home Assistant device entry.
    getAdditionalDeviceInfo: () => ({}),
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;

  message<VenusEMiniDeviceData>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    // Battery information. `soc` is reported in tenths of a percent: the app
    // divides it by 10 for the percentage it prints next to the battery, and by
    // 1000 for the 0..1 fill of the battery bar.
    field({ key: 'soc', path: ['batterySoc'], transform: chain(divide(10), round(1)) });
    advertise(
      ['batterySoc'],
      sensorComponent<number>({
        id: 'battery_soc',
        name: 'Battery State of Charge',
        device_class: 'battery',
        unit_of_measurement: '%',
        state_class: 'measurement',
      }),
    );

    // Energy left in the battery, in Wh (the app shows it as kWh). This is the
    // remaining charge, not the pack size — the Venus E mini's capacity is a
    // fixed 2000 Wh.
    field({ key: 'be', path: ['batteryEnergy'], transform: number() });
    advertise(
      ['batteryEnergy'],
      sensorComponent<number>({
        id: 'battery_energy',
        name: 'Battery Energy',
        device_class: 'energy_storage',
        unit_of_measurement: 'Wh',
        state_class: 'measurement',
      }),
    );

    field({ key: 'dpt', path: ['batteryPower'], transform: number() });
    advertise(
      ['batteryPower'],
      sensorComponent<number>({
        id: 'battery_power',
        name: 'Battery Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'lp', path: ['loadPower'], transform: number() });
    advertise(
      ['loadPower'],
      sensorComponent<number>({
        id: 'load_power',
        name: 'Load Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // Power at the device's AC port. The app stores this one key into both its
    // grid-power and its inverter-power field.
    field({ key: 'inv_p', path: ['inverterPower'], transform: number() });
    advertise(
      ['inverterPower'],
      sensorComponent<number>({
        id: 'inverter_power',
        name: 'Inverter Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // Working mode. The codes differ from the Venus and Jupiter families, which
    // use 1/2/5 for the same three modes.
    field({
      key: 'cm',
      path: ['workingMode'],
      transform: map(
        {
          '0': 'selfConsumption',
          '2': 'manual',
          '3': 'ai',
        },
        'selfConsumption',
      ),
    });
    advertise(
      ['workingMode'],
      sensorComponent<NonNullable<VenusEMiniDeviceData['workingMode']>>({
        id: 'working_mode',
        name: 'Working Mode',
        icon: 'mdi:cog',
        valueMappings: {
          selfConsumption: 'Self-Consumption',
          manual: 'Manual',
          ai: 'AI Optimizer',
        },
      }),
    );

    field({ key: 'do', path: ['dischargeDepth'], transform: number() });
    advertise(
      ['dischargeDepth'],
      sensorComponent<number>({
        id: 'discharge_depth',
        name: 'Discharge Depth',
        unit_of_measurement: '%',
        icon: 'mdi:battery-arrow-down',
      }),
    );

    // The app reads the WiFi signal as an unsigned magnitude and negates it
    // before displaying, the same convention the Venus and Jupiter use.
    field({ key: 'wifi_a', path: ['wifiRssi'], transform: negate() });
    advertise(
      ['wifiRssi'],
      sensorComponent<number>({
        id: 'wifi_rssi',
        name: 'WiFi RSSI',
        device_class: 'signal_strength',
        unit_of_measurement: 'dBm',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );

    // The keys below are numeric state codes. Which code means what is not
    // confirmed, so they are published as raw numbers rather than as booleans
    // or guessed labels, and stay off by default.
    field({ key: 'bbs', path: ['bluetoothState'], transform: number() });
    advertise(
      ['bluetoothState'],
      sensorComponent<number>({
        id: 'bluetooth_state',
        name: 'Bluetooth State',
        icon: 'mdi:bluetooth',
        enabled_by_default: false,
      }),
    );

    field({ key: 'leds', path: ['ledState'], transform: number() });
    advertise(
      ['ledState'],
      sensorComponent<number>({
        id: 'led_state',
        name: 'LED State',
        icon: 'mdi:led-on',
        enabled_by_default: false,
      }),
    );

    field({ key: 'ls', path: ['loadState'], transform: number() });
    advertise(
      ['loadState'],
      sensorComponent<number>({
        id: 'load_state',
        name: 'Load State',
        enabled_by_default: false,
      }),
    );

    field({ key: 'gs', path: ['gridMode'], transform: number() });
    advertise(
      ['gridMode'],
      sensorComponent<number>({
        id: 'grid_mode',
        name: 'Grid Mode',
        enabled_by_default: false,
      }),
    );

    field({ key: 'dev_sta', path: ['deviceState'], transform: number() });
    advertise(
      ['deviceState'],
      sensorComponent<number>({
        id: 'device_state',
        name: 'Device State',
        enabled_by_default: false,
      }),
    );

    field({ key: 'rechg_type', path: ['rechargeType'], transform: number() });
    advertise(
      ['rechargeType'],
      sensorComponent<number>({
        id: 'recharge_type',
        name: 'Recharge Type',
        enabled_by_default: false,
      }),
    );

    field({ key: 'mq_s', path: ['mqttState'], transform: number() });
    advertise(
      ['mqttState'],
      sensorComponent<number>({
        id: 'mqtt_state',
        name: 'MQTT State',
        enabled_by_default: false,
      }),
    );

    field({ key: 'ser', path: ['serverState'], transform: number() });
    advertise(
      ['serverState'],
      sensorComponent<number>({
        id: 'server_state',
        name: 'Server State',
        enabled_by_default: false,
      }),
    );

    field({ key: 'gps', path: ['maxSendGridPowerState'], transform: number() });
    advertise(
      ['maxSendGridPowerState'],
      sensorComponent<number>({
        id: 'max_send_grid_power_state',
        name: 'Max Send Grid Power State',
        enabled_by_default: false,
      }),
    );

    field({ key: 'time', path: ['deviceTime'], transform: identity() });
    advertise(
      ['deviceTime'],
      sensorComponent<string>({
        id: 'device_time',
        name: 'Device Time',
        icon: 'mdi:clock-outline',
        enabled_by_default: false,
      }),
    );
  });
}
