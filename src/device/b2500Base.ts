import {
  AdditionalDeviceInfo,
  BuildMessageDefinitionArgs,
  BuildMessageFn,
} from '../deviceDefinition.js';
import logger from '../logger.js';
import { extractB2500Sample } from '../cellBalancing.js';
import { registerCellBalancingMessage } from './cellBalancingMessage.js';
import {
  B2500BaseDeviceData,
  B2500CalibrationData,
  B2500CellData,
  CommandParams,
} from '../types.js';
import {
  binarySensorComponent,
  buttonComponent,
  numberComponent,
  sensorComponent,
  switchComponent,
} from '../homeAssistantDiscovery.js';
import {
  number,
  boolean,
  bitBoolean,
  identity,
  map,
  sum,
  min,
  max,
  diff,
  average,
  divide,
  inRange,
  chain,
} from '../transforms.js';

export function extractAdditionalDeviceInfo(state: B2500BaseDeviceData): AdditionalDeviceInfo {
  let firmwareVersion: string | undefined;
  if (state.deviceInfo?.deviceVersion) {
    firmwareVersion = `${state.deviceInfo.deviceVersion}${state.deviceInfo.deviceSubversion ? `.${state.deviceInfo.deviceSubversion}` : ''}`;
  }
  return {
    firmwareVersion,
  };
}

export function isB2500RuntimeInfoMessage(values: Record<string, string>) {
  const requiredRuntimeInfoKeys = [
    'pe',
    'kn',
    'do',
    'p1',
    'p2',
    'w1',
    'w2',
    'vv',
    'o1',
    'o2',
    'g1',
    'g2',
  ];
  return requiredRuntimeInfoKeys.every(key => key in values);
}

export function registerBaseMessage({
  field,
  command,
  advertise,
}: BuildMessageDefinitionArgs<B2500BaseDeviceData>) {
  advertise(
    ['timestamp'],
    sensorComponent<string>({
      id: 'timestamp',
      name: 'Last Update',
      device_class: 'timestamp',
      icon: 'mdi:clock',
    }),
  );

  // Battery information
  // State of charge is a percentage, so anything outside 0-100 is a corrupt
  // reading. Drop it so the sensor goes unknown for that poll instead of
  // writing an implausible spike into the long-term statistics.
  field({
    key: 'pe',
    path: ['batteryPercentage'],
    transform: inRange(0, 100),
  });
  advertise(
    ['batteryPercentage'],
    sensorComponent<number>({
      id: 'battery_percentage',
      name: 'Battery Percentage',
      device_class: 'battery',
      unit_of_measurement: '%',
      state_class: 'measurement',
    }),
  );
  field({
    key: 'kn',
    path: ['batteryCapacity'],
    transform: number(),
  });
  advertise(
    ['batteryCapacity'],
    sensorComponent<number>({
      id: 'battery_capacity',
      name: 'Battery Capacity',
      device_class: 'energy_storage',
      unit_of_measurement: 'Wh',
      state_class: 'measurement',
    }),
  );
  // Per-pack status bitmasks (firmware >= 212.17; absent on older firmware, in
  // which case these fields simply stay unset).
  //
  // `l0` carries the host pack, `l1` both extras packed into one byte: bits 0-3
  // are extra2 and bits 4-7 extra1, each using the same layout as `l0`.
  // See docs/b2500.md.
  const packStatusFlags = [
    { flag: 'discharging', bit: 0 },
    { flag: 'charging', bit: 1 },
    { flag: 'dodReached', bit: 2 },
    { flag: 'undervoltage', bit: 3 },
  ] as const;
  const packStatusSources = [
    { key: 'l0', battery: 'host', bitOffset: 0 },
    { key: 'l1', battery: 'extra2', bitOffset: 0 },
    { key: 'l1', battery: 'extra1', bitOffset: 4 },
  ] as const;
  for (const { key, battery, bitOffset } of packStatusSources) {
    for (const { flag, bit } of packStatusFlags) {
      field({
        key,
        path: ['packStatus', battery, flag],
        transform: bitBoolean(bitOffset + bit),
      });
    }
  }

  field({
    key: 'do',
    path: ['dischargeDepth'],
    transform: number(),
  });
  advertise(
    ['dischargeDepth'],
    numberComponent({
      id: 'discharge_depth',
      name: 'Discharge Depth',
      unit_of_measurement: '%',
      command: 'discharge-depth',
      min: 0,
      max: 100,
      step: 1,
      icon: 'mdi:battery-arrow-down',
    }),
  );

  // Solar input information
  field({
    key: 'p1',
    path: ['solarInputStatus', 'input1Charging'],
    transform: bitBoolean(0),
  });
  advertise(
    ['solarInputStatus', 'input1Charging'],
    binarySensorComponent({
      id: 'input1_charging',
      name: 'Input 1 Charging',
      device_class: 'power',
    }),
  );
  field({
    key: 'p1',
    path: ['solarInputStatus', 'input1PassThrough'],
    transform: bitBoolean(1),
  });
  advertise(
    ['solarInputStatus', 'input1PassThrough'],
    binarySensorComponent({
      id: 'input1_pass_through',
      name: 'Input 1 Pass Through',
      device_class: 'power',
    }),
  );
  field({
    key: 'p2',
    path: ['solarInputStatus', 'input2Charging'],
    transform: bitBoolean(0),
  });
  advertise(
    ['solarInputStatus', 'input2Charging'],
    binarySensorComponent({
      id: 'input2_charging',
      name: 'Input 2 Charging',
      device_class: 'power',
    }),
  );
  field({
    key: 'p2',
    path: ['solarInputStatus', 'input2PassThrough'],
    transform: bitBoolean(1),
  });
  advertise(
    ['solarInputStatus', 'input2PassThrough'],
    binarySensorComponent({
      id: 'input2_pass_through',
      name: 'Input 2 Pass Through',
      device_class: 'power',
    }),
  );
  field({
    key: 'w1',
    path: ['solarPower', 'input1'],
    transform: number(),
  });
  advertise(
    ['solarPower', 'input1'],
    sensorComponent<number>({
      id: 'input1_power',
      name: 'Input 1 Power',
      device_class: 'power',
      unit_of_measurement: 'W',
      state_class: 'measurement',
    }),
  );
  field({
    key: 'w2',
    path: ['solarPower', 'input2'],
    transform: number(),
  });
  advertise(
    ['solarPower', 'input2'],
    sensorComponent<number>({
      id: 'input2_power',
      name: 'Input 2 Power',
      device_class: 'power',
      unit_of_measurement: 'W',
      state_class: 'measurement',
    }),
  );
  field({
    key: ['w1', 'w2'],
    path: ['solarPower', 'total'],
    transform: sum(),
  });
  advertise(
    ['solarPower', 'total'],
    sensorComponent<number>({
      id: 'solar_total_power',
      name: 'Total Input Power',
      device_class: 'power',
      unit_of_measurement: 'W',
      state_class: 'measurement',
    }),
  );

  // Device information
  field({ key: 'vv', path: ['deviceInfo', 'deviceVersion'] as const, transform: number() });
  field({ key: 'sv', path: ['deviceInfo', 'deviceSubversion'], transform: number() });
  field({ key: 'fc', path: ['deviceInfo', 'fc42dVersion'], transform: identity() });
  field({ key: 'id', path: ['deviceInfo', 'deviceIdNumber'], transform: number() });
  field({ key: 'uv', path: ['deviceInfo', 'bootloaderVersion'], transform: number() });

  // Wi-Fi RSSI, already signed and already in dBm (e.g. `ws=-79`) — unlike the
  // Venus/Jupiter `wif_s`, which is an unsigned magnitude. Two values mean "no
  // reading": 0 before the Wi-Fi module reports any state, and 32767 while the
  // association is down. Both are filtered out so the sensor goes unknown
  // instead of reporting an implausible signal level.
  field({ key: 'ws', path: ['wifiSignalStrength'], transform: inRange(-120, -1) });
  advertise(
    ['wifiSignalStrength'],
    sensorComponent<number>({
      id: 'wifi_signal_strength',
      name: 'WiFi Signal Strength',
      device_class: 'signal_strength',
      unit_of_measurement: 'dBm',
      state_class: 'measurement',
    }),
  );

  // Output state information
  for (const outputNumber of [1, 2] as const) {
    field({
      key: `o${outputNumber}`,
      path: ['outputState', `output${outputNumber}` as const],
      transform: boolean(),
    });
    advertise(
      ['outputState', `output${outputNumber}` as const],
      binarySensorComponent({
        id: `output${outputNumber}_active_state`,
        name: `Output ${outputNumber} Active`,
        device_class: 'power',
      }),
    );
    field({
      key: `g${outputNumber}`,
      path: ['outputPower', `output${outputNumber}` as const],
      transform: number(),
    });
    advertise(
      ['outputPower', `output${outputNumber}` as const],
      sensorComponent<number>({
        id: `output${outputNumber}_power`,
        name: `Output ${outputNumber} Power`,
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
  }

  field({
    key: ['g1', 'g2'],
    path: ['outputPower', 'total'],
    transform: sum(),
  });
  advertise(
    ['outputPower', 'total'],
    sensorComponent<number>({
      id: 'output_total_power',
      name: 'Total Output Power',
      device_class: 'power',
      unit_of_measurement: 'W',
      state_class: 'measurement',
    }),
  );

  // Temperature information
  field({
    key: 'tl',
    path: ['temperature', 'min'],
    transform: number(),
  });
  advertise(
    ['temperature', 'min'],
    sensorComponent<number>({
      id: 'temperature_min',
      name: 'Temperature Min',
      device_class: 'temperature',
      unit_of_measurement: '°C',
      state_class: 'measurement',
    }),
  );
  field({
    key: 'th',
    path: ['temperature', 'max'],
    transform: number(),
  });
  advertise(
    ['temperature', 'max'],
    sensorComponent<number>({
      id: 'temperature_max',
      name: 'Temperature Max',
      device_class: 'temperature',
      unit_of_measurement: '°C',
      state_class: 'measurement',
    }),
  );
  field({
    key: 'tc',
    path: ['temperature', 'chargingAlarm'],
    transform: boolean(),
  });
  advertise(
    ['temperature', 'chargingAlarm'],
    binarySensorComponent({
      id: 'temperature_charging_alarm',
      name: 'Temperature Charging Alarm',
      device_class: 'problem',
    }),
  );
  field({
    key: 'tf',
    path: ['temperature', 'dischargeAlarm'],
    transform: boolean(),
  });
  advertise(
    ['temperature', 'dischargeAlarm'],
    binarySensorComponent({
      id: 'temperature_discharge_alarm',
      name: 'Temperature Discharge Alarm',
      device_class: 'problem',
    }),
  );

  // Battery packs information
  field({
    key: 'b1',
    path: ['batteryPacks', 'pack1Connected'],
    transform: boolean(),
  });
  advertise(
    ['batteryPacks', 'pack1Connected'],
    binarySensorComponent({
      id: 'battery_pack1_connected',
      name: 'Battery Pack 1 Connected',
    }),
  );
  field({
    key: 'b2',
    path: ['batteryPacks', 'pack2Connected'],
    transform: boolean(),
  });
  advertise(
    ['batteryPacks', 'pack2Connected'],
    binarySensorComponent({
      id: 'battery_pack2_connected',
      name: 'Battery Pack 2 Connected',
    }),
  );

  // Scene information (day/night/dusk)
  field({
    key: 'cj',
    path: ['scene'],
    transform: map({ '0': 'day', '1': 'night', '2': 'dusk' }),
  });
  advertise(
    ['scene'],
    sensorComponent({
      id: 'scene',
      name: 'Scene',
      valueMappings: {
        day: 'Day',
        night: 'Night',
        dusk: 'Dusk/Dawn',
      },
    }),
  );

  // Battery status flags
  field({
    key: 'l0',
    path: ['batteryStatus', 'host', 'discharging'],
    transform: bitBoolean(0),
  });
  advertise(
    ['batteryStatus', 'host', 'discharging'],
    binarySensorComponent({
      id: 'host_battery_discharging',
      name: 'Host Battery Discharging',
      device_class: 'power',
    }),
  );
  field({
    key: 'l0',
    path: ['batteryStatus', 'host', 'charging'],
    transform: bitBoolean(1),
  });
  advertise(
    ['batteryStatus', 'host', 'charging'],
    binarySensorComponent({
      id: 'host_battery_charging',
      name: 'Host Battery Charging',
      device_class: 'battery_charging',
    }),
  );
  field({
    key: 'l0',
    path: ['batteryStatus', 'host', 'depthOfDischarge'],
    transform: bitBoolean(2),
  });
  advertise(
    ['batteryStatus', 'host', 'depthOfDischarge'],
    binarySensorComponent({
      id: 'host_battery_depth_of_discharge',
      name: 'Host Battery Depth of Discharge',
      device_class: 'problem',
    }),
  );
  field({
    key: 'l0',
    path: ['batteryStatus', 'host', 'undervoltage'],
    transform: bitBoolean(3),
  });
  advertise(
    ['batteryStatus', 'host', 'undervoltage'],
    binarySensorComponent({
      id: 'host_battery_undervoltage',
      name: 'Host Battery Undervoltage',
      device_class: 'problem',
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra2', 'discharging'],
    transform: bitBoolean(0),
  });
  advertise(
    ['batteryStatus', 'extra2', 'discharging'],
    binarySensorComponent({
      id: 'extra2_battery_discharging',
      name: 'Extra 2 Battery Discharging',
      device_class: 'power',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra2', 'charging'],
    transform: bitBoolean(1),
  });
  advertise(
    ['batteryStatus', 'extra2', 'charging'],
    binarySensorComponent({
      id: 'extra2_battery_charging',
      name: 'Extra 2 Battery Charging',
      device_class: 'battery_charging',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra2', 'depthOfDischarge'],
    transform: bitBoolean(2),
  });
  advertise(
    ['batteryStatus', 'extra2', 'depthOfDischarge'],
    binarySensorComponent({
      id: 'extra2_battery_depth_of_discharge',
      name: 'Extra 2 Battery Depth of Discharge',
      device_class: 'problem',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra2', 'undervoltage'],
    transform: bitBoolean(3),
  });
  advertise(
    ['batteryStatus', 'extra2', 'undervoltage'],
    binarySensorComponent({
      id: 'extra2_battery_undervoltage',
      name: 'Extra 2 Battery Undervoltage',
      device_class: 'problem',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra1', 'discharging'],
    transform: bitBoolean(4),
  });
  advertise(
    ['batteryStatus', 'extra1', 'discharging'],
    binarySensorComponent({
      id: 'extra1_battery_discharging',
      name: 'Extra 1 Battery Discharging',
      device_class: 'power',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra1', 'charging'],
    transform: bitBoolean(5),
  });
  advertise(
    ['batteryStatus', 'extra1', 'charging'],
    binarySensorComponent({
      id: 'extra1_battery_charging',
      name: 'Extra 1 Battery Charging',
      device_class: 'battery_charging',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra1', 'depthOfDischarge'],
    transform: bitBoolean(6),
  });
  advertise(
    ['batteryStatus', 'extra1', 'depthOfDischarge'],
    binarySensorComponent({
      id: 'extra1_battery_depth_of_discharge',
      name: 'Extra 1 Battery Depth of Discharge',
      device_class: 'problem',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'l1',
    path: ['batteryStatus', 'extra1', 'undervoltage'],
    transform: bitBoolean(7),
  });
  advertise(
    ['batteryStatus', 'extra1', 'undervoltage'],
    binarySensorComponent({
      id: 'extra1_battery_undervoltage',
      name: 'Extra 1 Battery Undervoltage',
      device_class: 'problem',
      enabled_by_default: false,
    }),
  );

  // Battery capacity values
  // The host and the attached extra batteries report their state of charge as
  // a percentage. The firmware occasionally emits garbage here (values such as
  // 2425 or 56577, see issue #97), so readings outside 0-100 are dropped and
  // the sensor goes unknown for that poll rather than polluting the statistics.
  field({
    key: 'a0',
    path: ['batteryCapacities', 'host'],
    transform: inRange(0, 100),
  });
  advertise(
    ['batteryCapacities', 'host'],
    sensorComponent<number>({
      id: 'host_battery_capacity',
      name: 'Host Battery SoC',
      device_class: 'battery',
      unit_of_measurement: '%',
      state_class: 'measurement',
    }),
  );
  field({
    key: 'a1',
    path: ['batteryCapacities', 'extra1'],
    transform: inRange(0, 100),
  });
  advertise(
    ['batteryCapacities', 'extra1'],
    sensorComponent<number>({
      id: 'extra1_battery_capacity',
      name: 'Extra 1 Battery SoC',
      device_class: 'battery',
      unit_of_measurement: '%',
      state_class: 'measurement',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'a2',
    path: ['batteryCapacities', 'extra2'],
    transform: inRange(0, 100),
  });
  advertise(
    ['batteryCapacities', 'extra2'],
    sensorComponent<number>({
      id: 'extra2_battery_capacity',
      name: 'Extra 2 Battery SoC',
      device_class: 'battery',
      unit_of_measurement: '%',
      state_class: 'measurement',
      enabled_by_default: false,
    }),
  );

  command('discharge-depth', {
    handler: ({ message, publishCallback, deviceState }) => {
      const depth = parseInt(message, 10);
      if (isNaN(depth) || depth < 0 || depth > 100) {
        logger.warn('Invalid discharge depth value:', message);
        return;
      }

      publishCallback(
        processCommand(CommandType.DISCHARGE_DEPTH, { md: depth }, deviceState.useFlashCommands),
      );
    },
  });

  command('restart', {
    handler: ({ message, publishCallback, deviceState }) => {
      if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
        publishCallback(
          processCommand(CommandType.SOFTWARE_RESTART, {}, deviceState.useFlashCommands),
        );
      }
    },
  });
  advertise(
    [],
    buttonComponent({
      id: 'restart',
      name: 'Restart',
      icon: 'mdi:restart',
      command: 'restart',
      payload_press: 'PRESS',
      enabled_by_default: false,
    }),
  );

  command('refresh', {
    handler: ({ message, publishCallback, deviceState }) => {
      if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
        publishCallback(
          processCommand(CommandType.READ_DEVICE_INFO, {}, deviceState.useFlashCommands),
        );
      }
    },
  });
  advertise(
    [],
    buttonComponent({
      id: 'refresh',
      name: 'Refresh',
      icon: 'mdi:refresh',
      command: 'refresh',
      payload_press: 'PRESS',
      enabled_by_default: false,
    }),
  );

  command('factory-reset', {
    handler: ({ message, publishCallback, deviceState }) => {
      if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
        publishCallback(
          processCommand(CommandType.FACTORY_RESET, {}, deviceState.useFlashCommands),
        );
      }
    },
  });
  advertise(
    [],
    buttonComponent({
      id: 'factory_reset',
      name: 'Factory Reset',
      icon: 'mdi:delete-forever',
      command: 'factory-reset',
      payload_press: 'PRESS',
      enabled_by_default: false,
    }),
  );
  command('use-flash-commands', {
    handler: ({ device, updateDeviceState, message }) => {
      const useFlash = message.toLowerCase() === 'true' || message === '1';
      const { useFlashCommands } = updateDeviceState(() => ({ useFlashCommands: useFlash }));
      logger.info(
        `Flash commands ${useFlashCommands ? 'enabled' : 'disabled'} for ${device.deviceId}`,
      );
    },
  });
  advertise(
    ['useFlashCommands'],
    switchComponent({
      id: 'use_flash_commands',
      name: 'Use Flash Commands',
      icon: 'mdi:flash',
      command: 'use-flash-commands',
      enabled_by_default: false,
      // Publish the toggle as a retained command so the setting survives a
      // restart of hm2mqtt: on reconnect the broker re-delivers the retained
      // command and the flash-commands state is re-applied automatically.
      retain: true,
    }),
  );
}

// The device reports 16 cell slots per pack (`a0`-`af`). Detection only
// requires the first 14 so that firmware reporting fewer still matches; the
// aggregates below are partial-friendly for the same reason.
//
// Packs with fewer than 16 physical cells report the unused slots as `0`, so
// both the individual cell sensors and the aggregates have to drop zeroes.
// Otherwise an empty slot is read as a 0 V cell: the minimum collapses to 0,
// the difference becomes the full cell voltage and the average is pulled down
// by the missing cells (see #384).
const CELL_COUNT = 16;
const CELL_DETECT_COUNT = 14;

function isB2500CellDataMessage(values: Record<string, string>) {
  return Array.from({ length: CELL_DETECT_COUNT }, (_, i) => `a${i.toString(16)}`).every(
    key => key in values,
  );
}

/**
 * Cell balancing diagnostics for B2500. Registered next to the cell data
 * message it consumes; it produces no traffic of its own.
 *
 * `hasPackCurrent` is false on V1, which has no message carrying a pack
 * current at all.
 */
export function registerB2500CellBalancingMessage(
  message: BuildMessageFn,
  { hasPackCurrent }: { hasPackCurrent: boolean },
) {
  registerCellBalancingMessage(message, {
    cellPath: 'cells',
    extract: extractB2500Sample,
    warnIfIncomplete: (deviceType, deviceId) =>
      warnAboutB2500PackCurrent(hasPackCurrent, `${deviceType} ${deviceId}`),
  });
}

/**
 * The rested spread is measured an hour after charging stops, and "stopped"
 * has to be confirmed by a current near zero — otherwise the pack could be
 * quietly discharging into the house. B2500 only reports one in the cd=16
 * payload, so without that poll the rested spread never latches and no charge
 * cycle is ever recorded. Everything else still works, which is exactly why
 * this is worth saying out loud.
 */
function warnAboutB2500PackCurrent(hasPackCurrent: boolean, device: string) {
  if (hasPackCurrent && process.env.POLL_EXTRA_BATTERY_DATA === 'true') {
    return;
  }
  logger.warn(
    hasPackCurrent
      ? `Cell balancing diagnostics on ${device} also need POLL_EXTRA_BATTERY_DATA=true ` +
          '(add-on: "Enable Extra Battery Data") for the pack current. Without it the ' +
          'rested cell spread never latches and no charge cycle is recorded; the live ' +
          'metrics are unaffected.'
      : `${device} does not report a pack current, so the cell balancing diagnostics ` +
          'cannot latch a rested cell spread or record charge cycles on it. The live ' +
          'metrics work as normal.',
  );
}

export function registerCellDataMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=13',
    isMessage: isB2500CellDataMessage,
    defaultState: {},
    getAdditionalDeviceInfo: () => ({}),
    publishPath: 'cells',
    pollInterval: 60000,
    controlsDeviceAvailability: false,
    enabled: process.env.POLL_CELL_DATA === 'true',
  } as const;
  message<B2500CellData>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp_cell_data',
        name: 'Cell Data Last Updated',
        device_class: 'timestamp',
        icon: 'mdi:clock',
        enabled_by_default: false,
      }),
    );
    for (const [key, battery] of Object.entries({
      a: 'host',
      b: 'extra1',
      c: 'extra2',
    } as const)) {
      const allKeys = Array.from(
        { length: CELL_COUNT },
        (_, i) => `${key}${i.toString(16)}` as const,
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'min'],
        transform: min(1000, true),
        allowPartial: true,
      });
      advertise(
        ['cellVoltage', battery, 'min'],
        sensorComponent<number>({
          id: `min_cell_voltage_${battery}`,
          name: `Min Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'max'],
        transform: max(1000, true),
        allowPartial: true,
      });
      advertise(
        ['cellVoltage', battery, 'max'],
        sensorComponent<number>({
          id: `max_cell_voltage_${battery}`,
          name: `Max Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'diff'],
        transform: diff(1000, true),
        allowPartial: true,
      });
      advertise(
        ['cellVoltage', battery, 'diff'],
        sensorComponent<number>({
          id: `diff_cell_voltage_${battery}`,
          name: `Cell Voltage Difference ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'avg'],
        transform: average(1000, true, true),
        allowPartial: true,
      });
      advertise(
        ['cellVoltage', battery, 'avg'],
        sensorComponent<number>({
          id: `avg_cell_voltage_${battery}`,
          name: `Average Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
          enabled_by_default: battery === 'host',
        }),
      );

      for (let i = 0; i < CELL_COUNT; i++) {
        field({
          key: `${key}${i.toString(16)}`,
          path: ['cellVoltage', battery, 'cells', i],
          // Unused slots read exactly 0; publish them as unknown rather than as
          // a 0 V cell. The upper bound is only there because `inRange` needs
          // one — no real cell comes anywhere near it.
          transform: chain(divide(1000), inRange(0.001, 100)),
        });
        advertise(
          ['cellVoltage', battery, 'cells', i],
          sensorComponent({
            id: `cell_voltage_${battery}_${i}`,
            name: `Cell Voltage ${battery} ${(i + 1).toString().padStart(2, '0')}`,
            device_class: 'voltage',
            unit_of_measurement: 'V',
            state_class: 'measurement',
            enabled_by_default: battery === 'host',
          }),
        );
      }
    }
  });
}

function isB2500CalibrationDataMessage(values: Record<string, string>) {
  const keys = Object.keys(values);
  return keys.length === 2 && keys.includes('cf') && keys.includes('df');
}

export function registerCalibrationDataMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=21',
    isMessage: isB2500CalibrationDataMessage,
    defaultState: {},
    getAdditionalDeviceInfo: () => ({}),
    publishPath: 'calibration',
    pollInterval: 60000,
    controlsDeviceAvailability: false,
    enabled: process.env.POLL_CALIBRATION_DATA === 'true',
  } as const;
  message<B2500CalibrationData>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp_calibration_data',
        name: 'Calibration Data Last Updated',
        device_class: 'timestamp',
        icon: 'mdi:clock',
        enabled_by_default: false,
      }),
    );
    field({
      key: 'cf',
      path: ['charge'],
      transform: divide(1000),
    });
    advertise(
      ['charge'],
      sensorComponent<number>({
        id: 'calibration_charge',
        name: 'Calibration Charge',
        unit_of_measurement: 'mAh',
      }),
    );
    field({
      key: 'df',
      path: ['discharge'],
      transform: divide(1000),
    });
    advertise(
      ['discharge'],
      sensorComponent<number>({
        id: 'calibration_discharge',
        name: 'Calibration Discharge',
        unit_of_measurement: 'mAh',
      }),
    );
  });
}

/**
 * Command types supported by the device
 */
export enum CommandType {
  READ_DEVICE_INFO = 1,
  CHARGING_MODE = 3,
  DISCHARGE_MODE = 4,
  DISCHARGE_DEPTH = 5,
  BATTERY_OUTPUT_THRESHOLD = 6,
  TIMED_DISCHARGE = 7,
  SYNC_TIME = 8,
  TIME_ZONE = 9,
  SOFTWARE_RESTART = 10,
  FACTORY_RESET = 11,
  SET_CONNECTED_PHASE = 22,
  SET_SMART_METER_TYPE = 27,
  SURPLUS_FEED_IN = 31,
}

/**
 * Map command types to their corresponding CD values
 * For commands that have both flash and non-flash versions
 */
const noFlashCommands: Record<CommandType, number> = {
  [CommandType.READ_DEVICE_INFO]: CommandType.READ_DEVICE_INFO,
  [CommandType.CHARGING_MODE]: 17,
  [CommandType.DISCHARGE_MODE]: 18,
  [CommandType.DISCHARGE_DEPTH]: 19,
  [CommandType.BATTERY_OUTPUT_THRESHOLD]: CommandType.BATTERY_OUTPUT_THRESHOLD,
  [CommandType.TIMED_DISCHARGE]: 20,
  [CommandType.SET_CONNECTED_PHASE]: CommandType.SET_CONNECTED_PHASE,
  [CommandType.SET_SMART_METER_TYPE]: CommandType.SET_SMART_METER_TYPE,
  [CommandType.SYNC_TIME]: CommandType.SYNC_TIME,
  [CommandType.TIME_ZONE]: CommandType.TIME_ZONE,
  [CommandType.SOFTWARE_RESTART]: CommandType.SOFTWARE_RESTART,
  [CommandType.FACTORY_RESET]: CommandType.FACTORY_RESET,
  [CommandType.SURPLUS_FEED_IN]: 31,
};

export function processCommand(
  command: CommandType,
  params: CommandParams,
  useFlashCommand?: boolean,
): string {
  const cd = getCommandCdValue(command, useFlashCommand ?? false);
  let entries = Object.entries(params);
  return `cd=${cd}${entries.length > 0 ? ',' : ''}${entries.map(([key, value]) => `${key}=${value}`).join(',')}`;
}

/**
 * Get command CD value based on command type and flash mode
 *
 * @param commandType - The command type
 * @param useFlash - Whether to use flash command
 * @returns The CD value for the command
 */
function getCommandCdValue(commandType: CommandType, useFlash: boolean): number {
  if (useFlash) {
    return commandType;
  }
  const noFlashCommand = noFlashCommands[commandType];
  if (noFlashCommand == null) {
    return commandType;
  }
  return noFlashCommand;
}
