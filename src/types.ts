import { BaseDeviceData } from './deviceDefinition.js';

type BatteryStatus = {
  // Host battery sign position (bit3:undervoltage, bit2:dod, bit1:charge, bit0:discharge)
  undervoltage: boolean;
  depthOfDischarge: boolean;
  charging: boolean;
  discharging: boolean;
};

/**
 * Interface for command parameters
 */
export type CommandParams = Record<string, string | number>;

export type B2500Scene = 'day' | 'night' | 'dusk';
export type B2500V2SmartMeterStatus =
  | 'preparing1'
  | 'preparing2'
  | 'diagnosingEquipment'
  | 'diagnosingChannel'
  | 'diagnosisTimeout'
  | 'chargingInProgress'
  | 'unableToFindChannel'
  | 'notInDiagnosis';
export type B2500V1ChargingMode = 'chargeThenDischarge' | 'pv2PassThrough';
export type B2500V2ChargingMode = 'chargeDischargeSimultaneously' | 'chargeThenDischarge';

export interface B2500BaseDeviceData extends BaseDeviceData {
  // Battery information
  batteryPercentage?: number;
  batteryCapacity?: number;
  batteryOutputThreshold?: number;
  dischargeDepth?: number;

  // Solar input information
  solarInputStatus?: {
    input1Charging: boolean;
    input1PassThrough: boolean;
    input2Charging: boolean;
    input2PassThrough: boolean;
  };
  solarPower?: {
    input1: number;
    input2: number;
    total: number;
  };

  // Output state information
  outputState?: {
    output1: boolean;
    output2: boolean;
  };
  outputPower?: {
    output1: number;
    output2: number;
    total: number;
  };

  // Device information
  deviceInfo?: {
    deviceVersion?: number;
    deviceSubversion?: number;
    fc42dVersion?: string;
    deviceIdNumber?: number;
    bootloaderVersion?: number;
  };

  // Temperature information
  temperature?: {
    min?: number;
    max?: number;
    chargingAlarm?: boolean;
    dischargeAlarm?: boolean;
  };

  // Battery packs information
  batteryPacks?: {
    pack1Connected?: boolean;
    pack2Connected?: boolean;
  };

  // Scene information (day/night/dusk)
  scene?: B2500Scene;

  // Output enabled states
  outputEnabled?: {
    output1?: boolean;
    output2?: boolean;
  };

  // Battery capacities
  batteryCapacities?: {
    host?: number; // Host battery capacity
    extra1?: number; // Extra 1 battery capacity
    extra2?: number; // Extra 2 battery capacity
  };

  // Battery status flags
  batteryStatus?: {
    host?: BatteryStatus;
    extra1?: BatteryStatus;
    extra2?: BatteryStatus;
  };

  useFlashCommands: boolean;
}

export interface B2500V1DeviceData extends B2500BaseDeviceData {
  chargingMode?: B2500V1ChargingMode;
}

type CellVoltageInfo = {
  cells: number[];
  min: number;
  max: number;
  diff: number;
  avg: number;
};

export interface B2500CellData extends BaseDeviceData {
  cellVoltage?: {
    host?: CellVoltageInfo;
    extra1?: CellVoltageInfo;
    extra2?: CellVoltageInfo;
  };
}

export interface B2500CalibrationData extends BaseDeviceData {
  charge?: number;
  discharge?: number;
}

export interface B2500V2DeviceData extends B2500BaseDeviceData {
  // Charging and discharging settings
  chargingMode?: B2500V2ChargingMode;
  adaptiveMode?: boolean;

  // Time periods for scheduled operations
  timePeriods?: Array<{
    enabled: boolean;
    startTime: string;
    endTime: string;
    outputValue: number;
  }>;

  // Daily power statistics
  dailyStats?: {
    batteryChargingPower?: number;
    batteryDischargePower?: number;
    photovoltaicChargingPower?: number;
    microReverseOutputPower?: number;
  };

  // CT information
  ctInfo?: {
    connected?: boolean;
    automaticPowerSize?: number;
    transmittedPower?: number;
    connectedPhase?: 0 | 1 | 2 | 'searching' | 'unknown';
    status?: B2500V2SmartMeterStatus;
    phase1?: number;
    phase2?: number;
    phase3?: number;
    microInverterPower?: number; // Micro Inverter current real-time power
  };

  // Power ratings
  ratedPower?: {
    output?: number;
    input?: number;
    isLimited?: boolean;
  };

  // Surplus Feed-in state
  surplusFeedInEnabled?: boolean;

  // Smart meter configuration (cd=27)
  meterType?: MeterType;
  meterMac?: string;
}

type SolarSocketData = {
  voltage?: number;
  current?: number;
  power?: number;
};

export interface B2500V1CD16Data extends BaseDeviceData {
  input1?: SolarSocketData;
  input2?: SolarSocketData;
  output1?: SolarSocketData;
  output2?: SolarSocketData;
}
export interface B2500V2CD16Data extends BaseDeviceData {
  input1?: SolarSocketData;
  input2?: SolarSocketData;
  output1?: SolarSocketData;
  output2?: SolarSocketData;
  batteryData?: {
    host?: B2500V2BatteryData;
    extra1?: B2500V2BatteryData;
    extra2?: B2500V2BatteryData;
  };
}

export interface B2500V2BatteryData {
  power: number;
  voltage: number;
  current: number;
}

/**
 * Interface for device configuration
 */
export interface Device {
  deviceType: string;
  deviceId: string;
}

/**
 * Interface for MQTT configuration
 */
export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  username?: string;
  password?: string;
  devices: Device[];
  /**
   * Base MQTT topic prefix used for publishing and subscribing to hm2mqtt
   * specific topics (default: 'hm2mqtt')
   */
  topicPrefix: string;
  /**
   * Base MQTT topic prefix used for Home Assistant auto discovery
   * (default: 'homeassistant')
   */
  autodiscoveryTopicPrefix: string;
  /** Interval for polling detailed cell data, in milliseconds. */
  cellDataPollingInterval: number;
  useFlashCommands?: boolean;
  responseTimeout?: number; // Timeout for device responses in milliseconds
  /**
   * Number of consecutive timeouts before marking a device as offline
   * (default: 3)
   */
  allowedConsecutiveTimeouts?: number;
}

/**
 * Venus device working status types
 */
export type VenusWorkingStatus =
  | 'sleep'
  | 'standby'
  | 'charging'
  | 'discharging'
  | 'backup'
  | 'upgrading'
  | 'bypass';

/**
 * Venus device CT status types
 */
export type VenusCTStatus = 'notConnected' | 'connected' | 'weakSignal';

/**
 * Venus device battery working status types
 */
export type VenusBatteryWorkingStatus = 'notWorking' | 'charging' | 'discharging' | 'unknown';

const validVenusWorkingModes = ['automatic', 'manual', 'trading', 'ai'] as const;
/**
 * Venus device working mode types
 */
export type VenusWorkingMode = (typeof validVenusWorkingModes)[number];

export function isValidVenusWorkingMode(mode: string): mode is VenusWorkingMode {
  return validVenusWorkingModes.includes(mode as VenusWorkingMode);
}

/**
 * Venus device grid type
 */
export type VenusGridType =
  | 'adaptive'
  | 'en50549'
  | 'netherlands'
  | 'germany'
  | 'austria'
  | 'unitedKingdom'
  | 'spain'
  | 'poland'
  | 'italy'
  | 'china';

/**
 * Venus device CT type
 */
export type VenusCTType = 'none' | 'ct1' | 'ct2' | 'ct3' | 'shellyPro' | 'p1Meter';

/**
 * Venus device phase type
 */
export type VenusPhaseType = 'unknown' | 'phaseA' | 'phaseB' | 'phaseC' | 'notDetected';

/**
 * Venus device recharge mode
 */
const validVenusRechargeModes = ['singlePhase', 'threePhase'] as const;
export type VenusRechargeMode = (typeof validVenusRechargeModes)[number];

export function isValidVenusRechargeMode(mode: string): mode is VenusRechargeMode {
  return validVenusRechargeModes.includes(mode as VenusRechargeMode);
}

/**
 * External meter type that can be configured via the SET_METER_TYPE (cd=18) command.
 * Shared by Venus and Jupiter. The numeric command code differs from the internal
 * key and from the reported `ct_t` value, so it is kept in a dedicated map.
 */
const validMeterTypes = [
  'ct001',
  'shellyPro3em',
  'ct002',
  'ct003',
  'shellyEmGen3',
  'shellyProEm50',
] as const;
export type MeterType = (typeof validMeterTypes)[number];

export function isValidMeterType(type: string): type is MeterType {
  return validMeterTypes.includes(type as MeterType);
}

/**
 * Maps a meter type to the numeric `meter` value sent with the cd=18 command.
 */
export const meterTypeCommandCodes: Record<MeterType, number> = {
  ct001: 0,
  shellyPro3em: 1,
  ct002: 3,
  ct003: 4,
  shellyEmGen3: 5,
  shellyProEm50: 6,
};

/**
 * Human-readable labels for each meter type, used for Home Assistant discovery.
 */
export const meterTypeLabels: Record<MeterType, string> = {
  ct001: 'CT001',
  shellyPro3em: 'Shelly Pro 3EM',
  ct002: 'CT002',
  ct003: 'CT003',
  shellyEmGen3: 'Shelly EM Gen3',
  shellyProEm50: 'Shelly Pro EM50',
};

/**
 * Normalize a user-supplied MAC address to the 12 lowercase hex digits expected
 * by the cd=18 command (separators such as ':' or '-' are stripped). Returns
 * null when the input is not a valid MAC.
 */
export function normalizeMeterMac(input: string): string | null {
  const cleaned = input.replace(/[\s:.-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(cleaned) ? cleaned : null;
}

/**
 * Determine the MAC to send for a given meter type, applying the special rules:
 * - Shelly Pro 3EM always uses the fixed all-zero MAC.
 * - The built-in CT001 does not need a MAC and falls back to all-zeros.
 * - CT002/CT003/Shelly EM Gen3/Shelly Pro EM50 require an explicit MAC; when none
 *   has been configured this returns null so the caller can abort.
 */
export function resolveMeterMac(meterType: MeterType, configuredMac?: string): string | null {
  if (meterType === 'shellyPro3em') {
    return '000000000000';
  }
  if (configuredMac) {
    return configuredMac;
  }
  if (meterType === 'ct001') {
    return '000000000000';
  }
  return null;
}

export type WeekdaySet = `${0 | ''}${1 | ''}${2 | ''}${3 | ''}${4 | ''}${5 | ''}${6 | ''}`;

const venusValidVersionSets = ['800W', '2500W'] as const;
export type VenusVersionSet = (typeof venusValidVersionSets)[number];

export function isValidVenusVersionSet(set: string): set is VenusVersionSet {
  return venusValidVersionSets.includes(set as VenusVersionSet);
}

/**
 * Venus time period configuration
 */
export interface VenusTimePeriod {
  startTime: string;
  endTime: string;
  weekday: WeekdaySet;
  power: number;
  enabled: boolean;
}

/**
 * Venus device data interface
 */
export interface VenusDeviceData extends BaseDeviceData {
  // Battery information
  batteryPercentage?: number;
  batteryCapacity?: number;

  // Power information
  totalChargingCapacity?: number;
  totalDischargeCapacity?: number;
  dailyChargingCapacity?: number;
  monthlyChargingCapacity?: number;
  dailyDischargeCapacity?: number;
  monthlyDischargeCapacity?: number;

  // Income information
  dailyIncome?: number;
  monthlyIncome?: number;
  totalIncome?: number;

  // PV / solar input information
  pv1Power?: number;
  pv2Power?: number;
  pv3Power?: number;
  pv4Power?: number;
  pv1Connected?: boolean;
  pv2Connected?: boolean;
  pv3Connected?: boolean;
  pv4Connected?: boolean;
  totalPvPower?: number;
  pvEnergyToday?: number;
  pvEnergyTotal?: number;

  // Grid information
  offGridPower?: number;
  combinedPower?: number;
  workingStatus?: VenusWorkingStatus;

  // CT information
  ctStatus?: VenusCTStatus;

  // Battery status
  batteryWorkingStatus?: VenusBatteryWorkingStatus;
  batterySoc?: number;

  // Error codes
  errorCode?: number;
  warningCode?: number;

  // Device information
  deviceVersion?: number;
  gridType?: VenusGridType;
  workingMode?: VenusWorkingMode;

  // Time periods for scheduled operations
  timePeriods?: VenusTimePeriod[];

  // Additional settings
  autoSwitchWorkingMode?: boolean;
  backupEnabled?: boolean;
  transactionRegionCode?: number;
  chargingPrice?: number;
  dischargePrice?: number;
  wifiSignalStrength?: number;
  versionSet?: VenusVersionSet;
  maxChargingPower?: number;
  maxDischargePower?: number;
  ctType?: VenusCTType;
  phaseType?: VenusPhaseType;
  rechargeMode?: VenusRechargeMode;
  meterType?: MeterType; // last configured via cd=18
  meterMac?: string; // MAC used when configuring the meter type
  bmsVersion?: number;
  communicationModuleVersion?: string;
  shellyPort?: number;
  wifiName?: string;
  localApiEnabled?: boolean;
  localApiPort?: number;
  depthOfDischarge?: number; // dod
  ledEnabled?: boolean; // led
  surplusFeedInEnabled?: boolean; // set via cd=43 (no status field; tracked optimistically)
  bluetoothAdvertisingEnabled?: boolean; // set via cd=55 (tracked optimistically)
  phaseDiagnosisStatus?: number; // seq_s
  inverterVersion?: number; // inv_v
  mpptVersion?: number; // mppt
}

export interface VenusBMSInfo extends BaseDeviceData {
  cells?: {
    voltages?: number[];
    temperatures?: number[];
    minVoltage?: number;
    maxVoltage?: number;
    voltageDiff?: number;
    voltageAvg?: number;
  };
  bms?: {
    version?: number;
    soc?: number;
    soh?: number;
    capacity?: number;
    voltage?: number;
    current?: number;
    temperature: number;
    chargeVoltage: number;
    fullChargeCapacity: number;
    cellCycle: number;
    error?: number;
    warning?: number;
    totalRuntime?: number;
    energyThroughput?: number;
    mosfetTemp?: number;
  };
}

/**
 * Per-pack BMS details reported by the cd=42 response on newer Venus firmware.
 */
export interface VenusBMSPackInfo extends BaseDeviceData {
  packMask?: number; // bitmask of present packs (bit 0 = pack 1, ...)
  chargePower?: number; // allowed charge power (W)
  dischargePower?: number; // allowed discharge power (W)
  packs?: {
    soc?: number; // state of charge (%)
    state?: number; // working state (raw; meaning unconfirmed)
    temperature?: number; // °C
  }[];
}

/**
 * Detailed per-pack BMS data reported by the cd=42,bms_idx=N response (N >= 1)
 * on newer Venus firmware. Each present pack reports its individual cell
 * voltages and temperature sensors.
 */
export interface VenusBMSPackDetail extends BaseDeviceData {
  voltage?: number; // vol (pack voltage, V)
  soc?: number; // soc (%)
  version?: number; // ver
  maxCellVoltage?: number; // max_v (mV)
  minCellVoltage?: number; // min_v (mV)
  maxTemperature?: number; // max_t (°C)
  minTemperature?: number; // min_t (°C)
  ambientTemperature?: number; // env (°C)
  mosfetTemperature?: number; // mos (°C)
  cellVoltages?: number[]; // b_vol (mV per cell)
  temperatures?: number[]; // temp (°C per sensor)
}

/**
 * Network configuration reported by the cd=26 response on newer Venus firmware.
 */
export interface VenusNetworkInfo extends BaseDeviceData {
  ipAddress?: string;
  gateway?: string;
  subnetMask?: string;
  dns?: string;
  ctConnectIp?: string;
}

export interface JupiterTimePeriod {
  startTime: string;
  endTime: string;
  weekday: string;
  power: number;
  enabled: boolean;
}

export type JupiterBatteryWorkingStatus = 'keep' | 'charging' | 'discharging' | 'unknown';

const validJupiterWorkingModes = ['automatic', 'manual', 'ai'] as const;
export type JupiterWorkingMode = (typeof validJupiterWorkingModes)[number];

export function isValidJupiterWorkingMode(mode: string): mode is JupiterWorkingMode {
  return validJupiterWorkingModes.includes(mode as JupiterWorkingMode);
}

const validJupiterRechargeModes = ['singlePhase', 'threePhase'] as const;
export type JupiterRechargeMode = (typeof validJupiterRechargeModes)[number];

export function isValidJupiterRechargeMode(mode: string): mode is JupiterRechargeMode {
  return validJupiterRechargeModes.includes(mode as JupiterRechargeMode);
}

export interface JupiterDeviceData extends BaseDeviceData {
  dailyChargingCapacity?: number; // ele_d
  monthlyChargingCapacity?: number; // ele_m
  yearlyChargingCapacity?: number; // ele_y
  pv1Power?: number; // pv1_p
  pv2Power?: number; // pv2_p
  pv3Power?: number; // pv3_p
  pv4Power?: number; // pv4_p
  dailyDischargeCapacity?: number; // grd_d
  monthlyDischargeCapacity?: number; // grd_m
  combinedPower?: number; // grd_o
  workingStatus?: number; // grd_t
  ctStatus?: number; // gct_s
  batteryWorkingStatus?: JupiterBatteryWorkingStatus; // cel_s
  batteryEnergy?: number; // cel_p
  batterySoc?: number; // cel_c
  errorCode?: number; // err_t
  workingMode?: JupiterWorkingMode; // wor_m
  autoSwitchWorkingMode?: number; // cts_m
  httpServerType?: number; // htt_p
  wifiSignalStrength?: number; // wif_s
  ctType?: number; // ct_t
  phaseType?: number; // phase_t
  rechargeMode?: JupiterRechargeMode; // dchrg
  meterType?: MeterType; // last configured via cd=18
  meterMac?: string; // MAC used when configuring the meter type
  wifiName?: string; // ssid
  deviceVersion?: number; // dev_n
  bmsVersion?: number; // dev_b
  mpptVersion?: number; // dev_m
  inverterVersion?: number; // dev_i
  timePeriods?: JupiterTimePeriod[];
  surplusFeedInEnabled?: boolean; // ful_d
  depthOfDischarge?: number; // dod
  alarmCode?: number; // ala_c
}

/**
 * HMI inverter data interface (Marstek HMI family, e.g. MI800 / HMI-2000)
 */
const validHmiInverterModes = ['default', 'b2500Boost', 'reverseCurrentProtection'] as const;
export type HmiInverterMode = (typeof validHmiInverterModes)[number];
export function isValidHmiInverterMode(mode: string): mode is HmiInverterMode {
  return validHmiInverterModes.includes(mode as HmiInverterMode);
}

export interface HmiInverterDeviceData extends BaseDeviceData {
  // Energy statistics
  dailyEnergyGenerated?: number; // ele_d
  weeklyEnergyGenerated?: number; // ele_w
  monthlyEnergyGenerated?: number; // ele_m
  totalEnergyGenerated?: number; // ele_s
  maximumOutputPower?: number; // pl
  fc4Version?: string; // fc4_v
  mode?: HmiInverterMode; // mpt_m
  gridConnectionBan?: boolean; // gc

  // PV Input 1
  pv1Voltage?: number; // pv1_v
  pv1Current?: number; // pv1_i
  pv1Power?: number; // pv1_p
  pv1Status?: boolean; // pv1_s

  // PV Input 2
  pv2Voltage?: number; // pv2_v
  pv2Current?: number; // pv2_i
  pv2Power?: number; // pv2_p
  pv2Status?: boolean; // pv2_s

  // PV Input 3 (HMI-2000 4-PV variant)
  pv3Voltage?: number; // pv3_v
  pv3Current?: number; // pv3_i
  pv3Power?: number; // pv3_p
  pv3Status?: boolean; // pv3_s

  // PV Input 4 (HMI-2000 4-PV variant)
  pv4Voltage?: number; // pv4_v
  pv4Current?: number; // pv4_i
  pv4Power?: number; // pv4_p
  pv4Status?: boolean; // pv4_s

  // Connectivity diagnostics (field names reused from ct002.ts)
  bluetoothSignal?: number; // ble_s
  wifiRssi?: number; // wif_r

  // Grid information
  gridFrequency?: number; // grd_f
  gridVoltage?: number; // grd_v
  gridStatus?: boolean; // grd_s
  gridOutputPower?: number; // grd_o

  // Device status
  chipTemperature?: number; // chp_t
  errorType?: number; // err_t
  errorCount?: number; // err_c
  errorDetails?: number; // err_d
  firmwareVersion?: number; // ver_s
}

export interface JupiterMPPTPVInfo {
  voltage?: number;
  current?: number;
  power?: number;
}

export interface JupiterBMSInfo extends BaseDeviceData {
  cells?: {
    temperatures?: number[]; // b_temp0-b_temp3
  };
  bms?: {
    soc?: number; // soc
    soh?: number; // soh
    capacity?: number; // b_cap
    voltage?: number; // b_vol
    current?: number; // b_cur
    temperature?: number; // b_temp
    chargeVoltage?: number; // c_vol
    chargeCurrentLimit?: number; // c_cur
    dischargeCurrentLimit?: number; // d_cur
    error?: number; // b_err
    warning?: number; // b_war
    error2?: number; // b_err2
    warning2?: number; // b_war2
    cellFlag?: number; // c_flag
    statusFlag?: number; // s_flag
    bmsNumber?: number; // b_num
    mosfetTemp?: number; // mos_t
    envTemp?: number; // env_t
  };
  batteries?: {
    cellVoltages?: {
      minVoltage?: number; // vol_[x*i+2]
      minVoltageCell?: number; // vol_[x*i], high byte
      maxVoltage?: number; // vol_[x*i+1]
      maxVoltageCell?: number; // vol_[x*i], low byte
      voltageDiff?: number; // maxVoltage - minVoltage (drift)
    };
  }[];
  mppt?: {
    temperature?: number; // m_temp
    error?: number; // m_err
    warning?: number; // m_war
    pv?: JupiterMPPTPVInfo[]; // pv1-pv4
  };
  inverter?: {
    temperature?: number;
    error?: number;
    warning?: number;
    gridVoltage?: number;
    gridCurrent?: number;
    gridPower?: number;
    gridPowerFactor?: number;
    gridFrequency?: number;
  };
}

export interface CT002DeviceData extends BaseDeviceData {
  phase1Power?: number; // pwr_a
  phase2Power?: number; // pwr_b
  phase3Power?: number; // pwr_c
  totalPower?: number; // pwr_t
  bluetoothSignal?: number; // ble_s
  wifiRssi?: number; // wif_r
  fc4Version?: string; // fc4_v
  firmwareVersion?: number; // ver_v
  wifiStatus?: number; // wif_s
}
