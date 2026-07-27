import { BuildMessageDefinitionArgs } from '../deviceDefinition.js';
import { MeterBaseDeviceData } from '../types.js';
import { binarySensorComponent, sensorComponent } from '../homeAssistantDiscovery.js';
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
 * Register the fields and Home Assistant components every Marstek meter
 * reports. Device specific fields are registered by the caller.
 */
export function registerMeterBaseFields<T extends MeterBaseDeviceData>(
  args: BuildMessageDefinitionArgs<T>,
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

  // `cur_d` is a bitmask with one bit per phase, set when that phase's
  // measurement direction is reversed. (The CT002 also accepts the key under
  // the alias `cur_dir`.)
  field({ key: 'cur_d', path: ['phase1MeasurementReversed'], transform: bitBoolean(0) });
  advertise(
    ['phase1MeasurementReversed'],
    binarySensorComponent({
      id: 'phase1_measurement_reversed',
      name: 'Phase 1 Measurement Reversed',
      enabled_by_default: false,
    }),
  );

  field({ key: 'cur_d', path: ['phase2MeasurementReversed'], transform: bitBoolean(1) });
  advertise(
    ['phase2MeasurementReversed'],
    binarySensorComponent({
      id: 'phase2_measurement_reversed',
      name: 'Phase 2 Measurement Reversed',
      enabled_by_default: false,
    }),
  );

  field({ key: 'cur_d', path: ['phase3MeasurementReversed'], transform: bitBoolean(2) });
  advertise(
    ['phase3MeasurementReversed'],
    binarySensorComponent({
      id: 'phase3_measurement_reversed',
      name: 'Phase 3 Measurement Reversed',
      enabled_by_default: false,
    }),
  );

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
