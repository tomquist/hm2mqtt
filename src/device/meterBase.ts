import { BuildMessageDefinitionArgs, extractBaseType } from '../deviceDefinition.js';
import { MeterBaseDeviceData } from '../types.js';
import {
  binarySensorComponent,
  sensorComponent,
  switchComponent,
} from '../homeAssistantDiscovery.js';
import { bitBoolean, identity, number } from '../transforms.js';

/**
 * Shared building blocks for the Marstek meters: the CT002 smart meter
 * (`HME-X`, see `ct002.ts`) and the SMR smart meter readers (`SMR-X`, see
 * `smr.ts`). Both speak the same protocol and report the same per-phase power
 * and connectivity keys.
 */

export function extractMeterDeviceInfo(state: MeterBaseDeviceData) {
  return {
    firmwareVersion: state.firmwareVersion?.toString(),
  };
}

/**
 * The three phases of the `cur_d` bitmask, in bit order.
 */
const phaseMeasurementDirections = [
  { bit: 0, path: 'phase1MeasurementReversed', id: 'phase1_measurement_reversed', label: 1 },
  { bit: 1, path: 'phase2MeasurementReversed', id: 'phase2_measurement_reversed', label: 2 },
  { bit: 2, path: 'phase3MeasurementReversed', id: 'phase3_measurement_reversed', label: 3 },
] as const;

/**
 * Parameter name the `cd=5` direction command uses. `TPM2` devices expect
 * `dir`; every other CT002 variant expects `p1`.
 */
function directionParam(deviceType: string): 'dir' | 'p1' {
  return extractBaseType(deviceType).toUpperCase() === 'TPM2' ? 'dir' : 'p1';
}

function measurementDirectionMask(state: {
  phase1MeasurementReversed?: boolean;
  phase2MeasurementReversed?: boolean;
  phase3MeasurementReversed?: boolean;
}): number {
  return phaseMeasurementDirections.reduce(
    (mask, { bit, path }) => (state[path] ? mask | (1 << bit) : mask),
    0,
  );
}

/**
 * `cur_d` is a bitmask with one bit per phase, set when that phase's
 * measurement direction is reversed. (The CT002 also accepts the key under the
 * alias `cur_dir`.)
 *
 * It is written back with `cd=5,p1=<mask>`, using the same bit layout the
 * runtime payload reports. `TPM2` devices spell the parameter `dir` instead:
 * `cd=5,dir=<mask>`.
 *
 * The command is opt-in per device type because `cd=5` is not universal: on the
 * SMR readers `cd=5,p1=…,p2=…,p3=…,p4=…` configures the attached smart meter,
 * and they offer no measurement-direction setting at all. Sending a direction
 * command there could reconfigure the meter interface instead.
 */
function registerPhaseMeasurementDirection<T extends MeterBaseDeviceData>(
  args: BuildMessageDefinitionArgs<T>,
  options: MeterBaseOptions,
): void {
  const { field, advertise, command } =
    args as unknown as BuildMessageDefinitionArgs<MeterBaseDeviceData>;

  for (const { bit, path, id, label } of phaseMeasurementDirections) {
    field({ key: 'cur_d', path: [path], transform: bitBoolean(bit) });

    const name = `Phase ${label} Measurement Reversed`;
    // Only advertise once the device has actually reported `cur_d`, so devices
    // that never send it do not get a control that cannot work.
    const enabled = {
      enabled: (state: MeterBaseDeviceData) => (state[path] != null ? true : undefined),
    };

    if (!options.settablePhaseMeasurementDirection) {
      advertise([path], binarySensorComponent({ id, name, enabled_by_default: false }), enabled);
      continue;
    }

    const commandName = `${id.replace(/_/g, '-')}`;
    advertise(
      [path],
      switchComponent({ id, name, command: commandName, enabled_by_default: false }),
      enabled,
    );
    command(commandName, {
      handler: ({ device, message, publishCallback, updateDeviceState }) => {
        const reversed = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
        // The device takes the whole bitmask, so fold the new value into the
        // other two phases as currently reported.
        const state = updateDeviceState(() => ({ [path]: reversed }));
        publishCallback(
          `cd=5,${directionParam(device.deviceType)}=${measurementDirectionMask(state)}`,
        );
      },
    });
  }
}

/**
 * Register the fields and Home Assistant components every Marstek meter
 * reports. Device specific fields are registered by the caller.
 */
export interface MeterBaseOptions {
  /**
   * Expose the per-phase measurement direction as switches backed by the
   * `cd=5` command instead of read-only binary sensors. Only enable this for
   * device types where `cd=5` really is the direction command — see
   * {@link registerPhaseMeasurementDirection}.
   */
  settablePhaseMeasurementDirection?: boolean;
}

export function registerMeterBaseFields<T extends MeterBaseDeviceData>(
  args: BuildMessageDefinitionArgs<T>,
  options: MeterBaseOptions = {},
): void {
  // `field`/`advertise` are keyed on `KeyPath<T>`. Every path used below exists
  // on `MeterBaseDeviceData`, which `T` extends, but TypeScript cannot narrow
  // `KeyPath<T>` for an unresolved `T` — so widen once here rather than at each
  // call site.
  const { field, advertise } = args as unknown as BuildMessageDefinitionArgs<MeterBaseDeviceData>;

  advertise(
    ['timestamp'],
    sensorComponent<string>({
      id: 'timestamp',
      name: 'Last Update',
      device_class: 'timestamp',
      icon: 'mdi:clock',
    }),
  );

  // Power measurements - use declarative number() transform (explicit, same as default)
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

  registerPhaseMeasurementDirection(args, options);

  // Number of slave meters attached. Each one is queried individually with
  // `cd=4,p1=<index>` whenever this is greater than zero.
  field({ key: 'slv_n', path: ['slaveCount'], transform: number() });
  advertise(
    ['slaveCount'],
    sensorComponent<number>({
      id: 'slave_count',
      name: 'Slave Count',
      icon: 'mdi:counter',
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

  // String field - use identity() declarative transform instead of inline function
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
}
