import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import { SmrMeterDeviceData } from '../types.js';
import { binarySensorComponent, sensorComponent } from '../homeAssistantDiscovery.js';
import { chain, divide, notEqualsBoolean, number, round } from '../transforms.js';
import { extractMeterDeviceInfo, registerMeterBaseFields } from './meterBase.js';

/**
 * Marstek smart meter reader, device type `SMR-X`:
 *
 * - `SMR-0` — Marstek P1 Meter
 * - `SMR-1` — Marstek Infrared Meter
 * - `SMR-2` — Marstek TIC Meter
 *
 * They are sold as the Marstek CT003 Smart Meter Reader, and report the same
 * runtime payload as the CT002 smart meter (see `meterBase.ts`) plus a handful
 * of reader specific keys.
 */

const requiredRuntimeInfoKeys = ['pwr_t', 'ver_v'];

function isSmrRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(k => k in values);
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
    getAdditionalDeviceInfo: extractMeterDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;
  message<SmrMeterDeviceData>(options, args => {
    registerMeterBaseFields(args);

    const { field, advertise } = args;

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
  });
}
