import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import {
  CommandParams,
  isValidVenusVersionSet,
  isValidVenusWorkingMode,
  VenusBMSInfo,
  VenusDeviceData,
  VenusTimePeriod,
  WeekdaySet,
} from '../types';
import logger from '../logger';
import {
  buttonComponent,
  numberComponent,
  selectComponent,
  sensorComponent,
  switchComponent,
  textComponent,
  binarySensorComponent,
} from '../homeAssistantDiscovery';
import {
  multiply,
  divide,
  map,
  identity,
  number,
  equalsBoolean,
  chain,
  inRange,
} from '../transforms';

/**
 * Command types supported by the Venus device
 */
enum CommandType {
  READ_DEVICE_INFO = 1, // -> tot_i=8848,tot_o=7097,ele_d=537,ele_m=8848,grd_d=328,grd_m=7097,inc_d=0,inc_m=0,grd_f=0,grd_o=613,grd_t=3,gct_s=1,cel_s=3,cel_p=327,cel_c=64,err_t=0,err_a=0,dev_n=149,grd_y=0,wor_m=0,tim_0=0|0|8|2|127|300|1,tim_1=0|0|5|23|127|350|0,tim_2=17|21|23|59|127|600|1,tim_3=9|31|16|30|127|-800|1,tim_4=0|0|0|0|0|0|0,tim_5=0|0|0|0|0|0|0,tim_6=0|0|0|0|0|0|0,tim_7=0|0|0|0|0|0|0,tim_8=0|0|0|0|0|0|0,tim_9=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=33,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=4,phase_t=1,dchrg_t=1,bms_v=212,fc_v=202409090159,wifi_n=XXX,seq_s=0,ctrl_r=1,par=255,gen=255,ble=3,shelly_p=1010,c_ratio=90
  SET_WORKING_MODE = 2,
  SET_TIME_PERIOD = 3,
  SET_DEVICE_TIME = 4,
  FACTORY_RESET = 5,
  UPGRADE_FIRMWARE = 9,
  GET_FC41D_INFO = 10, // -> wifi_v=202409090159
  ENABLE_BACKUP = 11,
  GET_BMS_INFO = 14, // -> b_ver=212,b_chv=571,b_rci=1000,b_rdi=1000,b_soc=65,b_soh=100,b_cap=5120,b_vol=5223,b_cur=-94,b_tem=250,b_chf=192,b_slf=0,b_cpc=332,b_err=0,b_war=0,b_ret=102482070,b_ent=0,b_mot=23,b_tp1=18,b_tp2=19,b_tp3=18,b_tp4=19,b_vo1=3265,b_vo2=3265,b_vo3=3265,b_vo4=3265,b_vo5=3264,b_vo6=3264,b_vo7=3265,b_vo8=3265,b_vo9=3264,b_vo10=3265,b_vo11=3264,b_vo12=3265,b_vo13=3265,b_vo14=3265,b_vo15=3264,b_vo16=3262
  SET_DISCHARGE_POWER = 15,
  SET_MAX_CHARGING_POWER = 16,
  SET_MAX_DISCHARGE_POWER = 17,
  SET_METER_TYPE = 18,
  GET_CT_POWER = 19,
  UPGRADE_FC4_MODULE = 20,
  SET_LOCAL_API = 30,
}

/**
 * Process a command for the Venus device
 *
 * @param command - Command type
 * @param params - Command parameters
 * @returns Formatted command string
 */
function processCommand(command: CommandType, params: CommandParams = {}): string {
  const entries = Object.entries(params);
  return `cd=${command}${entries.length > 0 ? ',' : ''}${entries.map(([key, value]) => `${key}=${value}`).join(',')}`;
}

function bitMaskToWeekdaySet(weekdayBitMask: number) {
  return '0123456'
    .split('')
    .filter((_, index) => weekdayBitMask & (1 << index))
    .join('') as WeekdaySet;
}

/**
 * Parse a time period string from the device
 *
 * @param value - Time period string (format: "HH|MM|HH|MM|CYCLE|POWER|ENABLED")
 * @returns Parsed time period object
 */
function parseTimePeriod(value: string): NonNullable<VenusDeviceData['timePeriods']>[number] {
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

function weekdaySetToBitMask(weekday: VenusTimePeriod['weekday']): number {
  return weekday.split('').reduce((mask, day) => mask | (1 << parseInt(day, 10)), 0);
}

/**
 * Extract additional device info for Home Assistant discovery
 *
 * @param state - Device state
 * @returns Additional device info
 */
function extractAdditionalDeviceInfo(state: VenusDeviceData) {
  return {
    firmwareVersion: state.deviceVersion?.toString(),
  };
}

const requiredRuntimeInfoKeys = [
  'cel_p',
  'cel_c',
  'tot_i',
  'tot_o',
  'ele_d',
  'ele_m',
  'grd_d',
  'grd_m',
  'inc_d',
  'inc_m',
  'inc_a',
  'grd_f',
  'grd_o',
  'grd_t',
  'gct_s',
  'cel_s',
  'err_t',
  'err_a',
  'dev_n',
  'grd_y',
  'wor_m',
];
function isVenusRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(key => key in values);
}

registerDeviceDefinition(
  {
    deviceTypes: ['HMG', 'VNSE3', 'VNSA', 'VNSD'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerBMSInfoMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=1',
    isMessage: isVenusRuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: extractAdditionalDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  };
  message<VenusDeviceData>(options, ({ field, command, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    // Battery information
    field({
      key: 'cel_p',
      path: ['batteryCapacity'],
      transform: multiply(10), // Convert to Wh
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
      key: 'cel_c',
      path: ['batterySoc'],
      transform: number(),
    });
    advertise(
      ['batterySoc'],
      sensorComponent<number>({
        id: 'battery_soc',
        name: 'Battery State of Charge',
        device_class: 'battery',
        unit_of_measurement: '%',
      }),
    );

    // Power information
    field({
      key: 'tot_i',
      path: ['totalChargingCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['totalChargingCapacity'],
      sensorComponent<number>({
        id: 'total_charging_capacity',
        name: 'Total Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({
      key: 'tot_o',
      path: ['totalDischargeCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['totalDischargeCapacity'],
      sensorComponent<number>({
        id: 'total_discharge_capacity',
        name: 'Total Discharge Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({
      key: 'ele_d',
      path: ['dailyChargingCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['dailyChargingCapacity'],
      sensorComponent<number>({
        id: 'daily_charging_capacity',
        name: 'Daily Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({
      key: 'ele_m',
      path: ['monthlyChargingCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['monthlyChargingCapacity'],
      sensorComponent<number>({
        id: 'monthly_charging_capacity',
        name: 'Monthly Charging Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({
      key: 'grd_d',
      path: ['dailyDischargeCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['dailyDischargeCapacity'],
      sensorComponent<number>({
        id: 'daily_discharge_capacity',
        name: 'Daily Discharge Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    field({
      key: 'grd_m',
      path: ['monthlyDischargeCapacity'],
      transform: divide(100), // Convert to kWh
    });
    advertise(
      ['monthlyDischargeCapacity'],
      sensorComponent<number>({
        id: 'monthly_discharge_capacity',
        name: 'Monthly Discharge Capacity',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        state_class: 'total_increasing',
      }),
    );

    // Income information
    field({
      key: 'inc_d',
      path: ['dailyIncome'],
      transform: divide(1000), // Convert to euros
    });
    advertise(
      ['dailyIncome'],
      sensorComponent<number>({
        id: 'daily_income',
        name: 'Daily Income',
        device_class: 'monetary',
        unit_of_measurement: '€',
        state_class: 'total',
      }),
    );

    field({
      key: 'inc_m',
      path: ['monthlyIncome'],
      transform: divide(1000), // Convert to euros
    });
    advertise(
      ['monthlyIncome'],
      sensorComponent<number>({
        id: 'monthly_income',
        name: 'Monthly Income',
        device_class: 'monetary',
        unit_of_measurement: '€',
        state_class: 'total',
      }),
    );

    field({
      key: 'inc_a',
      path: ['totalIncome'],
      transform: divide(1000), // Convert to euros
    });
    advertise(
      ['totalIncome'],
      sensorComponent<number>({
        id: 'total_income',
        name: 'Total Income',
        device_class: 'monetary',
        unit_of_measurement: '€',
      }),
    );

    // Grid information
    field({
      key: 'grd_f',
      path: ['offGridPower'],
      transform: number(),
    });
    advertise(
      ['offGridPower'],
      sensorComponent<number>({
        id: 'off_grid_power',
        name: 'Off Grid Power',
        device_class: 'apparent_power',
        unit_of_measurement: 'VA',
      }),
    );

    field({
      key: 'grd_o',
      path: ['combinedPower'],
      transform: number(),
    });
    advertise(
      ['combinedPower'],
      sensorComponent<number>({
        id: 'combined_power',
        name: 'Combined Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({
      key: 'grd_t',
      path: ['workingStatus'],
      transform: map(
        {
          '0': 'sleep',
          '1': 'standby',
          '2': 'charging',
          '3': 'discharging',
          '4': 'backup',
          '5': 'upgrading',
          '6': 'bypass',
        },
        'standby',
      ),
    });
    advertise(
      ['workingStatus'],
      sensorComponent<NonNullable<VenusDeviceData['workingStatus']>>({
        id: 'working_status',
        name: 'Working Status',
        icon: 'mdi:state-machine',
        valueMappings: {
          sleep: 'Sleep Mode',
          standby: 'Standby',
          charging: 'Charging',
          discharging: 'Discharging',
          backup: 'Backup Mode',
          upgrading: 'OTA Upgrade',
          bypass: 'Bypass Status',
        },
      }),
    );

    // CT information
    field({
      key: 'gct_s',
      path: ['ctStatus'],
      transform: map(
        {
          '0': 'notConnected',
          '1': 'connected',
          '2': 'weakSignal',
        },
        'notConnected',
      ),
    });
    advertise(
      ['ctStatus'],
      sensorComponent<NonNullable<VenusDeviceData['ctStatus']>>({
        id: 'ct_status',
        name: 'CT Status',
        icon: 'mdi:connection',
        valueMappings: {
          notConnected: 'Not Connected',
          connected: 'Connected',
          weakSignal: 'Weak Signal',
        },
      }),
    );

    // Battery status
    field({
      key: 'cel_s',
      path: ['batteryWorkingStatus'],
      transform: map(
        {
          '1': 'notWorking',
          '2': 'charging',
          '3': 'discharging',
        },
        'unknown',
      ),
    });
    advertise(
      ['batteryWorkingStatus'],
      sensorComponent<NonNullable<VenusDeviceData['batteryWorkingStatus']>>({
        id: 'battery_working_status',
        name: 'Battery Working Status',
        icon: 'mdi:battery',
        valueMappings: {
          notWorking: 'Not Working',
          charging: 'Charging',
          discharging: 'Discharging',
          unknown: 'Unknown',
        },
      }),
    );

    // Error codes
    field({
      key: 'err_t',
      path: ['errorCode'],
      transform: number(),
    });
    advertise(
      ['errorCode'],
      sensorComponent<number>({
        id: 'error_code',
        name: 'Error Code',
        icon: 'mdi:alert-circle',
      }),
    );

    field({
      key: 'err_a',
      path: ['warningCode'],
      transform: number(),
    });
    advertise(
      ['warningCode'],
      sensorComponent<number>({
        id: 'warning_code',
        name: 'Warning Code',
        icon: 'mdi:alert',
      }),
    );

    // Device information
    field({
      key: 'dev_n',
      path: ['deviceVersion'],
      transform: number(),
    });
    advertise(
      ['deviceVersion'],
      sensorComponent<number>({
        id: 'device_version',
        name: 'Device Version',
        icon: 'mdi:information',
      }),
    );

    field({
      key: 'grd_y',
      path: ['gridType'],
      transform: map(
        {
          '0': 'adaptive',
          '1': 'en50549',
          '2': 'netherlands',
          '3': 'germany',
          '4': 'austria',
          '5': 'unitedKingdom',
          '6': 'spain',
          '7': 'poland',
          '8': 'italy',
          '9': 'china',
        },
        'adaptive',
      ),
    });
    advertise(
      ['gridType'],
      sensorComponent<NonNullable<VenusDeviceData['gridType']>>({
        id: 'grid_type',
        name: 'Grid Type',
        icon: 'mdi:transmission-tower',
        valueMappings: {
          adaptive: 'Adaptive (220-240V) (50-60Hz) AUTO',
          en50549: 'EN50549',
          netherlands: 'Netherlands',
          germany: 'Germany',
          austria: 'Austria',
          unitedKingdom: 'United Kingdom',
          spain: 'Spain',
          poland: 'Poland',
          italy: 'Italy',
          china: 'China',
        },
      }),
    );

    field({
      key: 'wor_m',
      path: ['workingMode'],
      transform: map(
        {
          '0': 'automatic',
          '1': 'manual',
          '2': 'trading',
        },
        'automatic',
      ),
    });
    advertise(
      ['workingMode'],
      selectComponent<NonNullable<VenusDeviceData['workingMode']>>({
        id: 'working_mode',
        name: 'Working Mode',
        icon: 'mdi:cog',
        command: 'working-mode',
        valueMappings: {
          automatic: 'Automatic',
          manual: 'Manual',
          trading: 'Trading',
        },
      }),
    );

    field({
      key: 'wifi_n',
      path: ['wifiName'],
      transform: identity(),
    });
    advertise(
      ['wifiName'],
      sensorComponent<string>({
        id: 'wifi_name',
        name: 'WiFi Name',
        icon: 'mdi:wifi',
      }),
    );

    field({
      key: 'api',
      path: ['localApiEnabled'],
      transform: equalsBoolean('1'),
    });
    advertise(
      ['localApiEnabled'],
      switchComponent({
        id: 'local_api_enabled',
        name: 'Local API Enabled',
        icon: 'mdi:lan',
        command: 'local-api-enabled',
      }),
      { enabled: state => (state.deviceVersion == null ? undefined : state.deviceVersion >= 153) },
    );

    field({
      key: 'port',
      path: ['localApiPort'],
      transform: number(),
    });
    advertise(
      ['localApiPort'],
      numberComponent({
        id: 'local_api_port',
        name: 'Local API Port',
        icon: 'mdi:numeric',
        command: 'local-api-port',
        min: 0,
        max: 65535,
        step: 1,
      }),
      { enabled: state => (state.deviceVersion == null ? undefined : state.deviceVersion >= 153) },
    );

    command('local-api-enabled', {
      handler: ({ message, publishCallback, updateDeviceState, deviceState }) => {
        if ((deviceState.deviceVersion ?? 0) < 153) {
          logger.warn(
            'Local API control not supported for firmware version',
            deviceState.deviceVersion,
          );
          return;
        }
        const enabled = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
        updateDeviceState(() => ({ localApiEnabled: enabled }));
        const params: CommandParams = { api: enabled ? 1 : 0 };
        if (deviceState.localApiPort != null) {
          params.port = deviceState.localApiPort;
        }
        publishCallback(processCommand(CommandType.SET_LOCAL_API, params));
      },
    });

    command('local-api-port', {
      handler: ({ message, publishCallback, updateDeviceState, deviceState }) => {
        if ((deviceState.deviceVersion ?? 0) < 153) {
          logger.warn(
            'Local API control not supported for firmware version',
            deviceState.deviceVersion,
          );
          return;
        }
        const port = parseInt(message, 10);
        if (isNaN(port) || port < 0 || port > 65535) {
          logger.warn('Invalid local API port value:', message);
          return;
        }
        updateDeviceState(() => ({ localApiPort: port }));
        const params: CommandParams = { port };
        if (deviceState.localApiEnabled != null) {
          params.api = deviceState.localApiEnabled ? 1 : 0;
        }
        publishCallback(processCommand(CommandType.SET_LOCAL_API, params));
      },
    });

    // Time periods
    for (let i = 0; i < 10; i++) {
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
          min: -2500,
          max: 2500,
          step: 1,
        }),
      );

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
    }

    // Additional settings
    field({
      key: 'cts_m',
      path: ['autoSwitchWorkingMode'],
      transform: equalsBoolean('1'),
    });
    advertise(
      ['autoSwitchWorkingMode'],
      binarySensorComponent({
        id: 'auto_switch_working_mode',
        name: 'Auto Switch Working Mode',
        icon: 'mdi:auto-fix',
      }),
    );

    field({
      key: 'set_v',
      path: ['versionSet'],
      transform: map({ '0': '800W' }, '2500W'),
    });
    advertise(
      ['versionSet'],
      selectComponent<NonNullable<VenusDeviceData['versionSet']>>({
        id: 'version_set',
        name: 'Version Set',
        icon: 'mdi:power-socket',
        command: 'version-set',
        valueMappings: {
          '800W': '800W Version',
          '2500W': '2500W Version',
        },
      }),
    );

    command('version-set', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusVersionSet(message)) {
          logger.warn('Invalid version value:', message);
          return;
        }

        updateDeviceState(() => ({
          versionSet: message,
        }));

        const version = message === '2500W' ? 2500 : 800;
        publishCallback(processCommand(CommandType.SET_DISCHARGE_POWER, { vs: version }));
      },
    });

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

    command('factory-reset', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          // rs=1 restores factory settings and clears accumulated data
          // rs=2 restores factory settings without clearing accumulated data
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

    command('get-ct-power', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback(processCommand(CommandType.GET_CT_POWER));
        }
      },
    });
    advertise(
      [],
      buttonComponent({
        id: 'get_ct_power',
        name: 'Get CT Power',
        icon: 'mdi:current-ac',
        command: 'get-ct-power',
        payload_press: 'PRESS',
        enabled_by_default: false,
      }),
    );

    // Time period settings
    for (let i = 0; i < 10; i++) {
      const periodIndex = i;

      command(`time-period/${i}/enabled`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          const enabled = message.toLowerCase() === 'true' || message === '1' || message === 'ON';

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              logger.warn(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              enabled,
            };

            // Build the command parameters
            const params: CommandParams = { md: 1, nm: periodIndex };
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

      command(`time-period/${i}/start-time`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          // Validate time format (HH:MM)
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            logger.warn('Invalid start time format (should be HH:MM):', message);
            return;
          }

          const [hours, minutes] = message.split(':').map(part => parseInt(part, 10));

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              logger.warn(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              startTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
            };

            // Build the command parameters
            const params: CommandParams = { md: 1, nm: periodIndex };
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

      command(`time-period/${i}/end-time`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          // Validate time format (HH:MM)
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            logger.warn('Invalid end time format (should be HH:MM):', message);
            return;
          }

          const [hours, minutes] = message.split(':').map(part => parseInt(part, 10));

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              logger.warn(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              endTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
            };

            // Build the command parameters
            const params: CommandParams = { md: 1, nm: periodIndex };
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

      command(`time-period/${i}/power`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          const power = parseInt(message, 10);
          if (isNaN(power)) {
            logger.warn('Invalid power value:', message);
            return;
          }

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              logger.error(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              power,
            };

            // Build the command parameters
            const params: CommandParams = { md: 1, nm: periodIndex };
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

      command(`time-period/${i}/weekday`, {
        handler: ({ updateDeviceState, message, publishCallback }) => {
          if (!/^[0-6]*$/.test(message)) {
            logger.warn(
              'Invalid weekday value (should be a string only consisting of numbers 0-6):',
              message,
            );
            return;
          }
          const weekday = weekdaySetToBitMask(message as WeekdaySet);

          updateDeviceState(state => {
            if (!state.timePeriods || !state.timePeriods[periodIndex]) {
              logger.warn(`Time period ${periodIndex} not found in device state`);
              return;
            }

            const timePeriods = [...(state.timePeriods || [])];
            timePeriods[periodIndex] = {
              ...timePeriods[periodIndex],
              weekday: bitMaskToWeekdaySet(weekday),
            };

            // Build the command parameters
            const params: CommandParams = { md: 1, nm: periodIndex };
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

    // Transaction mode settings
    command('transaction-mode', {
      handler: ({ message, publishCallback }) => {
        try {
          const params = JSON.parse(message);
          if (!params.id || !params.in || !params.on) {
            logger.error('Missing transaction mode parameters:', message);
            return;
          }

          publishCallback(
            processCommand(CommandType.SET_TIME_PERIOD, {
              md: 2,
              id: params.id,
              in: params.in,
              on: params.on,
            }),
          );
        } catch (error) {
          logger.warn('Invalid transaction mode data:', message, error);
        }
      },
    });

    command('working-mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusWorkingMode(message)) {
          logger.warn('Invalid working mode value:', message);
          return;
        }

        updateDeviceState(() => ({
          workingMode: message,
        }));

        let mode: number;
        switch (message) {
          case 'automatic':
            mode = 0;
            break;
          case 'manual':
            mode = 1;
            break;
          case 'trading':
            mode = 2;
            break;
          default:
            mode = 0;
        }

        publishCallback(processCommand(CommandType.SET_WORKING_MODE, { md: mode }));
      },
    });

    field({
      key: 'mdp_w',
      path: ['maxDischargePower'],
      transform: number(),
    });
    advertise(
      ['maxDischargePower'],
      numberComponent({
        id: 'max_discharge_power',
        name: 'Maximum Discharge Power',
        icon: 'mdi:flash',
        unit_of_measurement: 'W',
        command: 'max-discharge-power',
        min: 0,
        max: 2500,
        step: 1,
      }),
    );

    command('max-discharge-power', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const power = parseInt(message, 10);
        if (isNaN(power) || power < 0 || power > 2500) {
          logger.warn('Invalid maximum discharge power value:', message);
          return;
        }

        updateDeviceState(() => ({
          maxDischargePower: power,
        }));

        publishCallback(processCommand(CommandType.SET_DISCHARGE_POWER, { vs: power }));
      },
    });

    field({
      key: 'mcp_w',
      path: ['maxChargingPower'],
      transform: chain(number(), inRange(0, 2500)),
    });
    advertise(
      ['maxChargingPower'],
      numberComponent({
        id: 'max_charging_power',
        name: 'Maximum Charging Power',
        icon: 'mdi:flash',
        unit_of_measurement: 'W',
        command: 'max-charging-power',
        min: 0,
        max: 2500,
        step: 1,
      }),
    );

    command('max-charging-power', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const power = parseInt(message, 10);
        if (isNaN(power) || power < 0 || power > 2500) {
          logger.warn('Invalid maximum charging power value:', message);
          return;
        }

        updateDeviceState(() => ({
          maxChargingPower: power,
        }));

        publishCallback(processCommand(CommandType.SET_MAX_CHARGING_POWER, { cp: power }));
      },
    });
  });
}

const requiredBMSFields = ['b_ver', 'b_soc', 'b_tp1', 'b_vo1'];

function isVenusBmsInfoMessage(values: Record<string, string>): boolean {
  return requiredBMSFields.every(field => field in values);
}
function registerBMSInfoMessage(message: BuildMessageFn) {
  message<VenusBMSInfo>(
    {
      refreshDataPayload: `cd=${CommandType.GET_BMS_INFO}`,
      isMessage: isVenusBmsInfoMessage,
      publishPath: 'bms',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 60000,
      controlsDeviceAvailability: false,
      enabled: process.env.POLL_CELL_DATA === 'true',
    },
    ({ field, advertise }) => {
      for (let i = 1; i <= 16; i++) {
        const key = `b_vo${i}`;
        field({ key, path: ['cells', 'voltages', i - 1] });
        advertise(
          ['cells', 'voltages', i - 1],
          sensorComponent<number>({
            id: `cell_voltage_${i}`,
            name: `Cell Voltage ${i}`,
            unit_of_measurement: 'mV',
            device_class: 'voltage',
            enabled_by_default: false,
          }),
        );
      }

      for (let i = 1; i <= 4; i++) {
        const key = `b_tp${i}`;
        field({ key, path: ['cells', 'temperatures', i - 1] });
        advertise(
          ['cells', 'temperatures', i - 1],
          sensorComponent<number>({
            id: `cell_temperature_${i}`,
            name: `Cell Temperature ${i}`,
            unit_of_measurement: '°C',
            device_class: 'temperature',
            enabled_by_default: false,
          }),
        );
      }

      const bmsFields = [
        ['b_ver', { id: 'version' }],
        ['b_soc', { id: 'soc' }],
        ['b_soh', { id: 'soh' }],
        ['b_cap', { id: 'capacity' }],
        ['b_vol', { id: 'voltage', deviceClass: 'voltage', unitOfMeasurement: 'V' }],
        ['b_cur', { id: 'current', deviceClass: 'current', unitOfMeasurement: 'mA' }],
        ['b_tem', { id: 'temperature', deviceClass: 'temperature', unitOfMeasurement: '°C' }],
        ['b_chv', { id: 'chargeVoltage', deviceClass: 'voltage', unitOfMeasurement: 'V' }],
        ['b_chf', { id: 'fullChargeCapacity' }],
        ['b_cpc', { id: 'cellCycle' }],
        ['b_err', { id: 'error' }],
        ['b_war', { id: 'warning' }],
        ['b_ret', { id: 'totalRuntime' }],
        ['b_ent', { id: 'energyThroughput' }],
        ['b_mot', { id: 'mosfetTemp', deviceClass: 'temperature', unitOfMeasurement: '°C' }],
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
