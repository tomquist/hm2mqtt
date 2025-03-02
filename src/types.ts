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
  };

  // Output state information
  outputState?: {
    output1: boolean;
    output2: boolean;
  };
  outputPower?: {
    output1: number;
    output2: number;
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
  pollingInterval: number;
  useFlashCommands?: boolean;
  responseTimeout?: number; // Timeout for device responses in milliseconds
}
