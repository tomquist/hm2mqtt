import {
  AdditionalDeviceInfo,
  BuildMessageDefinitionArgs,
  BuildMessageFn,
} from '../deviceDefinition';
import { B2500BaseDeviceData, B2500CalibrationData, B2500CellData, CommandParams } from '../types';
import {
  binarySensorComponent,
  buttonComponent,
  numberComponent,
  sensorComponent,
  switchComponent,
} from '../homeAssistantDiscovery';
import { transformBitBoolean, transformBoolean, transformNumber } from './helpers';

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
  field({
    key: 'pe',
    path: ['batteryPercentage'],
  });
  advertise(
    ['batteryPercentage'],
    sensorComponent<number>({
      id: 'battery_percentage',
      name: 'Battery Percentage',
      device_class: 'battery',
      unit_of_measurement: '%',
    }),
  );
  field({
    key: 'kn',
    path: ['batteryCapacity'],
  });
  advertise(
    ['batteryCapacity'],
    sensorComponent<number>({
      id: 'battery_capacity',
      name: 'Battery Capacity',
      device_class: 'energy_storage',
      unit_of_measurement: 'Wh',
    }),
  );
  field({
    key: 'do',
    path: ['dischargeDepth'],
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
    transform: transformBitBoolean(0),
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
    transform: transformBitBoolean(1),
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
    transform: transformBitBoolean(0),
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
    transform: transformBitBoolean(1),
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
  });
  advertise(
    ['solarPower', 'input1'],
    sensorComponent<number>({
      id: 'input1_power',
      name: 'Input 1 Power',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );
  field({
    key: 'w2',
    path: ['solarPower', 'input2'],
  });
  advertise(
    ['solarPower', 'input2'],
    sensorComponent<number>({
      id: 'input2_power',
      name: 'Input 2 Power',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );
  field({
    key: ['w1', 'w2'],
    path: ['solarPower', 'total'],
    transform({ w1, w2 }) {
      return transformNumber(w1) + transformNumber(w2);
    },
  });
  advertise(
    ['solarPower', 'total'],
    sensorComponent<number>({
      id: 'solar_total_power',
      name: 'Total Input Power',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );

  // Device information
  field({ key: 'vv', path: ['deviceInfo', 'deviceVersion'] as const });
  field({ key: 'sv', path: ['deviceInfo', 'deviceSubversion'] });
  field({ key: 'fc', path: ['deviceInfo', 'fc42dVersion'], transform: v => v });
  field({ key: 'id', path: ['deviceInfo', 'deviceIdNumber'] });
  field({ key: 'uv', path: ['deviceInfo', 'bootloaderVersion'] });

  // Output state information
  for (const outputNumber of [1, 2] as const) {
    field({
      key: `o${outputNumber}`,
      path: ['outputState', `output${outputNumber}` as const],
      transform: transformBoolean,
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
    });
    advertise(
      ['outputPower', `output${outputNumber}` as const],
      sensorComponent<number>({
        id: `output${outputNumber}_power`,
        name: `Output ${outputNumber} Power`,
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
  }

  field({
    key: ['g1', 'g2'],
    path: ['outputPower', 'total'],
    transform({ g1, g2 }) {
      return transformNumber(g1) + transformNumber(g2);
    },
  });
  advertise(
    ['outputPower', 'total'],
    sensorComponent<number>({
      id: 'output_total_power',
      name: 'Total Output Power',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );

  // Temperature information
  field({
    key: 'tl',
    path: ['temperature', 'min'],
  });
  advertise(
    ['temperature', 'min'],
    sensorComponent<number>({
      id: 'temperature_min',
      name: 'Temperature Min',
      device_class: 'temperature',
      unit_of_measurement: '°C',
    }),
  );
  field({
    key: 'th',
    path: ['temperature', 'max'],
  });
  advertise(
    ['temperature', 'max'],
    sensorComponent<number>({
      id: 'temperature_max',
      name: 'Temperature Max',
      device_class: 'temperature',
      unit_of_measurement: '°C',
    }),
  );
  field({
    key: 'tc',
    path: ['temperature', 'chargingAlarm'],
    transform: transformBoolean,
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
    transform: transformBoolean,
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
    transform: transformBoolean,
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
    transform: transformBoolean,
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
    transform: v => {
      // Transform numeric scene value to descriptive string
      switch (v) {
        case '0':
          return 'day';
        case '1':
          return 'night';
        case '2':
          return 'dusk';
      }
    },
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
    transform: transformBitBoolean(0),
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
    transform: transformBitBoolean(1),
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
    transform: transformBitBoolean(2),
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
    transform: transformBitBoolean(3),
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
    transform: transformBitBoolean(0),
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
    transform: transformBitBoolean(1),
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
    transform: transformBitBoolean(2),
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
    transform: transformBitBoolean(3),
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
    transform: transformBitBoolean(4),
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
    transform: transformBitBoolean(5),
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
    transform: transformBitBoolean(6),
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
    transform: transformBitBoolean(7),
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
  field({
    key: 'a0',
    path: ['batteryCapacities', 'host'],
  });
  advertise(
    ['batteryCapacities', 'host'],
    sensorComponent<number>({
      id: 'host_battery_capacity',
      name: 'Host Battery SoC',
      device_class: 'battery',
      unit_of_measurement: '%',
    }),
  );
  field({
    key: 'a1',
    path: ['batteryCapacities', 'extra1'],
  });
  advertise(
    ['batteryCapacities', 'extra1'],
    sensorComponent<number>({
      id: 'extra1_battery_capacity',
      name: 'Extra 1 Battery SoC',
      device_class: 'battery',
      unit_of_measurement: '%',
      enabled_by_default: false,
    }),
  );
  field({
    key: 'a2',
    path: ['batteryCapacities', 'extra2'],
  });
  advertise(
    ['batteryCapacities', 'extra2'],
    sensorComponent<number>({
      id: 'extra2_battery_capacity',
      name: 'Extra 2 Battery Capacity',
      device_class: 'energy_storage',
      unit_of_measurement: 'Wh',
      enabled_by_default: false,
    }),
  );

  command('discharge-depth', {
    handler: ({ message, publishCallback, deviceState }) => {
      const depth = parseInt(message, 10);
      if (isNaN(depth) || depth < 0 || depth > 100) {
        console.error('Invalid discharge depth value:', message);
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
      console.log(
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
    }),
  );
}

function isB2500CellDataMessage(values: Record<string, string>) {
  return Array.from({ length: 14 }, (_, i) => `a${i.toString(16)}`).every(key => key in values);
}

export function registerCellDataMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=13',
    isMessage: isB2500CellDataMessage,
    defaultState: {},
    getAdditionalDeviceInfo: () => ({}),
    publishPath: 'cells',
    pollInterval: 60000,
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
      const allKeys = Array.from({ length: 14 }, (_, i) => `${key}${i.toString(16)}` as const);
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'min'],
        transform: voltages => Math.min(...Object.values(voltages).map(v => parseFloat(v))) / 1000,
      });
      advertise(
        ['cellVoltage', battery, 'min'],
        sensorComponent<number>({
          id: `min_cell_voltage_${battery}`,
          name: `Min Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'max'],
        transform: voltages => Math.max(...Object.values(voltages).map(v => parseFloat(v))) / 1000,
      });
      advertise(
        ['cellVoltage', battery, 'max'],
        sensorComponent<number>({
          id: `max_cell_voltage_${battery}`,
          name: `Max Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'diff'],
        transform: voltages => {
          const values = Object.values(voltages).map(v => parseFloat(v));
          return (Math.max(...values) - Math.min(...values)) / 1000;
        },
      });
      advertise(
        ['cellVoltage', battery, 'diff'],
        sensorComponent<number>({
          id: `diff_cell_voltage_${battery}`,
          name: `Cell Voltage Difference ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          enabled_by_default: battery === 'host',
        }),
      );
      field({
        key: allKeys,
        path: ['cellVoltage', battery, 'avg'],
        transform: voltages => {
          const values = Object.values(voltages).map(v => parseFloat(v));
          return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) / 1000;
        },
      });
      advertise(
        ['cellVoltage', battery, 'avg'],
        sensorComponent<number>({
          id: `avg_cell_voltage_${battery}`,
          name: `Average Cell Voltage ${battery}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          enabled_by_default: battery === 'host',
        }),
      );

      for (let i = 0; i < 14; i++) {
        field({
          key: `${key}${i.toString(16)}`,
          path: ['cellVoltage', battery, 'cells', i],
          transform: v => parseFloat(v) / 1000,
        });
        advertise(
          ['cellVoltage', battery, 'cells', i],
          sensorComponent({
            id: `cell_voltage_${battery}_${i}`,
            name: `Cell Voltage ${battery} ${(i + 1).toString().padStart(2, '0')}`,
            device_class: 'voltage',
            unit_of_measurement: 'V',
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
      transform: v => parseFloat(v) / 1000,
    });
    advertise(
      ['charge'],
      sensorComponent<number>({
        id: 'calibration_charge',
        name: 'Calibration Charge',
        device_class: 'energy',
        unit_of_measurement: 'mAh',
      }),
    );
    field({
      key: 'df',
      path: ['discharge'],
      transform: v => parseFloat(v) / 1000,
    });
    advertise(
      ['discharge'],
      sensorComponent<number>({
        id: 'calibration_discharge',
        name: 'Calibration Discharge',
        device_class: 'energy',
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
  [CommandType.SYNC_TIME]: CommandType.SYNC_TIME,
  [CommandType.TIME_ZONE]: CommandType.TIME_ZONE,
  [CommandType.SOFTWARE_RESTART]: CommandType.SOFTWARE_RESTART,
  [CommandType.FACTORY_RESET]: CommandType.FACTORY_RESET,
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
