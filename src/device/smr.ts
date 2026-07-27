import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import { SmrMeterDeviceData } from '../types.js';
import { binarySensorComponent, sensorComponent } from '../homeAssistantDiscovery.js';
import { chain, divide, identity, notEqualsBoolean, number, round } from '../transforms.js';

/**
 * Marstek smart meter reader, device type `SMR-X`:
 *
 * - `SMR-0` — Marstek P1 Meter
 * - `SMR-1` — Marstek Infrared Meter
 * - `SMR-2` — Marstek TIC Meter
 *
 * These are marketed as "CT003". They report the same runtime payload as the
 * CT002 smart meter (`pwr_a`/`pwr_b`/`pwr_c`/`pwr_t` plus the usual
 * connectivity and version keys) plus a handful of reader specific keys.
 */

const requiredRuntimeInfoKeys = ['pwr_t', 'ver_v'];

function isSmrRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(k => k in values);
}

function extractAdditionalDeviceInfo(state: SmrMeterDeviceData) {
  return {
    firmwareVersion: state.firmwareVersion?.toString(),
  };
}

registerDeviceDefinition(
  {
    deviceTypes: ['SMR'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=1',
    isMessage: isSmrRuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: extractAdditionalDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;
  message<SmrMeterDeviceData>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock',
      }),
    );

    field({ key: 'pwr_a', path: ['phase1Power'], transform: number() });
    advertise(
      ['phase1Power'],
      sensorComponent<number>({
        id: 'phase1_power',
        name: 'Phase 1 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_b', path: ['phase2Power'], transform: number() });
    advertise(
      ['phase2Power'],
      sensorComponent<number>({
        id: 'phase2_power',
        name: 'Phase 2 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_c', path: ['phase3Power'], transform: number() });
    advertise(
      ['phase3Power'],
      sensorComponent<number>({
        id: 'phase3_power',
        name: 'Phase 3 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_t', path: ['totalPower'], transform: number() });
    advertise(
      ['totalPower'],
      sensorComponent<number>({
        id: 'total_power',
        name: 'Total Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // Reported in 0.1 Wh. The value is a net meter reading (grid import minus
    // export), so it can go down as well as up — hence `total` rather than
    // `total_increasing`.
    field({ key: 'eng_t', path: ['totalEnergy'], transform: chain(divide(10), round(1)) });
    advertise(
      ['totalEnergy'],
      sensorComponent<number>({
        id: 'total_energy',
        name: 'Total Energy',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total',
      }),
    );

    // Identifies which smart meter model the reader is configured for. The
    // number refers to Marstek's meter catalogue, which is only available in
    // the app, so this is a diagnostic value.
    field({ key: 'smt_n', path: ['meterNumber'], transform: number() });
    advertise(
      ['meterNumber'],
      sensorComponent<number>({
        id: 'meter_number',
        name: 'Meter Number',
        icon: 'mdi:counter',
        enabled_by_default: false,
      }),
    );

    field({ key: 'har_f', path: ['p1DeviceConnected'], transform: notEqualsBoolean('0') });
    advertise(
      ['p1DeviceConnected'],
      binarySensorComponent({
        id: 'p1_device_connected',
        name: 'P1 Device Connected',
        device_class: 'connectivity',
      }),
    );

    field({ key: 'sof_f', path: ['p1ReadStatus'], transform: number() });
    advertise(
      ['p1ReadStatus'],
      sensorComponent<number>({
        id: 'p1_read_status',
        name: 'P1 Read Status',
        enabled_by_default: false,
      }),
    );

    field({ key: 'irs_f', path: ['infraredReadStatus'], transform: number() });
    advertise(
      ['infraredReadStatus'],
      sensorComponent<number>({
        id: 'infrared_read_status',
        name: 'Infrared Read Status',
        enabled_by_default: false,
      }),
    );

    // Bitmask with one bit per phase.
    field({ key: 'pwr_f', path: ['phaseReadStatus'], transform: number() });
    advertise(
      ['phaseReadStatus'],
      sensorComponent<number>({
        id: 'phase_read_status',
        name: 'Phase Read Status',
        enabled_by_default: false,
      }),
    );

    field({ key: 'ble_s', path: ['bluetoothSignal'], transform: number() });
    advertise(
      ['bluetoothSignal'],
      sensorComponent<number>({
        id: 'bluetooth_signal',
        name: 'Bluetooth Signal',
      }),
    );

    field({ key: 'wif_r', path: ['wifiRssi'], transform: number() });
    advertise(
      ['wifiRssi'],
      sensorComponent<number>({
        id: 'wifi_rssi',
        name: 'WiFi RSSI',
        device_class: 'signal_strength',
        unit_of_measurement: 'dBm',
        state_class: 'measurement',
      }),
    );

    field({ key: 'fc4_v', path: ['fc4Version'], transform: identity() });
    advertise(
      ['fc4Version'],
      sensorComponent<string>({
        id: 'fc4_version',
        name: 'FC41D Firmware',
      }),
    );

    field({ key: 'ver_v', path: ['firmwareVersion'], transform: number() });
    advertise(
      ['firmwareVersion'],
      sensorComponent<number>({
        id: 'firmware_version',
        name: 'Firmware Version',
      }),
    );

    field({ key: 'wif_s', path: ['wifiStatus'], transform: number() });
    advertise(
      ['wifiStatus'],
      sensorComponent<number>({
        id: 'wifi_status',
        name: 'WiFi Status',
      }),
    );
  });
}
