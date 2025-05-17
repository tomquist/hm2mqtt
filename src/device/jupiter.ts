import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import { CommandParams, JupiterDeviceData } from '../types';
import {
  sensorComponent,
  textComponent,
  switchComponent,
  numberComponent,
  buttonComponent,
} from '../homeAssistantDiscovery';

/**
 * Command types supported by the Jupiter device (subset of Venus)
 */
enum CommandType {
  READ_DEVICE_INFO = 1, // -> ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=1,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3
  GET_FC41D_INFO = 10, // -> wifi_v=202409090159
  FACTORY_RESET = 5,
  SET_DEVICE_TIME = 4,
  SET_TIME_PERIOD = 3,
  SET_WORKING_MODE = 2,
}

function processCommand(command: CommandType, params: CommandParams = {}): string {
  const entries = Object.entries(params);
  return `cd=${command}${entries.length > 0 ? ',' : ''}${entries.map(([key, value]) => `${key}=${value}`).join(',')}`;
}

const requiredRuntimeInfoKeys = [
  'ele_d',
  'ele_m',
  'ele_y',
  'pv1_p',
  'pv2_p',
  'pv3_p',
  'pv4_p',
  'grd_d',
  'grd_m',
  'grd_o',
  'grd_t',
  'gct_s',
  'cel_s',
  'cel_p',
  'cel_c',
  'err_t',
  'wor_m',
  'tim_0',
  'tim_1',
  'tim_2',
  'tim_3',
  'tim_4',
  'cts_m',
  'htt_p',
  'wif_s',
  'ct_t',
  'phase_t',
  'dchrg',
  'ssid',
  'dev_n',
];
function isJupiterRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(key => key in values);
}

registerDeviceDefinition(
  {
    deviceTypes: ['HMN'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=1',
    isMessage: isJupiterRuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: (state: JupiterDeviceData) => ({
      firmwareVersion: state.deviceVersion?.toString(),
    }),
    pollInterval: globalPollInterval,
  };
  message<JupiterDeviceData>(options, ({ field, advertise, command }) => {
    field({ key: 'ele_d', path: ['dailyChargingCapacity'] });
    advertise(
      ['dailyChargingCapacity'],
      sensorComponent<number>({
        id: 'daily_charging_capacity',
        name: 'Daily Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total',
      }),
    );
    field({ key: 'ele_m', path: ['monthlyChargingCapacity'] });
    advertise(
      ['monthlyChargingCapacity'],
      sensorComponent<number>({
        id: 'monthly_charging_capacity',
        name: 'Monthly Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total',
      }),
    );
    field({ key: 'ele_y', path: ['yearlyChargingCapacity'] });
    advertise(
      ['yearlyChargingCapacity'],
      sensorComponent<number>({
        id: 'yearly_charging_capacity',
        name: 'Yearly Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total',
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
      }),
    );
    field({ key: 'pv3_p', path: ['pv3Power'] });
    advertise(
      ['pv3Power'],
      sensorComponent<number>({
        id: 'pv3_power',
        name: 'PV3 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
    field({ key: 'pv4_p', path: ['pv4Power'] });
    advertise(
      ['pv4Power'],
      sensorComponent<number>({
        id: 'pv4_power',
        name: 'PV4 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
    field({ key: 'grd_d', path: ['dailyDischargeCapacity'] });
    advertise(
      ['dailyDischargeCapacity'],
      sensorComponent<number>({
        id: 'daily_discharge_capacity',
        name: 'Daily Discharge Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total',
      }),
    );
    field({ key: 'grd_m', path: ['monthlyDischargeCapacity'] });
    advertise(
      ['monthlyDischargeCapacity'],
      sensorComponent<number>({
        id: 'monthly_discharge_capacity',
        name: 'Monthly Discharge Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total',
      }),
    );
    field({ key: 'grd_o', path: ['combinedPower'] });
    advertise(
      ['combinedPower'],
      sensorComponent<number>({
        id: 'combined_power',
        name: 'Combined Power',
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
    field({ key: 'grd_t', path: ['workingStatus'] });
    advertise(
      ['workingStatus'],
      sensorComponent<number>({
        id: 'working_status',
        name: 'Working Status',
      }),
    );
    field({ key: 'gct_s', path: ['ctStatus'] });
    advertise(
      ['ctStatus'],
      sensorComponent<number>({
        id: 'ct_status',
        name: 'CT Status',
      }),
    );
    field({ key: 'cel_s', path: ['batteryWorkingStatus'] });
    advertise(
      ['batteryWorkingStatus'],
      sensorComponent<number>({
        id: 'battery_working_status',
        name: 'Battery Working Status',
      }),
    );
    field({ key: 'cel_p', path: ['batteryEnergy'] });
    advertise(
      ['batteryEnergy'],
      sensorComponent<number>({
        id: 'battery_energy',
        name: 'Battery Energy',
        unit_of_measurement: 'kWh',
      }),
    );
    field({ key: 'cel_c', path: ['batterySoc'] });
    advertise(
      ['batterySoc'],
      sensorComponent<number>({
        id: 'battery_soc',
        name: 'Battery SOC',
        unit_of_measurement: '%',
      }),
    );
    field({ key: 'err_t', path: ['errorCode'] });
    advertise(
      ['errorCode'],
      sensorComponent<number>({
        id: 'error_code',
        name: 'Error Code',
      }),
    );
    field({ key: 'wor_m', path: ['workingMode'] });
    advertise(
      ['workingMode'],
      sensorComponent<number>({
        id: 'working_mode',
        name: 'Working Mode',
      }),
    );
    field({ key: 'cts_m', path: ['autoSwitchWorkingMode'] });
    advertise(
      ['autoSwitchWorkingMode'],
      sensorComponent<number>({
        id: 'auto_switch_working_mode',
        name: 'Auto Switch Working Mode',
      }),
    );
    field({ key: 'htt_p', path: ['httpServerType'] });
    advertise(
      ['httpServerType'],
      sensorComponent<number>({
        id: 'http_server_type',
        name: 'HTTP Server Type',
      }),
    );
    field({ key: 'wif_s', path: ['wifiSignalStrength'] });
    advertise(
      ['wifiSignalStrength'],
      sensorComponent<number>({
        id: 'wifi_signal_strength',
        name: 'WiFi Signal Strength',
      }),
    );
    field({ key: 'ct_t', path: ['ctType'] });
    advertise(
      ['ctType'],
      sensorComponent<number>({
        id: 'ct_type',
        name: 'CT Type',
      }),
    );
    field({ key: 'phase_t', path: ['phaseType'] });
    advertise(
      ['phaseType'],
      sensorComponent<number>({
        id: 'phase_type',
        name: 'Phase Type',
      }),
    );
    field({ key: 'dchrg', path: ['rechargeMode'] });
    advertise(
      ['rechargeMode'],
      sensorComponent<number>({
        id: 'recharge_mode',
        name: 'Recharge Mode',
      }),
    );
    field({ key: 'dev_n', path: ['deviceVersion'] });
    advertise(
      ['deviceVersion'],
      sensorComponent<number>({
        id: 'device_version',
        name: 'Device Version',
      }),
    );
    field({ key: 'ssid', path: ['wifiName'], transform: v => v });
    advertise(
      ['wifiName'],
      sensorComponent<string>({
        id: 'wifi_name',
        name: 'WiFi Name',
        icon: 'mdi:wifi',
      }),
    );

    // --- COMMANDS ---
    // Refresh
    command('refresh', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback(processCommand(CommandType.READ_DEVICE_INFO));
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

    // Working mode (no button, just command)
    command('working-mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        let mode: number;
        switch (message) {
          case 'automatic':
            mode = 1;
            break;
          case 'manual':
            mode = 2;
            break;
          default:
            mode = 1;
        }
        updateDeviceState(() => ({
          workingMode: mode,
        }));
        publishCallback(processCommand(CommandType.SET_WORKING_MODE, { md: mode }));
      },
    });

    // Factory reset
    command('factory-reset', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback(processCommand(CommandType.FACTORY_RESET, { rs: 2 }));
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

    // Sync time
    command('sync-time', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          const now = new Date();
          publishCallback(
            processCommand(CommandType.SET_DEVICE_TIME, {
              yy: now.getFullYear(),
              mm: now.getMonth(),
              rr: now.getDate(),
              hh: now.getHours(),
              mn: now.getMinutes(),
            }),
          );
        }
      },
    });
    advertise(
      [],
      buttonComponent({
        id: 'sync_time',
        name: 'Sync Time',
        icon: 'mdi:clock-sync',
        command: 'sync-time',
        payload_press: 'PRESS',
        enabled_by_default: false,
      }),
    );

    // Time period sensors and commands (tim_0 to tim_4)
    for (let i = 0; i < 5; i++) {
      // Start time
      field({
        key: `tim_${i}`,
        path: ['timePeriods', i, 'startTime'],
        transform: v => parseTimePeriod(v).startTime,
      });
      advertise(
        ['timePeriods', i, 'startTime'],
        textComponent({
          id: `time_period_${i}_start_time`,
          name: `Time Period ${i} Time From`,
          command: `time-period/${i}/start-time`,
          pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
        }),
      );
      command(`time-period/${i}/start-time`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            console.error('Invalid start time format (should be HH:MM):', message);
            return;
          }
          // You would update state here if you track time periods
          // Build the command parameters
          const params: CommandParams = { md: 1, nm: i, bt: message };
          publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));
        },
      });
      // End time
      field({
        key: `tim_${i}`,
        path: ['timePeriods', i, 'endTime'],
        transform: v => parseTimePeriod(v).endTime,
      });
      advertise(
        ['timePeriods', i, 'endTime'],
        textComponent({
          id: `time_period_${i}_end_time`,
          name: `Time Period ${i} Time To`,
          command: `time-period/${i}/end-time`,
          pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
        }),
      );
      command(`time-period/${i}/end-time`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            console.error('Invalid end time format (should be HH:MM):', message);
            return;
          }
          const params: CommandParams = { md: 1, nm: i, et: message };
          publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));
        },
      });
      // Enabled
      field({
        key: `tim_${i}`,
        path: ['timePeriods', i, 'enabled'],
        transform: v => parseTimePeriod(v).enabled,
      });
      advertise(
        ['timePeriods', i, 'enabled'],
        switchComponent({
          id: `time_period_${i}_enabled`,
          name: `Time Period ${i} Enabled`,
          icon: 'mdi:clock-time-four-outline',
          command: `time-period/${i}/enabled`,
        }),
      );
      command(`time-period/${i}/enabled`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          const enabled = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
          const params: CommandParams = { md: 1, nm: i, as: enabled ? 1 : 0 };
          publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));
        },
      });
      // Power
      field({
        key: `tim_${i}`,
        path: ['timePeriods', i, 'power'],
        transform: v => parseTimePeriod(v).power,
      });
      advertise(
        ['timePeriods', i, 'power'],
        numberComponent({
          id: `time_period_${i}_power`,
          name: `Time Period ${i} Power`,
          icon: 'mdi:flash',
          unit_of_measurement: 'W',
          command: `time-period/${i}/power`,
        }),
      );
      command(`time-period/${i}/power`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          const power = parseInt(message, 10);
          if (isNaN(power)) {
            console.error('Invalid power value:', message);
            return;
          }
          const params: CommandParams = { md: 1, nm: i, vv: power };
          publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));
        },
      });
      // Weekday
      field({
        key: `tim_${i}`,
        path: ['timePeriods', i, 'weekday'],
        transform: v => parseTimePeriod(v).weekday,
      });
      advertise(
        ['timePeriods', i, 'weekday'],
        textComponent({
          id: `time_period_${i}_weekday`,
          name: `Time Period ${i} Weekday`,
          command: `time-period/${i}/weekday`,
          pattern: '^0?1?2?3?4?5?6?$',
        }),
      );
      command(`time-period/${i}/weekday`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          if (!/^[0-6]*$/.test(message)) {
            console.error(
              'Invalid weekday value (should be a string only consisting of numbers 0-6):',
              message,
            );
            return;
          }
          const params: CommandParams = { md: 1, nm: i, wk: message };
          publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));
        },
      });
    }
  });
}

// Helper: parseTimePeriod for Jupiter (same format as Venus)
function parseTimePeriod(value: string) {
  const parts = value.split('|');
  if (parts.length < 7) {
    return {
      startTime: '00:00',
      endTime: '00:00',
      weekday: '0123456',
      power: 0,
      enabled: false,
    };
  }
  return {
    startTime: `${parseInt(parts[0], 10)}:${parts[1].padStart(2, '0')}`,
    endTime: `${parseInt(parts[2], 10)}:${parts[3].padStart(2, '0')}`,
    weekday: parts[4],
    power: parseInt(parts[5], 10),
    enabled: parts[6] === '1',
  };
}
