import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import {
  CommandParams,
  JupiterBatteryWorkingStatus,
  JupiterDeviceData,
  JupiterBMSInfo,
  isValidJupiterWorkingMode,
  WeekdaySet,
  JupiterTimePeriod,
} from '../types';
import {
  sensorComponent,
  switchComponent,
  buttonComponent,
  selectComponent,
  textComponent,
  numberComponent,
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
  SURPLUS_FEED_IN = 13,
  GET_BMS_INFO = 14, // -> inv:g_state=1,w_state1=1,w_state2=1,i_err=0,i_war=0,g_vol=2399,g_cur=0,g_pf=0,g_fre=5000,b_vol=526,g_power=119,i_temp=31,mppt:m_state=244,m_err=0,m_temp=30,m_war=0,pv1=350|37|1304,pv2=349|39|1372,pv3=378|18|712,pv4=365|32|1180,b_vol=525,b_cur=85,base_v=221,pe_v=165,bms:c_vol=571,c_cur=500,d_cur=500,soc=33,soh=100,b_cap=5120,b_vol=5252,b_cur=63,b_temp=250,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=1,vol0=3280,vol1=3281,vol2=3283,vol3=3283,vol4=3283,vol5=3283,vol6=3280,vol7=3284,vol8=3283,vol9=3284,vol10=3282,vol11=3286,vol12=3277,vol13=3286,vol14=3283,vol15=3284,b_temp0=14,b_temp1=15,b_temp2=15,b_temp3=16,env_t=27,mos_t=20
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

function isJupiterBmsInfoMessage(values: Record<string, string>): boolean {
  // Check for a few unique BMS keys
  return (
    'soc' in values &&
    'b_vol' in values &&
    'b_cur' in values &&
    'vol0' in values &&
    'b_temp0' in values
  );
}

registerDeviceDefinition(
  {
    deviceTypes: ['HMN'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    if (process.env.POLL_CELL_DATA === 'true') {
      registerJupiterBMSInfoMessage(message);
    }
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
    controlsDeviceAvailability: true,
  };
  message<JupiterDeviceData>(options, ({ field, advertise, command }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    field({ key: 'ele_d', path: ['dailyChargingCapacity'], transform: v => parseFloat(v) / 100 });
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
    field({ key: 'ele_m', path: ['monthlyChargingCapacity'], transform: v => parseFloat(v) / 100 });
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
    field({ key: 'ele_y', path: ['yearlyChargingCapacity'], transform: v => parseFloat(v) / 100 });
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
    field({ key: 'grd_d', path: ['dailyDischargeCapacity'], transform: v => parseFloat(v) / 100 });
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
    field({
      key: 'grd_m',
      path: ['monthlyDischargeCapacity'],
      transform: v => parseFloat(v) / 100,
    });
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
    field({
      key: 'cel_s',
      path: ['batteryWorkingStatus'],
      transform: v => {
        switch (v) {
          case '0':
            return 'keep';
          case '1':
            return 'charging';
          case '2':
            return 'discharging';
          default:
            return 'unknown';
        }
      },
    });
    advertise(
      ['batteryWorkingStatus'],
      sensorComponent<JupiterBatteryWorkingStatus>({
        id: 'battery_working_status',
        name: 'Battery Working Status',
        icon: 'mdi:battery',
        valueMappings: {
          keep: 'Keep Level',
          charging: 'Charging',
          discharging: 'Discharging',
          unknown: 'Unknown',
        },
      }),
    );
    field({ key: 'cel_p', path: ['batteryEnergy'], transform: v => parseFloat(v) / 100 });
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
    field({
      key: 'wor_m',
      path: ['workingMode'],
      transform: v => {
        switch (v) {
          case '1':
            return 'automatic';
          case '2':
            return 'manual';
          default:
            return 'automatic';
        }
      },
    });
    advertise(
      ['workingMode'],
      selectComponent<NonNullable<JupiterDeviceData['workingMode']>>({
        id: 'working_mode',
        name: 'Working Mode',
        icon: 'mdi:cog',
        command: 'working-mode',
        valueMappings: {
          automatic: 'Automatic',
          manual: 'Manual',
        },
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

    // Surplus Feed-in (ful_d)
    field({ key: 'ful_d', path: ['surplusFeedInEnabled'], transform: v => v === '1' });
    advertise(
      ['surplusFeedInEnabled'],
      switchComponent({
        id: 'surplus_feed_in',
        name: 'Surplus Feed-in',
        icon: 'mdi:transmission-tower-export',
        command: 'surplus-feed-in',
      }),
    );
    command('surplus-feed-in', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable = message.toLowerCase() === 'true' || message === '1' || message === 'on';
        updateDeviceState(() => ({ surplusFeedInEnabled: enable }));
        publishCallback(processCommand(CommandType.SURPLUS_FEED_IN, { ful_d: enable ? 1 : 0 }));
      },
    });

    // Alarm Code (ala_c)
    field({ key: 'ala_c', path: ['alarmCode'] });
    advertise(
      ['alarmCode'],
      sensorComponent<number>({
        id: 'alarm_code',
        name: 'Alarm Code',
        icon: 'mdi:alert',
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
        if (!isValidJupiterWorkingMode(message)) {
          console.error('Invalid working mode value:', message);
          return;
        }

        updateDeviceState(() => ({
          workingMode: message,
        }));
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
      const periodIndex = i;
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
          // Validate time format (HH:MM)
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            console.error('Invalid start time format (should be HH:MM):', message);
            return;
          }

          const [hours, minutes] = message.split(':').map(part => parseInt(part, 10));

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              console.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              startTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
            };

            // Build the command parameters
            const md = state.workingMode === 'manual' ? 2 : 1;
            const params: CommandParams = { md, nm: periodIndex };
            const period = timePeriods[periodIndex];

            params.bt = period.startTime;
            params.et = period.endTime;
            params.wk = weekdaySetToBitMask(period.weekday);
            params.vv = period.power;
            params.as = period.enabled ? 1 : 0;

            publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));

            return { timePeriods };
          });
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
          // Validate time format (HH:MM)
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            console.error('Invalid end time format (should be HH:MM):', message);
            return;
          }

          const [hours, minutes] = message.split(':').map(part => parseInt(part, 10));

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              console.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              endTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
            };

            // Build the command parameters
            const md = state.workingMode === 'manual' ? 2 : 1;
            const params: CommandParams = { md, nm: periodIndex };
            const period = timePeriods[periodIndex];

            params.bt = period.startTime;
            params.et = period.endTime;
            params.wk = weekdaySetToBitMask(period.weekday);
            params.vv = period.power;
            params.as = period.enabled ? 1 : 0;

            publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));

            return { timePeriods };
          });
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

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              console.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              enabled,
            };

            // Build the command parameters
            const md = state.workingMode === 'manual' ? 2 : 1;
            const params: CommandParams = { md, nm: periodIndex };
            const period = timePeriods[periodIndex];

            params.bt = period.startTime;
            params.et = period.endTime;
            params.wk = weekdaySetToBitMask(period.weekday);
            params.vv = period.power;
            params.as = enabled ? 1 : 0;

            publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));

            return { timePeriods };
          });
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
          min: 0,
          max: 800,
          step: 1,
        }),
      );
      command(`time-period/${i}/power`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          const power = parseInt(message, 10);
          if (isNaN(power) || power < 0 || power > 800) {
            console.error('Invalid power value (should be 0-800):', message);
            return;
          }

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              console.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              power,
            };

            // Build the command parameters
            const md = state.workingMode === 'manual' ? 2 : 1;
            const params: CommandParams = { md, nm: periodIndex };
            const period = timePeriods[periodIndex];

            params.bt = period.startTime;
            params.et = period.endTime;
            params.wk = weekdaySetToBitMask(period.weekday);
            params.vv = period.power;
            params.as = period.enabled ? 1 : 0;

            publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));

            return { timePeriods };
          });
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
        textComponent<WeekdaySet>({
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
          const weekday = weekdaySetToBitMask(message as WeekdaySet);

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              console.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              weekday: bitMaskToWeekdaySet(weekday),
            };

            // Build the command parameters
            const md = state.workingMode === 'manual' ? 2 : 1;
            const params: CommandParams = { md, nm: periodIndex };
            const period = timePeriods[periodIndex];

            params.bt = period.startTime;
            params.et = period.endTime;
            params.wk = weekdaySetToBitMask(period.weekday);
            params.vv = period.power;
            params.as = period.enabled ? 1 : 0;

            publishCallback(processCommand(CommandType.SET_TIME_PERIOD, params));

            return { timePeriods };
          });
        },
      });
    }
  });
}

function registerJupiterBMSInfoMessage(message: BuildMessageFn) {
  message<JupiterBMSInfo>(
    {
      refreshDataPayload: `cd=${CommandType.GET_BMS_INFO}`,
      isMessage: isJupiterBmsInfoMessage,
      publishPath: 'bms',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 60000,
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      // Cell voltages (vol0-vol15)
      for (let i = 0; i < 16; i++) {
        const key = `vol${i}`;
        field({ key, path: ['cells', 'voltages', i] });
        advertise(
          ['cells', 'voltages', i],
          sensorComponent<number>({
            id: `cell_voltage_${i + 1}`,
            name: `Cell Voltage ${i + 1}`,
            unit_of_measurement: 'mV',
            device_class: 'voltage',
            enabled_by_default: false,
          }),
        );
      }
      // Cell temperatures (b_temp0-b_temp3)
      for (let i = 0; i < 4; i++) {
        const key = `b_temp${i}`;
        field({ key, path: ['cells', 'temperatures', i] });
        advertise(
          ['cells', 'temperatures', i],
          sensorComponent<number>({
            id: `cell_temperature_${i + 1}`,
            name: `Cell Temperature ${i + 1}`,
            unit_of_measurement: '°C',
            device_class: 'temperature',
            enabled_by_default: false,
          }),
        );
      }
      // BMS fields
      const bmsFields = [
        ['soc', { id: 'soc' }],
        ['soh', { id: 'soh' }],
        ['b_cap', { id: 'capacity' }],
        ['b_vol', { id: 'voltage', deviceClass: 'voltage', unitOfMeasurement: 'mV' }],
        ['b_cur', { id: 'current', deviceClass: 'current', unitOfMeasurement: 'mA' }],
        ['b_temp', { id: 'temperature', deviceClass: 'temperature', unitOfMeasurement: '°C' }],
        ['c_vol', { id: 'chargeVoltage', deviceClass: 'voltage', unitOfMeasurement: 'mV' }],
        ['c_cur', { id: 'chargeCurrent', deviceClass: 'current', unitOfMeasurement: 'mA' }],
        ['d_cur', { id: 'dischargeCurrent', deviceClass: 'current', unitOfMeasurement: 'mA' }],
        ['b_err', { id: 'error' }],
        ['b_war', { id: 'warning' }],
        ['b_err2', { id: 'error2' }],
        ['b_war2', { id: 'warning2' }],
        ['c_flag', { id: 'cellFlag' }],
        ['s_flag', { id: 'statusFlag' }],
        ['b_num', { id: 'bmsNumber' }],
        ['mos_t', { id: 'mosfetTemp', deviceClass: 'temperature', unitOfMeasurement: '°C' }],
        ['env_t', { id: 'envTemp', deviceClass: 'temperature', unitOfMeasurement: '°C' }],
      ] as const;
      for (const [key, info] of bmsFields) {
        field({ key, path: ['bms', info.id] });
        advertise(
          ['bms', info.id],
          sensorComponent<number>({
            id: info.id,
            name: `BMS ${info.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
            unit_of_measurement: 'unitOfMeasurement' in info ? info.unitOfMeasurement : undefined,
            device_class: 'deviceClass' in info ? info.deviceClass : undefined,
            enabled_by_default: false,
          }),
        );
      }
    },
  );
}

// Helper: parseTimePeriod for Jupiter (same format as Venus)
function parseTimePeriod(value: string): NonNullable<JupiterDeviceData['timePeriods']>[number] {
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

  let weekdayBitMask = parseInt(parts[4], 10);
  const weekday = bitMaskToWeekdaySet(weekdayBitMask);
  return {
    startTime: `${parseInt(parts[0], 10)}:${parseInt(parts[1], 10).toString().padStart(2, '0')}`,
    endTime: `${parseInt(parts[2], 10)}:${parseInt(parts[3], 10).toString().padStart(2, '0')}`,
    weekday: weekday,
    power: parseInt(parts[5], 10),
    enabled: parts[6] === '1',
  };
}

function bitMaskToWeekdaySet(weekdayBitMask: number): JupiterTimePeriod['weekday'] {
  return '0123456'
    .split('')
    .filter((_, index) => weekdayBitMask & (1 << index))
    .join('');
}

function weekdaySetToBitMask(weekday: JupiterTimePeriod['weekday']): number {
  return weekday.split('').reduce((mask, day) => mask | (1 << parseInt(day, 10)), 0);
}
