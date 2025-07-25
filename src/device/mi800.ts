import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import { CommandParams, MI800DeviceData } from '../types';
import {
  sensorComponent,
  binarySensorComponent,
  numberComponent,
  selectComponent,
  switchComponent,
} from '../homeAssistantDiscovery';

/**
 * Command types supported by the MI800 device
 */
enum CommandType {
  READ_DEVICE_INFO = 1, // -> ele_d=53,ele_w=3984,ele_m=3984,pv1_v=335,pv1_i=3,pv1_p=39,pv1_s=1,pv2_v=341,pv2_i=11,pv2_p=38,pv2_s=1,pe1_v=17,fb1_v=832,fb2_v=773,grd_f=5001,grd_v=2543,grd_s=1,grd_o=72,chp_t=36,rel_s=1,err_t=0,err_c=0,err_d=0,ver_s=106,mpt_m=1,ble_s=2
  SET_MAX_OUTPUT_POWER = 8,
  SET_MODE = 11,
  GRID_CONNECTION_BAN = 22,
}

function processCommand(command: CommandType, params: CommandParams = {}): string {
  const entries = Object.entries(params);
  return `cd=${command}${entries.length > 0 ? ',' : ''}${entries
    .map(([key, value]) => `${key}=${value}`)
    .join(',')}`;
}

/**
 * Check if the message is an MI800 runtime info message
 */
function isMI800RuntimeInfoMessage(values: Record<string, string>): boolean {
  return (
    'ele_d' in values &&
    'pv1_v' in values &&
    'pv1_i' in values &&
    'pv1_p' in values &&
    'grd_f' in values &&
    'grd_v' in values &&
    'chp_t' in values
  );
}

/**
 * Register the runtime info message handler
 */
function registerRuntimeInfoMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=1',
    isMessage: isMI800RuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: (state: MI800DeviceData) => ({
      firmwareVersion: state.firmwareVersion?.toString(),
    }),
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  };

  message<MI800DeviceData>(options, ({ field, advertise, command }) => {
    // Timestamp
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    // Energy statistics
    field({ key: 'ele_d', path: ['dailyEnergyGenerated'], transform: v => parseFloat(v) / 100 });
    advertise(
      ['dailyEnergyGenerated'],
      sensorComponent<number>({
        id: 'daily_energy_generated',
        name: 'Daily Energy Generated',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'ele_w', path: ['weeklyEnergyGenerated'], transform: v => parseFloat(v) / 100 });
    advertise(
      ['weeklyEnergyGenerated'],
      sensorComponent<number>({
        id: 'weekly_energy_generated',
        name: 'Weekly Energy Generated',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'ele_m', path: ['monthlyEnergyGenerated'], transform: v => parseFloat(v) / 100 });
    advertise(
      ['monthlyEnergyGenerated'],
      sensorComponent<number>({
        id: 'monthly_energy_generated',
        name: 'Monthly Energy Generated',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'ele_s', path: ['totalEnergyGenerated'], transform: v => parseFloat(v) / 100 });
    advertise(
      ['totalEnergyGenerated'],
      sensorComponent<number>({
        id: 'total_energy_generated',
        name: 'Total Energy Generated',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    // PV Input 1
    field({ key: 'pv1_v', path: ['pv1Voltage'], transform: v => parseFloat(v) / 10 });
    advertise(
      ['pv1Voltage'],
      sensorComponent<number>({
        id: 'pv1_voltage',
        name: 'PV1 Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv1_i', path: ['pv1Current'], transform: v => parseFloat(v) / 10 });
    advertise(
      ['pv1Current'],
      sensorComponent<number>({
        id: 'pv1_current',
        name: 'PV1 Current',
        device_class: 'current',
        unit_of_measurement: 'A',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv1_p', path: ['pv1Power'] });
    advertise(
      ['pv1Power'],
      sensorComponent<number>({
        id: 'pv1_power',
        name: 'PV1 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv1_s', path: ['pv1Status'], transform: v => parseInt(v) === 1 });
    advertise(
      ['pv1Status'],
      binarySensorComponent({
        id: 'pv1_status',
        name: 'PV1 Active',
        device_class: 'power',
      }),
    );

    // PV Input 2
    field({ key: 'pv2_v', path: ['pv2Voltage'], transform: v => parseFloat(v) / 10 });
    advertise(
      ['pv2Voltage'],
      sensorComponent<number>({
        id: 'pv2_voltage',
        name: 'PV2 Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv2_i', path: ['pv2Current'], transform: v => parseFloat(v) / 10 });
    advertise(
      ['pv2Current'],
      sensorComponent<number>({
        id: 'pv2_current',
        name: 'PV2 Current',
        device_class: 'current',
        unit_of_measurement: 'A',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv2_p', path: ['pv2Power'] });
    advertise(
      ['pv2Power'],
      sensorComponent<number>({
        id: 'pv2_power',
        name: 'PV2 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pv2_s', path: ['pv2Status'], transform: v => parseInt(v) === 1 });
    advertise(
      ['pv2Status'],
      binarySensorComponent({
        id: 'pv2_status',
        name: 'PV2 Active',
        device_class: 'power',
      }),
    );

    // Grid information
    field({ key: 'grd_f', path: ['gridFrequency'], transform: v => parseFloat(v) / 100 });
    advertise(
      ['gridFrequency'],
      sensorComponent<number>({
        id: 'grid_frequency',
        name: 'Grid Frequency',
        device_class: 'frequency',
        unit_of_measurement: 'Hz',
        state_class: 'measurement',
      }),
    );

    field({ key: 'grd_v', path: ['gridVoltage'], transform: v => parseFloat(v) / 10 });
    advertise(
      ['gridVoltage'],
      sensorComponent<number>({
        id: 'grid_voltage',
        name: 'Grid Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
      }),
    );

    field({ key: 'grd_s', path: ['gridStatus'], transform: v => parseInt(v) === 1 });
    advertise(
      ['gridStatus'],
      binarySensorComponent({
        id: 'grid_status',
        name: 'Grid Connected',
        device_class: 'connectivity',
      }),
    );

    field({ key: 'grd_o', path: ['gridOutputPower'] });
    advertise(
      ['gridOutputPower'],
      sensorComponent<number>({
        id: 'grid_output_power',
        name: 'Grid Output Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pl', path: ['maximumOutputPower'] });
    advertise(
      ['maximumOutputPower'],
      numberComponent({
        id: 'maximum_output_power',
        name: 'Maximum Output Power',
        unit_of_measurement: 'W',
        command: 'max-output-power',
        min: 0,
        max: 800,
        step: 1,
      }),
    );

    // Device status
    field({ key: 'chp_t', path: ['chipTemperature'] });
    advertise(
      ['chipTemperature'],
      sensorComponent<number>({
        id: 'chip_temperature',
        name: 'Chip Temperature',
        device_class: 'temperature',
        unit_of_measurement: '°C',
        state_class: 'measurement',
      }),
    );

    field({ key: 'err_t', path: ['errorType'] });
    advertise(
      ['errorType'],
      sensorComponent<number>({
        id: 'error_type',
        name: 'Error Type',
        icon: 'mdi:alert-circle',
      }),
    );

    field({ key: 'err_c', path: ['errorCount'] });
    advertise(
      ['errorCount'],
      sensorComponent<number>({
        id: 'error_count',
        name: 'Error Count',
        icon: 'mdi:counter',
      }),
    );

    field({ key: 'err_d', path: ['errorDetails'] });
    advertise(
      ['errorDetails'],
      sensorComponent<number>({
        id: 'error_details',
        name: 'Error Details',
        icon: 'mdi:information-outline',
      }),
    );

    field({ key: 'ver_s', path: ['firmwareVersion'] });
    advertise(
      ['firmwareVersion'],
      sensorComponent<number>({
        id: 'firmware_version',
        name: 'Firmware Version',
        icon: 'mdi:chip',
      }),
    );

    field({ key: 'fc4_v', path: ['fc4Version'], transform: v => v });
    advertise(
      ['fc4Version'],
      sensorComponent<string>({
        id: 'fc4_version',
        name: 'FC4 Version',
        icon: 'mdi:chip',
      }),
    );

    field({ key: 'mpt_m', path: ['mode'], transform: v => parseInt(v, 10) });
    advertise(
      ['mode'],
      selectComponent<number>({
        id: 'mode',
        name: 'Mode',
        icon: 'mdi:cog',
        command: 'mode',
        valueMappings: {
          0: 'Default',
          1: 'B2500 Boost',
          2: 'Reverse Current Protection',
        },
      }),
    );

    field({ key: 'gc', path: ['gridConnectionBan'], transform: v => v === '1' });
    advertise(
      ['gridConnectionBan'],
      switchComponent({
        id: 'grid_connection_ban',
        name: 'Grid Connection Ban',
        icon: 'mdi:transmission-tower-off',
        command: 'grid-connection-ban',
      }),
    );

    command('max-output-power', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const power = parseInt(message, 10);
        if (isNaN(power)) {
          return;
        }
        updateDeviceState(() => ({ maximumOutputPower: power }));
        publishCallback(processCommand(CommandType.SET_MAX_OUTPUT_POWER, { p1: power }));
      },
    });

    command('mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const mode = parseInt(message, 10);
        if (![0, 1, 2].includes(mode)) {
          return;
        }
        updateDeviceState(() => ({ mode }));
        publishCallback(processCommand(CommandType.SET_MODE, { p1: mode }));
      },
    });

    command('grid-connection-ban', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable = message.toLowerCase() === 'true' || message === '1' || message === 'on';
        updateDeviceState(() => ({ gridConnectionBan: enable }));
        publishCallback(processCommand(CommandType.GRID_CONNECTION_BAN, { p1: enable ? 1 : 0 }));
      },
    });
  });
}

// Register the MI800 device
registerDeviceDefinition(
  {
    deviceTypes: ['HMI'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
  },
);
