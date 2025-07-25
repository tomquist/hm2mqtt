import { BaseDeviceData } from './deviceDefinition';

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

const validVenusWorkingModes = ['automatic', 'manual', 'trading'] as const;
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
export type VenusRechargeMode = 'singlePhase' | 'threePhase';

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
  bmsVersion?: number;
  communicationModuleVersion?: string;
  wifiName?: string;
}

export interface VenusBMSInfo extends BaseDeviceData {
  cells?: {
    voltages?: number[];
    temperatures?: number[];
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

export interface JupiterTimePeriod {
  startTime: string;
  endTime: string;
  weekday: string;
  power: number;
  enabled: boolean;
}

export type JupiterBatteryWorkingStatus = 'keep' | 'charging' | 'discharging' | 'unknown';

const validJupiterWorkingModes = ['automatic', 'manual'] as const;
export type JupiterWorkingMode = (typeof validJupiterWorkingModes)[number];

export function isValidJupiterWorkingMode(mode: string): mode is JupiterWorkingMode {
  return validJupiterWorkingModes.includes(mode as JupiterWorkingMode);
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
  rechargeMode?: number; // dchrg
  wifiName?: string; // ssid
  deviceVersion?: number; // dev_n
  timePeriods?: JupiterTimePeriod[];
  surplusFeedInEnabled?: boolean; // ful_d
  alarmCode?: number; // ala_c
}

/**
 * MI800 micro inverter data interface
 */
export interface MI800DeviceData extends BaseDeviceData {
  // Energy statistics
  dailyEnergyGenerated?: number; // ele_d
  weeklyEnergyGenerated?: number; // ele_w
  monthlyEnergyGenerated?: number; // ele_m
  totalEnergyGenerated?: number; // ele_s
  maximumOutputPower?: number; // pl
  fc4Version?: string; // fc4_v
  mode?: number; // mpt_m
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
    voltages?: number[]; // vol0-vol15
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
    chargeCurrent?: number; // c_cur
    dischargeCurrent?: number; // d_cur
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
  mppt?: {
    temperature?: number; // m_temp
    error?: number; // m_err
    warning?: number; // m_war
    pv?: JupiterMPPTPVInfo[]; // pv1-pv4
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
