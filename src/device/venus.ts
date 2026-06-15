import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import {
  CommandParams,
  isValidMeterType,
  isValidVenusRechargeMode,
  isValidVenusVersionSet,
  isValidVenusWorkingMode,
  meterTypeCommandCodes,
  meterTypeLabels,
  normalizeMeterMac,
  resolveMeterMac,
  VenusBMSInfo,
  VenusBMSPackInfo,
  VenusBMSPackDetail,
  VenusDeviceData,
  VenusNetworkInfo,
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
  bitBoolean,
  chain,
  inRange,
  sum,
  min,
  max,
  diff,
  average,
  negate,
  venusPvField,
  pipeValue,
  pipeArray,
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
  SET_METER_TYPE = 18, // also used for phase diagnosis via `cd=18,seq_check`
  GET_CT_POWER = 19,
  UPGRADE_FC4_MODULE = 20,
  GET_NETWORK_INFO = 26,
  SET_LOCAL_API = 30,
  GET_BMS_PACK_INFO = 42,
  SURPLUS_FEED_IN = 43,
  BLUETOOTH_ADVERTISING = 55,
  DEPTH_OF_DISCHARGE = 56,
  SET_LED = 59,
}

// Minimum and maximum Depth of Discharge values based on Marstek app limits (30-88%).
// NOTE: Experience has shown that these limits may change over time!
const DOD_MIN = 30;
const DOD_MAX = 88;

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

// Max number of detailed slave packs polled via cd=42,bms_idx=N (packs 2..6 at
// bms_idx 1..5; pack 1 = master, whose cells come from cd=14).
const MAX_BMS_PACK_DETAILS = 5;

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

// Per-string PV input power (PV1–PV4) is reported by Venus models that have PV
// inputs (e.g. Venus A/D). The corresponding entities are advertised purely
// based on whether the device reports the `pv1`–`pv4` fields in its payload, so
// there is no need to special-case device types here.
registerDeviceDefinition(
  {
    deviceTypes: ['HMG', 'VNSE3'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerBMSInfoMessage(message);
    registerBMSPackMessage(message);
    registerBMSPackDetailMessages(message);
    registerNetworkInfoMessage(message);
  },
);

// Venus A (VNSA) and Venus D (VNSD) use a different scaling for the BMS
// cell/MOSFET temperatures (factor of 10) compared to the other Venus variants.
registerDeviceDefinition(
  {
    deviceTypes: ['VNSA', 'VNSD'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerBMSInfoMessage(message, { scaleTemperatures: true });
    registerBMSPackMessage(message, { scaleTemperatures: true });
    registerBMSPackDetailMessages(message, { scaleTemperatures: true });
    registerNetworkInfoMessage(message);
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
        state_class: 'measurement',
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
        state_class: 'measurement',
      }),
    );

    // PV / solar input information. Only Venus models with PV inputs (e.g.
    // Venus A/D) report the pvN fields; the entities below are advertised purely
    // based on their presence in the payload, so they apply to any device type.
    // Per-string PV input power and connection status (pvN = "<power>|<connected>")
    const pvInputs = [
      { key: 'pv1', power: 'pv1Power', connected: 'pv1Connected', label: 'PV1' },
      { key: 'pv2', power: 'pv2Power', connected: 'pv2Connected', label: 'PV2' },
      { key: 'pv3', power: 'pv3Power', connected: 'pv3Connected', label: 'PV3' },
      { key: 'pv4', power: 'pv4Power', connected: 'pv4Connected', label: 'PV4' },
    ] as const;
    for (const pv of pvInputs) {
      field({ key: pv.key, path: [pv.power], transform: venusPvField('power') });
      advertise(
        [pv.power],
        sensorComponent<number>({
          id: `${pv.key}_power`,
          name: `${pv.label} Power`,
          device_class: 'power',
          unit_of_measurement: 'W',
          state_class: 'measurement',
        }),
        { enabled: state => (state[pv.power] != null ? true : undefined) },
      );

      field({ key: pv.key, path: [pv.connected], transform: venusPvField('connected') });
      advertise(
        [pv.connected],
        binarySensorComponent({
          id: `${pv.key}_connected`,
          name: `${pv.label} Connected`,
          device_class: 'connectivity',
          icon: 'mdi:solar-power',
          enabled_by_default: false,
        }),
        { enabled: state => (state[pv.connected] != null ? true : undefined) },
      );
    }

    // Total PV power across all inputs. Each value is "<power>|<connected>"
    // with power in deciwatts; sum() reads the leading number from each and
    // the scale converts the deciwatt total to watts.
    field({
      key: ['pv1', 'pv2', 'pv3', 'pv4'],
      path: ['totalPvPower'],
      transform: sum(10),
    });
    advertise(
      ['totalPvPower'],
      sensorComponent<number>({
        id: 'total_pv_power',
        name: 'Total PV Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
      { enabled: state => (state.totalPvPower != null ? true : undefined) },
    );

    // PV energy. The `pv` field holds pipe-separated values in Wh: today's
    // collected PV energy first and the cumulative total last. The total is read
    // from the last component so additional values (e.g. monthly/yearly) being
    // inserted before it would not break the mapping.
    field({
      key: 'pv',
      path: ['pvEnergyToday'],
      transform: pipeValue(0),
    });
    advertise(
      ['pvEnergyToday'],
      sensorComponent<number>({
        id: 'pv_energy_today',
        name: 'PV Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
      { enabled: state => (state.pvEnergyToday != null ? true : undefined) },
    );

    field({
      key: 'pv',
      path: ['pvEnergyTotal'],
      transform: pipeValue(-1),
      monotonic: true,
    });
    advertise(
      ['pvEnergyTotal'],
      sensorComponent<number>({
        id: 'pv_energy_total',
        name: 'PV Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
      { enabled: state => (state.pvEnergyTotal != null ? true : undefined) },
    );

    // Power information
    field({
      key: 'tot_i',
      path: ['totalChargingCapacity'],
      transform: divide(100), // Convert to kWh
      monotonic: true,
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
      monotonic: true,
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
      monotonic: true,
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
      monotonic: true,
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
      monotonic: true,
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
      monotonic: true,
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

    // Electricity prices. Reported in the same 0.001 € unit as the income
    // fields, so the value is divided by 1000 to convert it to euros.
    field({
      key: 'prc_c',
      path: ['chargingPrice'],
      transform: divide(1000),
    });
    advertise(
      ['chargingPrice'],
      sensorComponent<number>({
        id: 'charging_price',
        name: 'Charging Price',
        device_class: 'monetary',
        unit_of_measurement: '€',
      }),
    );

    field({
      key: 'prc_d',
      path: ['dischargePrice'],
      transform: divide(1000),
    });
    advertise(
      ['dischargePrice'],
      sensorComponent<number>({
        id: 'discharge_price',
        name: 'Discharge Price',
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
        state_class: 'measurement',
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

    field({
      key: 'ct_t',
      path: ['ctType'],
      transform: map(
        {
          '0': 'none',
          '1': 'ct1',
          '2': 'ct2',
          '3': 'ct3',
          '4': 'shellyPro',
          '5': 'p1Meter',
        },
        'none',
      ),
    });
    advertise(
      ['ctType'],
      sensorComponent<NonNullable<VenusDeviceData['ctType']>>({
        id: 'ct_type',
        name: 'CT Type',
        icon: 'mdi:current-ac',
        valueMappings: {
          none: 'No Meter Detected',
          ct1: 'CT1',
          ct2: 'CT2',
          ct3: 'CT3',
          shellyPro: 'Shelly Pro',
          p1Meter: 'P1 Meter',
        },
      }),
    );

    // Shelly UDP port, only meaningful when a Shelly meter is configured as the
    // CT type.
    field({
      key: 'shelly_p',
      path: ['shellyPort'],
      transform: number(),
    });
    advertise(
      ['shellyPort'],
      sensorComponent<number>({
        id: 'shelly_port',
        name: 'Shelly Port',
        icon: 'mdi:lan',
        enabled_by_default: false,
      }),
    );

    field({
      key: 'phase_t',
      path: ['phaseType'],
      transform: map(
        {
          '0': 'unknown',
          '1': 'phaseA',
          '2': 'phaseB',
          '3': 'phaseC',
          '4': 'notDetected',
        },
        'unknown',
      ),
    });
    advertise(
      ['phaseType'],
      sensorComponent<NonNullable<VenusDeviceData['phaseType']>>({
        id: 'phase_type',
        name: 'Phase Type',
        icon: 'mdi:sine-wave',
        valueMappings: {
          unknown: 'Unknown',
          phaseA: 'Phase A',
          phaseB: 'Phase B',
          phaseC: 'Phase C',
          notDetected: 'Not Detected',
        },
      }),
    );

    field({
      key: 'dchrg_t',
      path: ['rechargeMode'],
      transform: map(
        {
          '0': 'singlePhase',
          '1': 'threePhase',
        },
        'singlePhase',
      ),
    });
    advertise(
      ['rechargeMode'],
      selectComponent<NonNullable<VenusDeviceData['rechargeMode']>>({
        id: 'recharge_mode',
        name: 'Recharge Mode',
        icon: 'mdi:flash',
        command: 'recharge-mode',
        valueMappings: {
          singlePhase: 'Single Phase',
          threePhase: 'Three Phase',
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
      key: 'bms_v',
      path: ['bmsVersion'],
      transform: number(),
    });
    advertise(
      ['bmsVersion'],
      sensorComponent<number>({
        id: 'bms_version',
        name: 'BMS Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
    );

    field({
      key: 'fc_v',
      path: ['communicationModuleVersion'],
      transform: identity(),
    });
    advertise(
      ['communicationModuleVersion'],
      sensorComponent<string>({
        id: 'communication_module_version',
        name: 'Communication Module Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
    );

    field({
      key: 'wif_s',
      path: ['wifiSignalStrength'],
      transform: negate(),
    });
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
          '5': 'ai',
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
          ai: 'AI',
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

    // Backup / EPS ("UPS mode") function (cd=11). The current state is reported
    // as the bac_u field.
    field({
      key: 'bac_u',
      path: ['backupEnabled'],
      transform: equalsBoolean('1'),
    });
    advertise(
      ['backupEnabled'],
      switchComponent({
        id: 'backup_enabled',
        name: 'Backup Power',
        icon: 'mdi:home-battery',
        command: 'backup-enabled',
      }),
    );
    command('backup-enabled', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enabled = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
        updateDeviceState(() => ({ backupEnabled: enabled }));
        publishCallback(processCommand(CommandType.ENABLE_BACKUP, { bc: enabled ? 1 : 0 }));
      },
    });

    // Status LED (cd=59). Reported as the led field on newer firmware (e.g. v147).
    field({
      key: 'led',
      path: ['ledEnabled'],
      transform: equalsBoolean('1'),
    });
    advertise(
      ['ledEnabled'],
      switchComponent({
        id: 'led_enabled',
        name: 'Status LED',
        icon: 'mdi:led-on',
        command: 'led-enabled',
      }),
      { enabled: state => (state.ledEnabled != null ? true : undefined) },
    );
    command('led-enabled', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enabled = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
        updateDeviceState(() => ({ ledEnabled: enabled }));
        publishCallback(processCommand(CommandType.SET_LED, { led: enabled ? 1 : 0 }));
      },
    });

    // Surplus feed-in (cd=43, feeding excess PV power into the grid). The current
    // state is reported in the first component of the `fu` field ("1|0" = on,
    // "0|0" = off). The optimistic update in the command handler gives immediate
    // feedback until the next cd=1 poll reconciles with the device.
    field({
      key: 'fu',
      path: ['surplusFeedInEnabled'],
      transform: chain(pipeValue(0), equalsBoolean('1')),
    });
    advertise(
      ['surplusFeedInEnabled'],
      switchComponent({
        id: 'surplus_feed_in',
        name: 'Surplus Feed-in',
        icon: 'mdi:transmission-tower-export',
        command: 'surplus-feed-in',
      }),
      { enabled: state => (state.surplusFeedInEnabled != null ? true : undefined) },
    );
    command('surplus-feed-in', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable =
          message.toLowerCase() === 'true' || message.toLowerCase() === 'on' || message === '1';
        updateDeviceState(() => ({ surplusFeedInEnabled: enable }));
        publishCallback(processCommand(CommandType.SURPLUS_FEED_IN, { full_d: enable ? 1 : 0 }));
      },
    });

    // Bluetooth advertising / "lock" (cd=55, adv=1 enables advertising, adv=0
    // disables it). The state is reported in the `ble` field as a bitmask where
    // bit 2 (value 4) is set when advertising is enabled (Bluetooth lock off).
    // The optimistic update in the command handler gives immediate feedback
    // until the next cd=1 poll reconciles with the device.
    field({
      key: 'ble',
      path: ['bluetoothAdvertisingEnabled'],
      transform: bitBoolean(2),
    });
    advertise(
      ['bluetoothAdvertisingEnabled'],
      switchComponent({
        id: 'bluetooth_advertising',
        name: 'Bluetooth Advertising',
        icon: 'mdi:bluetooth',
        command: 'bluetooth-advertising',
      }),
      { enabled: state => (state.bluetoothAdvertisingEnabled != null ? true : undefined) },
    );
    command('bluetooth-advertising', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable =
          message.toLowerCase() === 'true' || message.toLowerCase() === 'on' || message === '1';
        updateDeviceState(() => ({ bluetoothAdvertisingEnabled: enable }));
        publishCallback(processCommand(CommandType.BLUETOOTH_ADVERTISING, { adv: enable ? 1 : 0 }));
      },
    });

    // Inverter / micro module version (inv_v), reported on newer firmware.
    field({
      key: 'inv_v',
      path: ['inverterVersion'],
      transform: number(),
    });
    advertise(
      ['inverterVersion'],
      sensorComponent<number>({
        id: 'inverter_version',
        name: 'Inverter Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
      { enabled: state => (state.inverterVersion != null ? true : undefined) },
    );

    // MPPT module version (mppt), reported on newer firmware.
    field({
      key: 'mppt',
      path: ['mpptVersion'],
      transform: number(),
    });
    advertise(
      ['mpptVersion'],
      sensorComponent<number>({
        id: 'mppt_version',
        name: 'MPPT Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
      { enabled: state => (state.mpptVersion != null ? true : undefined) },
    );

    // Phase-diagnosis status (seq_s) and the button that starts the diagnosis
    // (cd=18,seq_check). The meaning of the status value is unconfirmed.
    field({
      key: 'seq_s',
      path: ['phaseDiagnosisStatus'],
      transform: number(),
    });
    advertise(
      ['phaseDiagnosisStatus'],
      sensorComponent<number>({
        id: 'phase_diagnosis_status',
        name: 'Phase Diagnosis Status',
        icon: 'mdi:sine-wave',
        enabled_by_default: false,
      }),
      { enabled: state => (state.phaseDiagnosisStatus != null ? true : undefined) },
    );
    command('phase-diagnosis', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          // The seq_check flag is sent without a value, i.e. `cd=18,seq_check`.
          publishCallback(`cd=${CommandType.SET_METER_TYPE},seq_check`);
        }
      },
    });
    advertise(
      [],
      buttonComponent({
        id: 'phase_diagnosis',
        name: 'Phase Diagnosis',
        icon: 'mdi:sine-wave',
        command: 'phase-diagnosis',
        payload_press: 'PRESS',
        enabled_by_default: false,
      }),
    );

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
          case 'ai':
            mode = 5;
            break;
          default:
            mode = 0;
        }

        const params: CommandParams = { md: mode };
        // AI mode additionally requires the nl flag to be enabled
        if (message === 'ai') {
          params.nl = 1;
        }
        publishCallback(processCommand(CommandType.SET_WORKING_MODE, params));
      },
    });

    command('recharge-mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusRechargeMode(message)) {
          logger.warn('Invalid recharge mode value:', message);
          return;
        }

        updateDeviceState(() => ({
          rechargeMode: message,
        }));

        publishCallback(
          processCommand(CommandType.SET_METER_TYPE, {
            dchrg: message === 'threePhase' ? 1 : 0,
          }),
        );
      },
    });

    // MAC address used when configuring an external meter (CT002/CT003/Shelly).
    command('meter-mac', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const mac = normalizeMeterMac(message);
        if (!mac) {
          logger.warn('Invalid meter MAC (expected 12 hex digits):', message);
          return;
        }
        updateDeviceState(state => {
          // If a meter type is already configured, re-apply it with the new MAC
          // so the device stays in sync when the MAC is edited afterwards.
          if (state.meterType) {
            const resolved = resolveMeterMac(state.meterType, mac);
            if (resolved !== null) {
              publishCallback(
                processCommand(CommandType.SET_METER_TYPE, {
                  meter: meterTypeCommandCodes[state.meterType],
                  mac: resolved,
                }),
              );
            }
          }
          return { meterMac: mac };
        });
      },
    });
    advertise(
      ['meterMac'],
      textComponent({
        id: 'meter_mac',
        name: 'Meter MAC',
        icon: 'mdi:identifier',
        command: 'meter-mac',
        // The device uses a plain 12 hex digit MAC without ':'/'-' separators.
        pattern: '^[0-9A-Fa-f]{12}$',
        enabled_by_default: false,
      }),
    );

    // Configure the external meter type (cd=18,meter=...,mac=...).
    command('meter-type', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidMeterType(message)) {
          logger.warn('Invalid meter type value:', message);
          return;
        }
        updateDeviceState(state => {
          const mac = resolveMeterMac(message, state.meterMac);
          if (mac === null) {
            logger.warn(
              `Meter type ${message} requires a MAC; set the "Meter MAC" entity before selecting it`,
            );
            return;
          }
          publishCallback(
            processCommand(CommandType.SET_METER_TYPE, {
              meter: meterTypeCommandCodes[message],
              mac,
            }),
          );
          return { meterType: message };
        });
      },
    });
    advertise(
      ['meterType'],
      selectComponent<NonNullable<VenusDeviceData['meterType']>>({
        id: 'meter_type',
        name: 'Meter Type',
        icon: 'mdi:meter-electric',
        command: 'meter-type',
        valueMappings: meterTypeLabels,
        enabled_by_default: false,
      }),
    );

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

    // Depth of Discharge (dod). The device reports the actual percentage; values
    // outside the valid range are treated as unknown. The maximum is encoded as 0
    // only in the write direction (see the discharge-depth command below).
    field({
      key: 'dod',
      path: ['depthOfDischarge'],
      transform: chain(number(), inRange(DOD_MIN, DOD_MAX)),
    });
    advertise(
      ['depthOfDischarge'],
      numberComponent({
        id: 'depth_of_discharge',
        name: 'Depth of Discharge',
        unit_of_measurement: '%',
        device_class: 'battery',
        command: 'discharge-depth',
        min: DOD_MIN,
        max: DOD_MAX,
        step: 1,
      }),
      { enabled: state => (state.depthOfDischarge != null ? true : undefined) },
    );
    command('discharge-depth', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        // Require an exact integer payload (reject e.g. "88foo", "30.5", "", " 70 ").
        const dod = /^\d+$/.test(message) ? parseInt(message, 10) : NaN;
        if (Number.isNaN(dod) || dod < DOD_MIN || dod > DOD_MAX) {
          logger.warn(
            `Invalid depth of discharge value (should be ${DOD_MIN}-${DOD_MAX}):`,
            message,
          );
          return;
        }
        updateDeviceState(() => ({ depthOfDischarge: dod }));
        // The device expects the maximum depth of discharge (DOD_MAX) to be sent as 0.
        const dodValue = dod >= DOD_MAX ? 0 : dod;
        publishCallback(processCommand(CommandType.DEPTH_OF_DISCHARGE, { dod: dodValue }));
      },
    });
  });
}

const requiredBMSFields = ['b_ver', 'b_soc', 'b_tp1', 'b_vo1'];

function isVenusBmsInfoMessage(values: Record<string, string>): boolean {
  return requiredBMSFields.every(field => field in values);
}
function registerBMSInfoMessage(
  message: BuildMessageFn,
  { scaleTemperatures = false }: { scaleTemperatures?: boolean } = {},
) {
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
            state_class: 'measurement',
            enabled_by_default: false,
          }),
        );
      }

      // Aggregate cell voltage statistics across all cells (b_vo1-b_vo16).
      // Unused cells on smaller batteries report 0, so they are ignored.
      const cellVoltageKeys = Array.from({ length: 16 }, (_, i) => `b_vo${i + 1}`);
      field({
        key: cellVoltageKeys,
        path: ['cells', 'minVoltage'],
        transform: min(undefined, true),
      });
      advertise(
        ['cells', 'minVoltage'],
        sensorComponent<number>({
          id: 'min_cell_voltage',
          name: 'Min Cell Voltage',
          unit_of_measurement: 'mV',
          device_class: 'voltage',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );
      field({
        key: cellVoltageKeys,
        path: ['cells', 'maxVoltage'],
        transform: max(undefined, true),
      });
      advertise(
        ['cells', 'maxVoltage'],
        sensorComponent<number>({
          id: 'max_cell_voltage',
          name: 'Max Cell Voltage',
          unit_of_measurement: 'mV',
          device_class: 'voltage',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );
      field({
        key: cellVoltageKeys,
        path: ['cells', 'voltageDiff'],
        transform: diff(undefined, true),
      });
      advertise(
        ['cells', 'voltageDiff'],
        sensorComponent<number>({
          id: 'diff_cell_voltage',
          name: 'Cell Voltage Difference',
          unit_of_measurement: 'mV',
          device_class: 'voltage',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );
      field({
        key: cellVoltageKeys,
        path: ['cells', 'voltageAvg'],
        transform: average(undefined, true, true),
      });
      advertise(
        ['cells', 'voltageAvg'],
        sensorComponent<number>({
          id: 'avg_cell_voltage',
          name: 'Average Cell Voltage',
          unit_of_measurement: 'mV',
          device_class: 'voltage',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );

      for (let i = 1; i <= 4; i++) {
        const key = `b_tp${i}`;
        field({
          key,
          path: ['cells', 'temperatures', i - 1],
          transform: scaleTemperatures ? divide(10) : undefined,
        });
        advertise(
          ['cells', 'temperatures', i - 1],
          sensorComponent<number>({
            id: `cell_temperature_${i}`,
            name: `Cell Temperature ${i}`,
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
        );
      }

      const bmsFields = [
        ['b_ver', { id: 'version' }],
        ['b_soc', { id: 'soc' }],
        ['b_soh', { id: 'soh' }],
        ['b_cap', { id: 'capacity' }],
        // Battery pack voltage is reported in centivolts (e.g. 4328 -> 43.28 V)
        [
          'b_vol',
          {
            id: 'voltage',
            deviceClass: 'voltage',
            unitOfMeasurement: 'V',
            transform: divide(100),
            stateClass: 'measurement',
          },
        ],
        [
          'b_cur',
          {
            id: 'current',
            deviceClass: 'current',
            unitOfMeasurement: 'mA',
            stateClass: 'measurement',
          },
        ],
        [
          'b_tem',
          {
            id: 'temperature',
            deviceClass: 'temperature',
            unitOfMeasurement: '°C',
            stateClass: 'measurement',
          },
        ],
        // Charge voltage is reported in decivolts (e.g. 468 -> 46.8 V)
        [
          'b_chv',
          {
            id: 'chargeVoltage',
            deviceClass: 'voltage',
            unitOfMeasurement: 'V',
            transform: divide(10),
            stateClass: 'measurement',
          },
        ],
        ['b_chf', { id: 'fullChargeCapacity' }],
        ['b_cpc', { id: 'cellCycle' }],
        ['b_err', { id: 'error' }],
        ['b_war', { id: 'warning' }],
        ['b_ret', { id: 'totalRuntime' }],
        ['b_ent', { id: 'energyThroughput' }],
        [
          'b_mot',
          {
            id: 'mosfetTemp',
            deviceClass: 'temperature',
            unitOfMeasurement: '°C',
            transform: scaleTemperatures ? divide(10) : undefined,
            stateClass: 'measurement',
          },
        ],
      ] as const;

      for (const [key, info] of bmsFields) {
        field({
          key,
          path: ['bms', info.id],
          transform: 'transform' in info ? info.transform : undefined,
        });
        advertise(
          ['bms', info.id],
          sensorComponent<number>({
            id: info.id,
            name: `BMS ${info.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
            unit_of_measurement: 'unitOfMeasurement' in info ? info.unitOfMeasurement : undefined,
            device_class: 'deviceClass' in info ? info.deviceClass : undefined,
            state_class: 'stateClass' in info ? info.stateClass : undefined,
            enabled_by_default: false,
          }),
        );
      }
    },
  );
}

// The cd=42 response carries per-pack BMS details. It is parsed from the
// standard key=value pairs (charge_pow, discharge_pow, mask, socN/stateN/tempN);
// only the leading "BMS: num" token uses a non-standard format and is ignored.
function isVenusBmsPackMessage(values: Record<string, string>): boolean {
  return 'charge_pow' in values && 'soc1' in values;
}

function registerBMSPackMessage(
  message: BuildMessageFn,
  { scaleTemperatures = false }: { scaleTemperatures?: boolean } = {},
) {
  message<VenusBMSPackInfo>(
    {
      refreshDataPayload: `cd=${CommandType.GET_BMS_PACK_INFO},bms_idx=255`,
      isMessage: isVenusBmsPackMessage,
      publishPath: 'bmsPacks',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 60000,
      controlsDeviceAvailability: false,
      // Gated behind the same flag as the detailed BMS data to avoid extra
      // polling traffic by default.
      enabled: process.env.POLL_CELL_DATA === 'true',
    },
    ({ field, advertise }) => {
      field({ key: 'mask', path: ['packMask'], transform: number() });

      field({ key: 'charge_pow', path: ['chargePower'], transform: number() });
      advertise(
        ['chargePower'],
        sensorComponent<number>({
          id: 'pack_charge_power',
          name: 'Pack Charge Power',
          device_class: 'power',
          unit_of_measurement: 'W',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );

      field({ key: 'discharge_pow', path: ['dischargePower'], transform: number() });
      advertise(
        ['dischargePower'],
        sensorComponent<number>({
          id: 'pack_discharge_power',
          name: 'Pack Discharge Power',
          device_class: 'power',
          unit_of_measurement: 'W',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
      );

      // Per-pack details (up to 6 packs). Each pack is only advertised when its
      // bit is set in the present-pack bitmask. SoC and temperature are reported
      // in 0.1 units; the temperature scaling mirrors the detailed BMS message.
      for (let i = 1; i <= 6; i++) {
        const packEnabled = (state: VenusBMSPackInfo) =>
          state.packMask == null ? undefined : (state.packMask & (1 << (i - 1))) !== 0;

        field({ key: `soc${i}`, path: ['packs', i - 1, 'soc'], transform: divide(10) });
        advertise(
          ['packs', i - 1, 'soc'],
          sensorComponent<number>({
            id: `pack_${i}_soc`,
            name: `Pack ${i} State of Charge`,
            device_class: 'battery',
            unit_of_measurement: '%',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: packEnabled },
        );

        field({ key: `state${i}`, path: ['packs', i - 1, 'state'], transform: number() });
        advertise(
          ['packs', i - 1, 'state'],
          sensorComponent<number>({
            id: `pack_${i}_state`,
            name: `Pack ${i} State`,
            icon: 'mdi:battery',
            enabled_by_default: false,
          }),
          { enabled: packEnabled },
        );

        field({
          key: `temp${i}`,
          path: ['packs', i - 1, 'temperature'],
          transform: scaleTemperatures ? divide(10) : number(),
        });
        advertise(
          ['packs', i - 1, 'temperature'],
          sensorComponent<number>({
            id: `pack_${i}_temperature`,
            name: `Pack ${i} Temperature`,
            device_class: 'temperature',
            unit_of_measurement: '°C',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: packEnabled },
        );
      }
    },
  );
}

// The cd=42,bms_idx=N response (N >= 1) carries detailed per-pack BMS data,
// including individual cell voltages and temperature sensors. bms_idx=N maps to
// pack N+1 (bms_idx=1 is the first slave pack, i.e. "Pack 2"); the master pack's
// cells are reported via the cd=14 BMS-info message instead. Each pack is only
// polled when its present-pack bit is set in the cd=42 summary's packMask, so no
// requests are wasted on absent packs.

// The leading "BMS(N): num" token is tokenized by the parser into the key
// " BMS(N): num"; combined with the pipe-separated b_vol array this uniquely
// identifies a detailed per-pack response.
function isVenusBmsPackDetailMessage(bmsIdx: number) {
  const marker = ` BMS(${bmsIdx}): num`;
  return (values: Record<string, string>): boolean => marker in values && 'b_vol' in values;
}

function registerBMSPackDetailMessages(
  message: BuildMessageFn,
  { scaleTemperatures = false }: { scaleTemperatures?: boolean } = {},
) {
  for (let bmsIdx = 1; bmsIdx <= MAX_BMS_PACK_DETAILS; bmsIdx++) {
    registerBMSPackDetailMessage(message, bmsIdx, { scaleTemperatures });
  }
}

function registerBMSPackDetailMessage(
  message: BuildMessageFn,
  bmsIdx: number,
  { scaleTemperatures = false }: { scaleTemperatures?: boolean } = {},
) {
  const packNumber = bmsIdx + 1;
  // Temperatures are reported in 0.1 units on Venus A/D, like the other messages.
  const tempScalar = scaleTemperatures ? divide(10) : number();
  const tempArray = scaleTemperatures ? pipeArray(10) : pipeArray();

  message<VenusBMSPackDetail>(
    {
      refreshDataPayload: `cd=${CommandType.GET_BMS_PACK_INFO},bms_idx=${bmsIdx}`,
      isMessage: isVenusBmsPackDetailMessage(bmsIdx),
      publishPath: `bmsPack${bmsIdx}`,
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 60000,
      controlsDeviceAvailability: false,
      // Gated behind the same flag as the other detailed BMS data.
      enabled: process.env.POLL_CELL_DATA === 'true',
      // Only poll this pack when its present-pack bit is set in the summary's
      // packMask (bms_idx=N -> pack N+1 -> bit N). Avoids polling absent packs.
      shouldPoll: state => {
        const mask = (state as VenusBMSPackInfo).packMask;
        return mask != null && (mask & (1 << bmsIdx)) !== 0;
      },
    },
    ({ field, advertise }) => {
      // 16 individual cell voltages (mV). The wire format groups cells in fours
      // separated by "-", e.g. "3330|3330|3330|3330|-|3330|...".
      field({ key: 'b_vol', path: ['cellVoltages'], transform: pipeArray() });
      for (let i = 0; i < 16; i++) {
        advertise(
          ['cellVoltages', i],
          sensorComponent<number>({
            id: `pack_${packNumber}_cell_voltage_${i + 1}`,
            name: `Pack ${packNumber} Cell Voltage ${i + 1}`,
            unit_of_measurement: 'mV',
            device_class: 'voltage',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: state => (state.cellVoltages?.[i] != null ? true : undefined) },
        );
      }

      // Up to 5 temperature sensors (°C).
      field({ key: 'temp', path: ['temperatures'], transform: tempArray });
      for (let i = 0; i < 5; i++) {
        advertise(
          ['temperatures', i],
          sensorComponent<number>({
            id: `pack_${packNumber}_temperature_${i + 1}`,
            name: `Pack ${packNumber} Temperature ${i + 1}`,
            unit_of_measurement: '°C',
            device_class: 'temperature',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: state => (state.temperatures?.[i] != null ? true : undefined) },
        );
      }

      const scalarFields = [
        ['vol', 'voltage', 'Voltage', 'voltage', 'V', divide(100)],
        ['soc', 'soc', 'State of Charge', 'battery', '%', divide(10)],
        ['max_v', 'maxCellVoltage', 'Max Cell Voltage', 'voltage', 'mV', number()],
        ['min_v', 'minCellVoltage', 'Min Cell Voltage', 'voltage', 'mV', number()],
        ['max_t', 'maxTemperature', 'Max Temperature', 'temperature', '°C', tempScalar],
        ['min_t', 'minTemperature', 'Min Temperature', 'temperature', '°C', tempScalar],
        ['env', 'ambientTemperature', 'Ambient Temperature', 'temperature', '°C', tempScalar],
        ['mos', 'mosfetTemperature', 'MOSFET Temperature', 'temperature', '°C', tempScalar],
      ] as const;

      for (const [key, destPath, label, deviceClass, unit, transform] of scalarFields) {
        field({ key, path: [destPath], transform });
        advertise(
          [destPath],
          sensorComponent<number>({
            id: `pack_${packNumber}_${destPath.replace(/([A-Z])/g, '_$1').toLowerCase()}`,
            name: `Pack ${packNumber} ${label}`,
            device_class: deviceClass,
            unit_of_measurement: unit,
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: state => (state[destPath] != null ? true : undefined) },
        );
      }
    },
  );
}

// The cd=26 response reports the device's network configuration. Its
// non-standard colon-delimited format is normalized into ip/gate/mask/dns/
// ct_connect_ip keys by the message parser before it reaches these fields.
function isVenusNetworkInfoMessage(values: Record<string, string>): boolean {
  return 'ip' in values && 'gate' in values && 'ct_connect_ip' in values;
}

function registerNetworkInfoMessage(message: BuildMessageFn) {
  message<VenusNetworkInfo>(
    {
      refreshDataPayload: `cd=${CommandType.GET_NETWORK_INFO}`,
      isMessage: isVenusNetworkInfoMessage,
      publishPath: 'network',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      // Network configuration changes rarely, so poll it infrequently.
      pollInterval: Math.max(globalPollInterval, 300000),
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      const networkFields = [
        ['ip', 'ipAddress', 'IP Address', 'mdi:ip-network'],
        ['gate', 'gateway', 'Gateway', 'mdi:router-network'],
        ['mask', 'subnetMask', 'Subnet Mask', 'mdi:ip-network-outline'],
        ['dns', 'dns', 'DNS Server', 'mdi:dns'],
        ['ct_connect_ip', 'ctConnectIp', 'CT Connect IP', 'mdi:current-ac'],
      ] as const;

      for (const [key, path, name, icon] of networkFields) {
        field({ key, path: [path], transform: identity() });
        advertise(
          [path],
          sensorComponent<string>({
            id: `network_${path.replace(/([A-Z])/g, '_$1').toLowerCase()}`,
            name,
            icon,
            enabled_by_default: key === 'ip',
          }),
          { enabled: state => (state[path] != null ? true : undefined) },
        );
      }
    },
  );
}
