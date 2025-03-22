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
  useFlashCommands?: boolean;
  responseTimeout?: number; // Timeout for device responses in milliseconds
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

/**
 * Venus device working mode types
 */
export type VenusWorkingMode = 'automatic' | 'manual' | 'trading';

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
  versionSet?: '800W' | '2500W';
  maxChargingPower?: number;
  maxDischargePower?: number;
  ctType?: VenusCTType;
  phaseType?: VenusPhaseType;
  rechargeMode?: VenusRechargeMode;
  bmsVersion?: number;
  communicationModuleVersion?: string;
  wifiName?: string;
}
