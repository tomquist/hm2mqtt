import { jest } from '@jest/globals';
import './device/registry.js';
import { ControlHandler } from './controlHandler.js';
import { DeviceManager, DeviceStateData } from './deviceManager.js';
import { MqttConfig, Device } from './types.js';
import { DEFAULT_TOPIC_PREFIX } from './constants.js';

/**
 * Device command test case definition
 */
interface CommandTestCase {
  /** Description of what the test is checking */
  description: string;
  /** Device type (e.g., 'HMA-1', 'HMB-1', 'HMG-1', 'HMI-1', 'HMN-1') */
  deviceType: string;
  /** Initial device state before command execution */
  initialState?: Partial<DeviceStateData>;
  /** Command name (e.g., 'charging-mode', 'discharge-depth') */
  command: string;
  /** Input message sent to the command */
  input: string;
  /**
   * Expected MQTT output message (null if no output expected). A list means
   * the command publishes exactly these messages, in this order.
   */
  expectedOutput: string | string[] | null;
  /** Expected state changes after command (if any) */
  expectedStateChanges?: Partial<DeviceStateData>;
  /** Whether to use flash commands (defaults to true in tests) */
  useFlashCommands?: boolean;
}

/**
 * Comprehensive test cases for all device commands.
 * Each test case specifies:
 * - Device type and initial state
 * - Command name and input message
 * - Expected MQTT output message
 */
const commandTestCases: CommandTestCase[] = [
  // ============================================================
  // B2500 BASE COMMANDS (shared by V1 and V2 devices)
  // ============================================================

  // discharge-depth command
  {
    description: 'B2500 discharge-depth with valid value (50%)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: '50',
    expectedOutput: 'cd=5,md=50',
  },
  {
    description: 'B2500 discharge-depth with minimum value (0%)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: '0',
    expectedOutput: 'cd=5,md=0',
  },
  {
    description: 'B2500 discharge-depth with maximum value (100%)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: '100',
    expectedOutput: 'cd=5,md=100',
  },
  {
    description: 'B2500 discharge-depth with value above maximum (invalid)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: '101',
    expectedOutput: null,
  },
  {
    description: 'B2500 discharge-depth with negative value (invalid)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: '-1',
    expectedOutput: null,
  },
  {
    description: 'B2500 discharge-depth with non-numeric value (invalid)',
    deviceType: 'HMA-1',
    command: 'discharge-depth',
    input: 'abc',
    expectedOutput: null,
  },
  {
    description: 'B2500 discharge-depth with non-flash commands',
    deviceType: 'HMA-1',
    useFlashCommands: false,
    command: 'discharge-depth',
    input: '75',
    expectedOutput: 'cd=19,md=75',
  },

  // restart command
  {
    description: 'B2500 restart with true',
    deviceType: 'HMA-1',
    command: 'restart',
    input: 'true',
    expectedOutput: 'cd=10',
  },
  {
    description: 'B2500 restart with 1',
    deviceType: 'HMA-1',
    command: 'restart',
    input: '1',
    expectedOutput: 'cd=10',
  },
  {
    description: 'B2500 restart with PRESS',
    deviceType: 'HMA-1',
    command: 'restart',
    input: 'PRESS',
    expectedOutput: 'cd=10',
  },
  {
    description: 'B2500 restart with false (no output)',
    deviceType: 'HMA-1',
    command: 'restart',
    input: 'false',
    expectedOutput: null,
  },
  {
    description: 'B2500 restart with 0 (no output)',
    deviceType: 'HMA-1',
    command: 'restart',
    input: '0',
    expectedOutput: null,
  },

  // refresh command
  {
    description: 'B2500 refresh with true',
    deviceType: 'HMA-1',
    command: 'refresh',
    input: 'true',
    expectedOutput: 'cd=1',
  },
  {
    description: 'B2500 refresh with PRESS',
    deviceType: 'HMA-1',
    command: 'refresh',
    input: 'PRESS',
    expectedOutput: 'cd=1',
  },
  {
    description: 'B2500 refresh with false (no output)',
    deviceType: 'HMA-1',
    command: 'refresh',
    input: 'false',
    expectedOutput: null,
  },

  // factory-reset command
  {
    description: 'B2500 factory-reset with true',
    deviceType: 'HMA-1',
    command: 'factory-reset',
    input: 'true',
    expectedOutput: 'cd=11',
  },
  {
    description: 'B2500 factory-reset with PRESS',
    deviceType: 'HMA-1',
    command: 'factory-reset',
    input: 'PRESS',
    expectedOutput: 'cd=11',
  },
  {
    description: 'B2500 factory-reset with false (no output)',
    deviceType: 'HMA-1',
    command: 'factory-reset',
    input: 'false',
    expectedOutput: null,
  },

  // use-flash-commands command (state change only, no MQTT output)
  {
    description: 'B2500 use-flash-commands enable',
    deviceType: 'HMA-1',
    useFlashCommands: false, // Start with false to test real state transition
    command: 'use-flash-commands',
    input: 'true',
    expectedOutput: null,
    expectedStateChanges: { useFlashCommands: true },
  },
  {
    description: 'B2500 use-flash-commands disable',
    deviceType: 'HMA-1',
    useFlashCommands: true, // Start with true to test real state transition
    command: 'use-flash-commands',
    input: 'false',
    expectedOutput: null,
    expectedStateChanges: { useFlashCommands: false },
  },

  // ============================================================
  // B2500V1 (HMB) SPECIFIC COMMANDS
  // ============================================================

  // charging-mode command (V1 - different options than V2)
  {
    description: 'B2500V1 charging-mode pv2PassThrough',
    deviceType: 'HMB-1',
    command: 'charging-mode',
    input: 'pv2PassThrough',
    expectedOutput: 'cd=3,md=0',
  },
  {
    description: 'B2500V1 charging-mode chargeThenDischarge',
    deviceType: 'HMB-1',
    command: 'charging-mode',
    input: 'chargeThenDischarge',
    expectedOutput: 'cd=3,md=1',
  },
  {
    description: 'B2500V1 charging-mode invalid value',
    deviceType: 'HMB-1',
    command: 'charging-mode',
    input: 'invalid',
    expectedOutput: null,
  },
  {
    description: 'B2500V1 charging-mode with non-flash commands',
    deviceType: 'HMB-1',
    useFlashCommands: false,
    command: 'charging-mode',
    input: 'pv2PassThrough',
    expectedOutput: 'cd=17,md=0',
  },

  // battery-threshold command (V1 only)
  {
    description: 'B2500V1 battery-threshold valid value',
    deviceType: 'HMB-1',
    command: 'battery-threshold',
    input: '300',
    expectedOutput: 'cd=6,md=300',
  },
  {
    description: 'B2500V1 battery-threshold minimum value',
    deviceType: 'HMB-1',
    command: 'battery-threshold',
    input: '0',
    expectedOutput: 'cd=6,md=0',
  },
  {
    description: 'B2500V1 battery-threshold maximum value',
    deviceType: 'HMB-1',
    command: 'battery-threshold',
    input: '800',
    expectedOutput: 'cd=6,md=800',
  },
  {
    description: 'B2500V1 battery-threshold above maximum (invalid)',
    deviceType: 'HMB-1',
    command: 'battery-threshold',
    input: '801',
    expectedOutput: null,
  },
  {
    description: 'B2500V1 battery-threshold negative (invalid)',
    deviceType: 'HMB-1',
    command: 'battery-threshold',
    input: '-1',
    expectedOutput: null,
  },

  // output1 command (V1 only - bitwise output control)
  {
    description: 'B2500V1 output1 enable (no prior state)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: false, output2: false } },
    command: 'output1',
    input: 'true',
    expectedOutput: 'cd=4,md=1', // bit 0 set
  },
  {
    description: 'B2500V1 output1 enable (output2 already enabled)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: false, output2: true } },
    command: 'output1',
    input: 'true',
    expectedOutput: 'cd=4,md=3', // bits 0 and 1 set
  },
  {
    description: 'B2500V1 output1 disable (output2 enabled)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: true, output2: true } },
    command: 'output1',
    input: 'false',
    expectedOutput: 'cd=4,md=2', // only bit 1 set
  },
  {
    description: 'B2500V1 output1 with ON',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: false, output2: false } },
    command: 'output1',
    input: 'ON',
    expectedOutput: 'cd=4,md=1',
  },
  {
    description: 'B2500V1 output1 with 1',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: false, output2: false } },
    command: 'output1',
    input: '1',
    expectedOutput: 'cd=4,md=1',
  },

  // output2 command (V1 only)
  {
    description: 'B2500V1 output2 enable (no prior state)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: false, output2: false } },
    command: 'output2',
    input: 'true',
    expectedOutput: 'cd=4,md=2', // bit 1 set
  },
  {
    description: 'B2500V1 output2 enable (output1 already enabled)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: true, output2: false } },
    command: 'output2',
    input: 'true',
    expectedOutput: 'cd=4,md=3', // bits 0 and 1 set
  },
  {
    description: 'B2500V1 output2 disable (output1 enabled)',
    deviceType: 'HMB-1',
    initialState: { outputEnabled: { output1: true, output2: true } },
    command: 'output2',
    input: 'false',
    expectedOutput: 'cd=4,md=1', // only bit 0 set
  },

  // ============================================================
  // B2500V2 (HMA, HMF, HMJ, HMK) SPECIFIC COMMANDS
  // ============================================================

  // charging-mode command (V2 - different options than V1)
  {
    description: 'B2500V2 charging-mode chargeDischargeSimultaneously',
    deviceType: 'HMA-1',
    command: 'charging-mode',
    input: 'chargeDischargeSimultaneously',
    expectedOutput: 'cd=3,md=0',
  },
  {
    description: 'B2500V2 charging-mode chargeThenDischarge',
    deviceType: 'HMA-1',
    command: 'charging-mode',
    input: 'chargeThenDischarge',
    expectedOutput: 'cd=3,md=1',
  },
  {
    description: 'B2500V2 charging-mode invalid value',
    deviceType: 'HMA-1',
    command: 'charging-mode',
    input: 'pv2PassThrough', // V1 option, not valid for V2
    expectedOutput: null,
  },
  {
    description: 'B2500V2 charging-mode with non-flash commands',
    deviceType: 'HMA-1',
    useFlashCommands: false,
    command: 'charging-mode',
    input: 'chargeDischargeSimultaneously',
    expectedOutput: 'cd=17,md=0',
  },

  // adaptive-mode command (V2 only)
  {
    description: 'B2500V2 adaptive-mode enable',
    deviceType: 'HMA-1',
    command: 'adaptive-mode',
    input: 'true',
    expectedOutput: 'cd=4,md=1',
  },
  {
    description: 'B2500V2 adaptive-mode disable',
    deviceType: 'HMA-1',
    command: 'adaptive-mode',
    input: 'false',
    expectedOutput: 'cd=4,md=0',
  },
  {
    description: 'B2500V2 adaptive-mode with 1',
    deviceType: 'HMA-1',
    command: 'adaptive-mode',
    input: '1',
    expectedOutput: 'cd=4,md=1',
  },
  {
    description: 'B2500V2 adaptive-mode with ON',
    deviceType: 'HMA-1',
    command: 'adaptive-mode',
    input: 'ON',
    expectedOutput: 'cd=4,md=1',
  },
  {
    description: 'B2500V2 adaptive-mode with non-flash commands',
    deviceType: 'HMA-1',
    useFlashCommands: false,
    command: 'adaptive-mode',
    input: 'true',
    expectedOutput: 'cd=18,md=1',
  },

  // connected-phase command (V2 only)
  {
    description: 'B2500V2 connected-phase phase 0',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '0',
    expectedOutput: 'cd=22,md=0',
  },
  {
    description: 'B2500V2 connected-phase phase 1',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '1',
    expectedOutput: 'cd=22,md=1',
  },
  {
    description: 'B2500V2 connected-phase phase 2',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '2',
    expectedOutput: 'cd=22,md=2',
  },
  {
    description: 'B2500V2 connected-phase auto/none',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: 'auto',
    expectedOutput: 'cd=22,md=255',
  },
  {
    description: 'B2500V2 connected-phase unknown',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: 'unknown',
    expectedOutput: 'cd=22,md=255',
  },
  {
    description: 'B2500V2 connected-phase invalid value',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '10',
    expectedOutput: null,
  },
  {
    // The select publishes the state name, not the code: `searching` is the
    // state of the All Phases option.
    description: 'B2500V2 connected-phase searching (All Phases) maps to md=3',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: 'searching',
    expectedOutput: 'cd=22,md=3',
  },
  {
    description: 'B2500V2 connected-phase all maps to md=3',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: 'all',
    expectedOutput: 'cd=22,md=3',
  },
  {
    description: 'B2500V2 connected-phase refuses Phase 1 on HMJ firmware 110',
    deviceType: 'HMJ-2',
    initialState: { deviceType: 'HMJ-2', deviceInfo: { deviceVersion: 110 }, adaptiveMode: true },
    command: 'connected-phase',
    input: '0',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 connected-phase allows Phase 1 on newer HMJ firmware',
    deviceType: 'HMJ-2',
    initialState: { deviceType: 'HMJ-2', deviceInfo: { deviceVersion: 116 } },
    command: 'connected-phase',
    input: '0',
    expectedOutput: 'cd=22,md=0',
  },
  {
    description: 'B2500V2 connected-phase numeric 3 is accepted',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '3',
    expectedOutput: 'cd=22,md=3',
  },
  {
    description: 'B2500V2 connected-phase 4 is rejected',
    deviceType: 'HMA-1',
    command: 'connected-phase',
    input: '4',
    expectedOutput: null,
  },

  // time-zone command (V2 only)
  {
    description: 'B2500V2 time-zone positive offset',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '480', // +8 hours
    expectedOutput: 'cd=9,wy=480',
  },
  {
    description: 'B2500V2 time-zone negative offset',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '-300', // -5 hours
    expectedOutput: 'cd=9,wy=-300',
  },
  {
    description: 'B2500V2 time-zone zero',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '0',
    expectedOutput: 'cd=9,wy=0',
  },
  {
    description: 'B2500V2 time-zone invalid',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: 'abc',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-zone not a multiple of 10 (invalid)',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '345',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-zone above 720 (invalid)',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '730',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-zone below -720 (invalid)',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '-730',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-zone fraction (invalid)',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '60.5',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-zone at the limit',
    deviceType: 'HMA-1',
    command: 'time-zone',
    input: '-720',
    expectedOutput: 'cd=9,wy=-720',
  },

  // sync-time command with JSON (V2 only)
  {
    description: 'B2500V2 sync-time with JSON',
    deviceType: 'HMA-1',
    command: 'sync-time',
    input: '{"wy":480,"yy":123,"mm":1,"rr":2,"hh":23,"mn":56,"ss":56}',
    expectedOutput: ['cd=8,wy=480,yy=123,mm=1,rr=2,hh=23,mn=56,ss=56'],
  },
  {
    // Every field here is a legal 0: UTC+0, January, midnight, zero minute/second.
    description: 'B2500V2 sync-time with JSON accepts zero values',
    deviceType: 'HMA-1',
    command: 'sync-time',
    input: '{"wy":0,"yy":126,"mm":0,"rr":1,"hh":0,"mn":0,"ss":0}',
    expectedOutput: ['cd=8,wy=0,yy=126,mm=0,rr=1,hh=0,mn=0,ss=0'],
  },
  {
    description: 'B2500V2 sync-time with incomplete JSON (invalid)',
    deviceType: 'HMA-1',
    command: 'sync-time',
    input: '{"wy":480}',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 sync-time with malformed JSON (invalid)',
    deviceType: 'HMA-1',
    command: 'sync-time',
    input: 'not json',
    expectedOutput: null,
  },

  // surplus-feed-in command (V2 only)
  {
    description: 'B2500V2 surplus-feed-in enable',
    deviceType: 'HMA-1',
    initialState: { deviceType: 'HMA', deviceInfo: { deviceVersion: 230 } },
    command: 'surplus-feed-in',
    input: 'true',
    expectedOutput: 'cd=31,touchuan_disa=0', // 0 to enable
  },
  {
    description: 'B2500V2 surplus-feed-in disable',
    deviceType: 'HMA-1',
    initialState: { deviceType: 'HMA', deviceInfo: { deviceVersion: 230 } },
    command: 'surplus-feed-in',
    input: 'false',
    expectedOutput: 'cd=31,touchuan_disa=1', // 1 to disable
  },
  {
    description: 'B2500V2 surplus-feed-in with 1',
    deviceType: 'HMA-1',
    initialState: { deviceType: 'HMA', deviceInfo: { deviceVersion: 230 } },
    command: 'surplus-feed-in',
    input: '1',
    expectedOutput: 'cd=31,touchuan_disa=0',
  },
  {
    description: 'B2500V2 surplus-feed-in with on',
    deviceType: 'HMA-1',
    initialState: { deviceType: 'HMA', deviceInfo: { deviceVersion: 230 } },
    command: 'surplus-feed-in',
    input: 'on',
    expectedOutput: 'cd=31,touchuan_disa=0',
  },

  // meter-mac + meter-type commands (B2500V2, cd=27)
  {
    description: 'B2500V2 meter-mac normalizes separators and case',
    deviceType: 'HMA-1',
    command: 'meter-mac',
    input: 'AA:BB:CC:DD:EE:FF',
    expectedOutput: null,
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'B2500V2 meter-mac re-applies configured meter type with new MAC',
    deviceType: 'HMA-1',
    initialState: { meterType: 'ct002' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: 'cd=27,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'B2500V2 meter-mac invalid',
    deviceType: 'HMA-1',
    command: 'meter-mac',
    input: 'not-a-mac',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type CT002 with configured MAC',
    deviceType: 'HMA-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: 'cd=27,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterType: 'ct002' },
  },
  {
    description: 'B2500V2 meter-type Shelly Pro 3EM forces all-zero MAC',
    deviceType: 'HMA-1',
    command: 'meter-type',
    input: 'shellyPro3em',
    expectedOutput: 'cd=27,meter=1,mac=000000000000',
  },
  {
    description: 'B2500V2 meter-type CT001 without MAC uses all-zero MAC',
    deviceType: 'HMA-1',
    command: 'meter-type',
    input: 'ct001',
    expectedOutput: 'cd=27,meter=0,mac=000000000000',
  },
  {
    description: 'B2500V2 meter-type CT002 without MAC is rejected',
    deviceType: 'HMA-1',
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type P1 Meter with configured MAC',
    deviceType: 'HMA-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'p1Meter',
    expectedOutput: 'cd=27,meter=2,mac=aabbccddeeff',
  },
  {
    description: 'B2500V2 meter-type SMR-TIC with configured MAC',
    deviceType: 'HMA-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'smrTic',
    expectedOutput: 'cd=27,meter=10,mac=aabbccddeeff',
  },
  {
    description: 'B2500V2 meter-type SMR-TIC is refused on HMJ firmware 116',
    deviceType: 'HMJ-2',
    initialState: {
      deviceType: 'HMJ-2',
      deviceInfo: { deviceVersion: 116 },
      meterMac: 'aabbccddeeff',
    },
    command: 'meter-type',
    input: 'smrTic',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type TPM2-100CT is refused on HMJ firmware 116',
    deviceType: 'HMJ-2',
    initialState: {
      deviceType: 'HMJ-2',
      deviceInfo: { deviceVersion: 116 },
      meterMac: 'aabbccddeeff',
    },
    command: 'meter-type',
    input: 'tpm2100ct',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type EcoTracker is still accepted on HMJ firmware 116',
    deviceType: 'HMJ-2',
    initialState: {
      deviceType: 'HMJ-2',
      deviceInfo: { deviceVersion: 116 },
      meterMac: 'aabbccddeeff',
    },
    command: 'meter-type',
    input: 'ecoTracker',
    expectedOutput: 'cd=27,meter=7,mac=aabbccddeeff',
  },
  {
    description: 'B2500V2 meter-type SMR-TIC is accepted on newer HMJ firmware',
    deviceType: 'HMJ-2',
    initialState: {
      deviceType: 'HMJ-2',
      deviceInfo: { deviceVersion: 117 },
      meterMac: 'aabbccddeeff',
    },
    command: 'meter-type',
    input: 'smrTic',
    expectedOutput: 'cd=27,meter=10,mac=aabbccddeeff',
  },
  {
    description: 'B2500V2 meter-mac does not re-apply an SMR meter on HMJ firmware 116',
    deviceType: 'HMJ-2',
    initialState: { deviceType: 'HMJ-2', deviceInfo: { deviceVersion: 116 }, meterType: 'smrP1' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: null,
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'B2500V2 meter-type P1 Meter without MAC is rejected',
    deviceType: 'HMA-1',
    command: 'meter-type',
    input: 'p1Meter',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type EcoTracker with configured MAC',
    deviceType: 'HMA-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'ecoTracker',
    expectedOutput: 'cd=27,meter=7,mac=aabbccddeeff',
  },

  // recharge-mode + phase-diagnosis (cd=27 doubles as the grid recharge command)
  {
    description: 'B2500V2 recharge-mode single phase',
    deviceType: 'HMA-1',
    command: 'recharge-mode',
    input: 'singlePhase',
    expectedOutput: 'cd=27,dchrg=0',
    expectedStateChanges: { rechargeMode: 'singlePhase' },
  },
  {
    description: 'B2500V2 recharge-mode three phase',
    deviceType: 'HMA-1',
    command: 'recharge-mode',
    input: 'threePhase',
    expectedOutput: 'cd=27,dchrg=1',
    expectedStateChanges: { rechargeMode: 'threePhase' },
  },
  {
    description: 'B2500V2 recharge-mode invalid',
    deviceType: 'HMA-1',
    command: 'recharge-mode',
    input: 'twoPhase',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 phase-diagnosis sends the bare seq_check flag',
    deviceType: 'HMA-1',
    command: 'phase-diagnosis',
    input: 'PRESS',
    expectedOutput: 'cd=27,seq_check',
  },
  {
    description: 'B2500V2 phase-diagnosis ignores a non-press payload',
    deviceType: 'HMA-1',
    command: 'phase-diagnosis',
    input: 'false',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-type invalid',
    deviceType: 'HMA-1',
    command: 'meter-type',
    input: 'notAType',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 meter-mac re-applies meter type with non-flash command',
    deviceType: 'HMA-1',
    useFlashCommands: false,
    initialState: { meterType: 'ct002' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: 'cd=27,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },

  // time-period commands (V2 only)
  {
    description: 'B2500V2 time-period/1/enabled true',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: false, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/enabled',
    input: 'true',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=20:0,v1=500',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/end-time should send minutes without zero padding',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '08:01',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=8:1,v1=500',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/enabled false',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/enabled',
    input: 'false',
    expectedOutput: 'cd=7,md=0,a1=0,b1=8:0,e1=20:0,v1=500',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/start-time valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/start-time',
    input: '06:30',
    expectedOutput: 'cd=7,md=0,a1=1,b1=6:30,e1=20:0,v1=500',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/start-time invalid format (letters)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/start-time',
    input: 'abc',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/start-time invalid format (bad minutes)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/start-time',
    input: '12:99', // invalid minutes
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/start-time hour 24 (invalid)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/start-time',
    input: '24:00',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/end-time hour 24 (invalid)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '24:00',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/end-time hour 29 (invalid)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '29:59',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/end-time 23:59 is the latest valid time',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '23:59',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=23:59,v1=500',
  },
  {
    // Only warned about: editing start and end separately passes through this.
    description: 'B2500V2 time-period/1/end-time before the start time is still sent',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '22:00', endTime: '23:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '06:00',
    expectedOutput: 'cd=7,md=0,a1=1,b1=22:0,e1=6:0,v1=500',
  },
  {
    description: 'B2500V2 time-period/1/end-time valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/end-time',
    input: '22:45',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=22:45,v1=500',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/output-value valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/output-value',
    input: '750',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=20:0,v1=750',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period/1/output-value above max (invalid)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/output-value',
    input: '801',
    expectedOutput: null,
  },
  {
    // Editing a period turns adaptive mode off on the device.
    description: 'B2500V2 time-period edit while adaptive mode is on',
    deviceType: 'HMA-1',
    initialState: {
      adaptiveMode: true,
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/output-value',
    input: '300',
    expectedOutput: 'cd=7,md=0,a1=1,b1=8:0,e1=20:0,v1=300',
    expectedStateChanges: { adaptiveMode: false },
  },
  {
    description: 'B2500V2 time-period invalid edit leaves adaptive mode alone',
    deviceType: 'HMA-1',
    initialState: {
      adaptiveMode: true,
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/1/output-value',
    input: '801',
    expectedOutput: null,
    expectedStateChanges: { adaptiveMode: true },
  },
  {
    description: 'B2500V2 time-period/6/enabled (invalid period number)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [{ enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 }],
    },
    command: 'time-period/6/enabled',
    input: 'true',
    expectedOutput: null,
  },

  // ============================================================
  // VENUS (HMG, VNSE3, VNSA, VNSD) COMMANDS
  // ============================================================

  // working-mode command
  {
    description: 'Venus working-mode automatic',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'automatic',
    expectedOutput: 'cd=2,md=0',
  },
  {
    description: 'Venus working-mode manual',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'manual',
    expectedOutput: 'cd=2,md=1',
  },
  {
    description: 'Venus working-mode trading on HMG control firmware 146',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 146 },
    command: 'working-mode',
    input: 'trading',
    expectedOutput: 'cd=2,md=2',
  },
  {
    description: 'Venus working-mode trading refused on HMG control firmware 147 and later',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156 },
    command: 'working-mode',
    input: 'trading',
    expectedOutput: null,
  },
  {
    description: 'Venus working-mode trading refused on the Venus E 3.0',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 151 },
    command: 'working-mode',
    input: 'trading',
    expectedOutput: null,
  },
  {
    description: 'Venus working-mode passive cannot be selected',
    deviceType: 'VNSE3-0',
    command: 'working-mode',
    input: 'passive',
    expectedOutput: null,
  },
  {
    description: 'Venus working-mode modbus cannot be selected',
    deviceType: 'VNSA-0',
    command: 'working-mode',
    input: 'modbus',
    expectedOutput: null,
  },
  {
    description: 'Venus working-mode ai',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'ai',
    expectedOutput: 'cd=2,md=5,nl=1',
  },
  {
    description: 'Venus working-mode invalid',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'invalid',
    expectedOutput: null,
  },

  // transaction-mode command (cd=3,md=2): HMG up to control firmware 146
  {
    description: 'Venus transaction-mode on HMG control firmware 146',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 146 },
    command: 'transaction-mode',
    input: '{"id":1,"in":40000,"on":50000}',
    expectedOutput: 'cd=3,md=2,id=1,in=40000,on=50000',
  },
  {
    description: 'Venus transaction-mode refused on HMG control firmware 156',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156 },
    command: 'transaction-mode',
    input: '{"id":1,"in":40000,"on":50000}',
    expectedOutput: null,
  },
  {
    description: 'Venus transaction-mode refused on the Venus D',
    deviceType: 'VNSD-0',
    command: 'transaction-mode',
    input: '{"id":1,"in":40000,"on":50000}',
    expectedOutput: null,
  },

  // recharge-mode command (single-/three-phase)
  {
    description: 'Venus recharge-mode single phase',
    deviceType: 'HMG-1',
    command: 'recharge-mode',
    input: 'singlePhase',
    expectedOutput: 'cd=18,dchrg=0',
  },
  {
    description: 'Venus recharge-mode three phase',
    deviceType: 'HMG-1',
    command: 'recharge-mode',
    input: 'threePhase',
    expectedOutput: 'cd=18,dchrg=1',
  },
  {
    description: 'Venus recharge-mode invalid',
    deviceType: 'HMG-1',
    command: 'recharge-mode',
    input: 'invalid',
    expectedOutput: null,
  },

  // auto-switch-working-mode command
  {
    description: 'Venus auto-switch-working-mode on',
    deviceType: 'VNSD-0',
    command: 'auto-switch-working-mode',
    input: 'ON',
    expectedOutput: 'cd=8,dt=1',
    expectedStateChanges: { autoSwitchWorkingMode: true },
  },
  {
    description: 'Venus auto-switch-working-mode off',
    deviceType: 'HMG-50',
    command: 'auto-switch-working-mode',
    input: 'OFF',
    expectedOutput: 'cd=8,dt=0',
    expectedStateChanges: { autoSwitchWorkingMode: false },
  },

  // meter-mac + meter-type commands
  {
    description: 'Venus meter-mac normalizes separators and case',
    deviceType: 'HMG-1',
    command: 'meter-mac',
    input: 'AA:BB:CC:DD:EE:FF',
    expectedOutput: null,
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'Venus meter-mac re-applies configured meter type with new MAC',
    deviceType: 'HMG-1',
    initialState: { meterType: 'ct002' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: 'cd=18,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'Venus meter-mac invalid',
    deviceType: 'HMG-1',
    command: 'meter-mac',
    input: 'not-a-mac',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type CT002 with configured MAC',
    deviceType: 'HMG-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: 'cd=18,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterType: 'ct002' },
  },
  {
    description: 'Venus meter-type CT003 with configured MAC',
    deviceType: 'HMG-1',
    initialState: { meterMac: '112233445566' },
    command: 'meter-type',
    input: 'ct003',
    expectedOutput: 'cd=18,meter=4,mac=112233445566',
  },
  {
    description: 'Venus meter-type TPM2-100CT with configured MAC',
    deviceType: 'HMG-1',
    initialState: { meterMac: '112233445566' },
    command: 'meter-type',
    input: 'tpm2100ct',
    expectedOutput: 'cd=18,meter=11,mac=112233445566',
  },
  {
    description: 'Venus meter-type SMR-P1 with configured MAC',
    deviceType: 'VNSA-0',
    initialState: { meterMac: '112233445566' },
    command: 'meter-type',
    input: 'smrP1',
    expectedOutput: 'cd=18,meter=8,mac=112233445566',
  },
  {
    description: 'Venus meter-type Shelly Pro 3EM forces all-zero MAC',
    deviceType: 'HMG-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'shellyPro3em',
    expectedOutput: 'cd=18,meter=1,mac=000000000000',
  },
  {
    description: 'Venus meter-type CT001 without MAC uses all-zero MAC',
    deviceType: 'HMG-1',
    command: 'meter-type',
    input: 'ct001',
    expectedOutput: 'cd=18,meter=0,mac=000000000000',
  },
  {
    description: 'Venus meter-type CT002 without MAC is rejected',
    deviceType: 'HMG-1',
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type SMR-P1 is refused before HMG control firmware 156',
    deviceType: 'HMG-50',
    initialState: { meterMac: '112233445566', deviceVersion: 155 },
    command: 'meter-type',
    input: 'smrP1',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type SMR-P1 on HMG control firmware 156',
    deviceType: 'HMG-50',
    initialState: { meterMac: '112233445566', deviceVersion: 156 },
    command: 'meter-type',
    input: 'smrP1',
    expectedOutput: 'cd=18,meter=8,mac=112233445566',
  },
  {
    description: 'Venus meter-type EcoTracker is refused on HMG control firmware 147',
    deviceType: 'HMG-50',
    initialState: { meterMac: '112233445566', deviceVersion: 147 },
    command: 'meter-type',
    input: 'ecoTracker',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type EcoTracker on HMG control firmware 148',
    deviceType: 'HMG-50',
    initialState: { meterMac: '112233445566', deviceVersion: 148 },
    command: 'meter-type',
    input: 'ecoTracker',
    expectedOutput: 'cd=18,meter=7,mac=112233445566',
  },
  {
    description: 'Venus meter-type Shelly EM Gen3 is refused on HMG control firmware 146',
    deviceType: 'HMG-50',
    initialState: { meterMac: '112233445566', deviceVersion: 146 },
    command: 'meter-type',
    input: 'shellyEmGen3',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type SMR-P1 on HMG control firmware 158.1',
    deviceType: 'HMG-25',
    initialState: { meterMac: '112233445566', deviceVersion: 1581 },
    command: 'meter-type',
    input: 'smrP1',
    expectedOutput: 'cd=18,meter=8,mac=112233445566',
  },
  {
    description: 'Venus meter-type TPM2-100CT on every Venus E 3.0 build',
    deviceType: 'VNSE3-0',
    initialState: { meterMac: '112233445566', deviceVersion: 144 },
    command: 'meter-type',
    input: 'tpm2100ct',
    expectedOutput: 'cd=18,meter=11,mac=112233445566',
  },
  {
    description: 'Venus meter-type P1 Meter without MAC is sent without one',
    deviceType: 'VNSD-0',
    command: 'meter-type',
    input: 'p1Meter',
    expectedOutput: 'cd=18,meter=2',
    expectedStateChanges: { meterType: 'p1Meter' },
  },
  {
    description: 'Venus meter-type EcoTracker without MAC is sent without one',
    deviceType: 'HMG-50',
    command: 'meter-type',
    input: 'ecoTracker',
    expectedOutput: 'cd=18,meter=7',
  },
  {
    description: 'Venus meter-type Stromleser on the Venus A',
    deviceType: 'VNSA-0',
    command: 'meter-type',
    input: 'stromleser',
    expectedOutput: 'cd=18,meter=12',
  },
  {
    description: 'Venus meter-type Stromleser is refused on the Venus C/E (HMG)',
    deviceType: 'HMG-50',
    command: 'meter-type',
    input: 'stromleser',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type Stromleser is refused on Venus E 3.0 control firmware 144',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 144 },
    command: 'meter-type',
    input: 'stromleser',
    expectedOutput: null,
  },
  {
    description: 'Venus meter-type Stromleser on Venus E 3.0 control firmware 147',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 147 },
    command: 'meter-type',
    input: 'stromleser',
    expectedOutput: 'cd=18,meter=12',
  },
  {
    description: 'Venus meter-mac re-applies a Stromleser with the new MAC',
    deviceType: 'VNSD-0',
    initialState: { meterType: 'stromleser' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: 'cd=18,meter=12,mac=aabbccddeeff',
  },
  {
    description: 'Venus meter-type invalid',
    deviceType: 'HMG-1',
    command: 'meter-type',
    input: 'invalid',
    expectedOutput: null,
  },

  // version-set command: only the power versions the model and build accept
  {
    description: 'Venus version-set 800W',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '800W',
    expectedOutput: 'cd=15,vs=800',
  },
  {
    description: 'Venus version-set 2500W',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '2500W',
    expectedOutput: 'cd=15,vs=2500',
  },
  {
    description: 'Venus version-set 1200W is not an HMG power version',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '1200W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set 3600W is not an HMG power version',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '3600W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set invalid',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '1000W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set 600W refused on VNSE3 before control firmware 149',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 148 },
    command: 'version-set',
    input: '600W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set 600W on VNSE3 control firmware 151',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 151 },
    command: 'version-set',
    input: '600W',
    expectedOutput: 'cd=15,vs=600',
  },
  {
    description: 'Venus version-set 2200W refused on VNSA control firmware 151',
    deviceType: 'VNSA-0',
    initialState: { deviceVersion: 151 },
    command: 'version-set',
    input: '2200W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set 2200W on VNSA control firmware 148',
    deviceType: 'VNSA-0',
    initialState: { deviceVersion: 148 },
    command: 'version-set',
    input: '2200W',
    expectedOutput: 'cd=15,vs=2200',
  },
  {
    description: 'Venus version-set 2500W refused on VNSD control firmware 147',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 147 },
    command: 'version-set',
    input: '2500W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set refused on HMG while on the 600W version',
    deviceType: 'HMG-50',
    initialState: { versionSet: '600W', deviceVersion: 156 },
    command: 'version-set',
    input: '800W',
    expectedOutput: null,
  },
  {
    description: 'Venus version-set refused on HMG control firmware 147 (no cd=15)',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 147 },
    command: 'version-set',
    input: '800W',
    expectedOutput: null,
  },

  // max-discharge-power command (cd=17,dp=)
  {
    description: 'Venus max-discharge-power valid',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '1500',
    expectedOutput: 'cd=17,dp=1500',
    expectedStateChanges: { maxDischargePower: 1500 },
  },
  {
    description: 'Venus max-discharge-power 0 refused',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '0',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power maximum',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '2500',
    expectedOutput: 'cd=17,dp=2500',
  },
  {
    description: 'Venus max-discharge-power above max (invalid)',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '2501',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power not an integer (invalid)',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '1000.5',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power at the Venus A maximum',
    deviceType: 'VNSA-0',
    command: 'max-discharge-power',
    input: '1500',
    expectedOutput: 'cd=17,dp=1500',
  },
  {
    description: 'Venus max-discharge-power above the Venus A maximum',
    deviceType: 'VNSA-0',
    command: 'max-discharge-power',
    input: '1600',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power above 2200 W on VNSD control firmware 147',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 147 },
    command: 'max-discharge-power',
    input: '2300',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power up to 2500 W on VNSD control firmware 149',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 149 },
    command: 'max-discharge-power',
    input: '2300',
    expectedOutput: 'cd=17,dp=2300',
  },
  {
    description: 'Venus max-discharge-power above 800 W refused on the 800 W version',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156, versionSet: '800W' },
    command: 'max-discharge-power',
    input: '1000',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power above 600 W refused on the 600 W version',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 151, versionSet: '600W' },
    command: 'max-discharge-power',
    input: '700',
    expectedOutput: null,
  },
  {
    description: 'Venus max-discharge-power on the 2500 W version',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156, versionSet: '2500W' },
    command: 'max-discharge-power',
    input: '1000',
    expectedOutput: 'cd=17,dp=1000',
  },
  {
    description: 'Venus max-discharge-power refused on HMG control firmware 147',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 147 },
    command: 'max-discharge-power',
    input: '1000',
    expectedOutput: null,
  },

  // max-charging-power command
  {
    description: 'Venus max-charging-power valid',
    deviceType: 'HMG-1',
    command: 'max-charging-power',
    input: '2000',
    expectedOutput: 'cd=16,cp=2000',
  },
  {
    description: 'Venus max-charging-power above max (invalid)',
    deviceType: 'HMG-1',
    command: 'max-charging-power',
    input: '3000',
    expectedOutput: null,
  },
  {
    description: 'Venus max-charging-power above the Venus A maximum',
    deviceType: 'VNSA-0',
    command: 'max-charging-power',
    input: '2000',
    expectedOutput: null,
  },
  {
    description: 'Venus max-charging-power at the Venus A maximum',
    deviceType: 'VNSA-0',
    initialState: { deviceVersion: 151 },
    command: 'max-charging-power',
    input: '1500',
    expectedOutput: 'cd=16,cp=1500',
  },
  {
    description: 'Venus max-charging-power below 300 W refused on VNSE3 control firmware 151',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 151 },
    command: 'max-charging-power',
    input: '200',
    expectedOutput: null,
  },
  {
    description: 'Venus max-charging-power below 300 W on VNSE3 control firmware 148',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 148 },
    command: 'max-charging-power',
    input: '200',
    expectedOutput: 'cd=16,cp=200',
  },
  {
    description: 'Venus max-charging-power below 300 W while the build is unknown',
    deviceType: 'VNSA-0',
    command: 'max-charging-power',
    input: '200',
    expectedOutput: 'cd=16,cp=200',
  },
  {
    description: 'Venus max-charging-power below 300 W on HMG',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156 },
    command: 'max-charging-power',
    input: '200',
    expectedOutput: 'cd=16,cp=200',
    expectedStateChanges: { maxChargingPower: 200 },
  },
  {
    description: 'Venus max-charging-power below 300 W refused on VNSD control firmware 149.2',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 1492 },
    command: 'max-charging-power',
    input: '200',
    expectedOutput: null,
  },
  {
    description: 'Venus max-charging-power below 300 W on VNSD control firmware 149',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 149 },
    command: 'max-charging-power',
    input: '200',
    expectedOutput: 'cd=16,cp=200',
  },
  {
    description: 'Venus max-charging-power above 2200 W on VNSD control firmware 147',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 147 },
    command: 'max-charging-power',
    input: '2300',
    expectedOutput: null,
  },
  {
    description: 'Venus max-charging-power up to 2500 W on VNSD control firmware 151',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 151 },
    command: 'max-charging-power',
    input: '2500',
    expectedOutput: 'cd=16,cp=2500',
  },

  // discharge-depth command (Venus: 30-88%)
  {
    description: 'Venus discharge-depth valid',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '70',
    expectedOutput: 'cd=56,dod=70',
  },
  {
    description: 'Venus discharge-depth minimum (30%)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '30',
    expectedOutput: 'cd=56,dod=30',
  },
  {
    description: 'Venus discharge-depth near maximum (86%) sent as-is',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '86',
    expectedOutput: 'cd=56,dod=86',
  },
  {
    // The device encodes the maximum depth of discharge (88%) as 0.
    description: 'Venus discharge-depth maximum (88%) sent as 0',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '88',
    expectedOutput: 'cd=56,dod=0',
  },
  {
    description: 'Venus discharge-depth below minimum (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '29',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth 89% on HMG sent as-is',
    deviceType: 'HMG-50',
    command: 'discharge-depth',
    input: '89',
    expectedOutput: 'cd=56,dod=89',
  },
  {
    description: 'Venus discharge-depth HMG maximum (90%) sent as-is',
    deviceType: 'HMG-50',
    command: 'discharge-depth',
    input: '90',
    expectedOutput: 'cd=56,dod=90',
    expectedStateChanges: { depthOfDischarge: 90 },
  },
  {
    description: 'Venus discharge-depth above the HMG maximum (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '91',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth above the Venus A maximum (invalid)',
    deviceType: 'VNSA-0',
    command: 'discharge-depth',
    input: '89',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth Venus D maximum (88%) sent as 0',
    deviceType: 'VNSD-0',
    command: 'discharge-depth',
    input: '88',
    expectedOutput: 'cd=56,dod=0',
  },
  {
    description: 'Venus discharge-depth with trailing garbage (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '88foo',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth with decimal (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '30.5',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth empty payload (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: '',
    expectedOutput: null,
  },
  {
    description: 'Venus discharge-depth with surrounding whitespace (invalid)',
    deviceType: 'HMG-1',
    command: 'discharge-depth',
    input: ' 70 ',
    expectedOutput: null,
  },

  // local-api-enabled command (cd=30; HMG from 153, every VNS build)
  {
    description: 'Venus local-api-enabled enable',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiEnabled: false, localApiPort: 8080 },
    command: 'local-api-enabled',
    input: 'true',
    expectedOutput: 'cd=30,api=1,port=8080',
  },
  {
    description: 'Venus local-api-enabled disable',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiEnabled: true, localApiPort: 8080 },
    command: 'local-api-enabled',
    input: 'false',
    expectedOutput: 'cd=30,api=0,port=8080',
  },
  {
    description: 'Venus local-api-enabled without a reported local API state (no output)',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153 },
    command: 'local-api-enabled',
    input: 'true',
    expectedOutput: null,
  },
  {
    description: 'Venus local-api-enabled refused on HMG control firmware 152',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 152, localApiEnabled: false },
    command: 'local-api-enabled',
    input: 'true',
    expectedOutput: null,
  },
  {
    description: 'Venus local-api-enabled on VNSD control firmware 147',
    deviceType: 'VNSD-0',
    initialState: { deviceVersion: 147, localApiEnabled: false, localApiPort: 30000 },
    command: 'local-api-enabled',
    input: 'ON',
    expectedOutput: 'cd=30,api=1,port=30000',
  },

  // local-api-port command: `api` must precede `port`
  {
    description: 'Venus local-api-port valid',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiEnabled: true },
    command: 'local-api-port',
    input: '9090',
    expectedOutput: 'cd=30,api=1,port=9090',
    expectedStateChanges: { localApiPort: 9090 },
  },
  {
    description: 'Venus local-api-port on VNSA control firmware 143',
    deviceType: 'VNSA-0',
    initialState: { deviceVersion: 143, localApiEnabled: true },
    command: 'local-api-port',
    input: '48977',
    expectedOutput: 'cd=30,api=1,port=48977',
  },
  {
    description: 'Venus local-api-port invalid (above max)',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiEnabled: true },
    command: 'local-api-port',
    input: '70000',
    expectedOutput: null,
  },
  {
    description: 'Venus local-api-port invalid (0)',
    deviceType: 'VNSE3-0',
    initialState: { deviceVersion: 151, localApiEnabled: true },
    command: 'local-api-port',
    input: '0',
    expectedOutput: null,
  },
  {
    description: 'Venus local-api-port without a reported local API state (no output)',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 156 },
    command: 'local-api-port',
    input: '9090',
    expectedOutput: null,
  },

  // parallel-mode command (cd=23)
  {
    description: 'Venus parallel-mode on',
    deviceType: 'HMG-1',
    command: 'parallel-mode',
    input: 'on',
    expectedOutput: 'cd=23,pm=2',
  },
  {
    description: 'Venus parallel-mode wiring check',
    deviceType: 'HMG-1',
    command: 'parallel-mode',
    input: 'wiringCheck',
    expectedOutput: 'cd=23,pm=1',
  },
  {
    description: 'Venus parallel-mode off',
    deviceType: 'HMG-1',
    command: 'parallel-mode',
    input: 'off',
    expectedOutput: 'cd=23,pm=0',
  },
  {
    description: 'Venus parallel-mode rejects the read-only unknown state',
    deviceType: 'HMG-1',
    command: 'parallel-mode',
    input: 'unknown',
    expectedOutput: null,
  },

  // peak-shaving commands (cd=63)
  {
    description: 'Venus peak-shaving enable uses the configured cap',
    deviceType: 'HMG-1',
    initialState: { peakShavingPower: 4500 },
    command: 'peak-shaving',
    input: 'true',
    expectedOutput: 'cd=63,as=1,vv=4500',
  },
  {
    description: 'Venus peak-shaving enable falls back to the app default cap',
    deviceType: 'HMG-1',
    command: 'peak-shaving',
    input: 'ON',
    expectedOutput: 'cd=63,as=1,vv=2000',
  },
  {
    description: 'Venus peak-shaving disable omits the cap',
    deviceType: 'HMG-1',
    initialState: { peakShavingPower: 4500 },
    command: 'peak-shaving',
    input: 'false',
    expectedOutput: 'cd=63,as=0',
  },
  {
    description: 'Venus peak-shaving-power while enabled re-applies the cap',
    deviceType: 'HMG-1',
    initialState: { peakShavingEnabled: true },
    command: 'peak-shaving-power',
    input: '3000',
    expectedOutput: 'cd=63,as=1,vv=3000',
  },
  {
    description: 'Venus peak-shaving-power while disabled only stores the cap',
    deviceType: 'HMG-1',
    initialState: { peakShavingEnabled: false },
    command: 'peak-shaving-power',
    input: '3000',
    expectedOutput: null,
    expectedStateChanges: { peakShavingPower: 3000 },
  },
  {
    description: 'Venus peak-shaving-power invalid',
    deviceType: 'HMG-1',
    initialState: { peakShavingEnabled: true },
    command: 'peak-shaving-power',
    input: 'nonsense',
    expectedOutput: null,
  },

  // refresh command
  {
    description: 'Venus refresh with PRESS',
    deviceType: 'HMG-1',
    command: 'refresh',
    input: 'PRESS',
    expectedOutput: 'cd=1',
  },
  {
    description: 'Venus refresh with true',
    deviceType: 'HMG-1',
    command: 'refresh',
    input: 'true',
    expectedOutput: 'cd=1',
  },

  // factory-reset command
  {
    description: 'Venus factory-reset with PRESS',
    deviceType: 'HMG-1',
    command: 'factory-reset',
    input: 'PRESS',
    expectedOutput: 'cd=5,rs=2',
  },

  // restart command (cd=28): every VNS build, HMG from 151
  {
    description: 'Venus restart with PRESS on the Venus D',
    deviceType: 'VNSD-0',
    command: 'restart',
    input: 'PRESS',
    expectedOutput: 'cd=28',
  },
  {
    description: 'Venus restart refused on HMG control firmware 149',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 149 },
    command: 'restart',
    input: 'PRESS',
    expectedOutput: null,
  },
  {
    description: 'Venus restart on HMG control firmware 151',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 151 },
    command: 'restart',
    input: 'PRESS',
    expectedOutput: 'cd=28',
  },
  {
    description: 'Venus restart on HMG control firmware 158.1 (dev_n=1581)',
    deviceType: 'HMG-25',
    initialState: { deviceVersion: 1581 },
    command: 'restart',
    input: 'PRESS',
    expectedOutput: 'cd=28',
  },
  {
    description: 'Venus restart ignores an unrelated payload',
    deviceType: 'VNSE3-0',
    command: 'restart',
    input: 'nope',
    expectedOutput: null,
  },

  // get-ct-power command
  {
    description: 'Venus get-ct-power with PRESS',
    deviceType: 'HMG-1',
    command: 'get-ct-power',
    input: 'PRESS',
    expectedOutput: 'cd=19',
  },

  // backup-enabled command (cd=11)
  {
    description: 'Venus backup-enabled enable',
    deviceType: 'HMG-1',
    command: 'backup-enabled',
    input: 'true',
    expectedOutput: 'cd=11,bc=1',
  },
  {
    description: 'Venus backup-enabled disable',
    deviceType: 'HMG-1',
    command: 'backup-enabled',
    input: 'false',
    expectedOutput: 'cd=11,bc=0',
  },

  // led-enabled command (cd=59)
  {
    description: 'Venus led-enabled enable',
    deviceType: 'HMG-1',
    command: 'led-enabled',
    input: 'true',
    expectedOutput: 'cd=59,led=1',
  },
  {
    description: 'Venus led-enabled disable',
    deviceType: 'HMG-1',
    command: 'led-enabled',
    input: 'false',
    expectedOutput: 'cd=59,led=0',
  },

  // surplus-feed-in command (cd=43)
  {
    description: 'Venus surplus-feed-in enable',
    deviceType: 'HMG-1',
    command: 'surplus-feed-in',
    input: 'true',
    expectedOutput: 'cd=43,full_d=1',
  },
  {
    description: 'Venus surplus-feed-in disable',
    deviceType: 'HMG-1',
    command: 'surplus-feed-in',
    input: 'false',
    expectedOutput: 'cd=43,full_d=0',
  },

  // bluetooth-advertising command (cd=55)
  {
    description: 'Venus bluetooth-advertising enable',
    deviceType: 'HMG-1',
    command: 'bluetooth-advertising',
    input: 'true',
    expectedOutput: 'cd=55,adv=1',
  },
  {
    description: 'Venus bluetooth-advertising disable',
    deviceType: 'HMG-1',
    command: 'bluetooth-advertising',
    input: 'false',
    expectedOutput: 'cd=55,adv=0',
  },
  {
    description: 'Venus bluetooth-advertising refused on HMG control firmware 155',
    deviceType: 'HMG-50',
    initialState: { deviceVersion: 155 },
    command: 'bluetooth-advertising',
    input: 'on',
    expectedOutput: null,
  },
  {
    description: 'Venus bluetooth-advertising on HMG control firmware 158.1 (dev_n=1581)',
    deviceType: 'HMG-25',
    initialState: { deviceVersion: 1581 },
    command: 'bluetooth-advertising',
    input: 'on',
    expectedOutput: 'cd=55,adv=1',
  },
  {
    description: 'Venus bluetooth-advertising refused on VNSA control firmware 143',
    deviceType: 'VNSA-0',
    initialState: { deviceVersion: 143 },
    command: 'bluetooth-advertising',
    input: 'on',
    expectedOutput: null,
  },

  // phase-diagnosis command (cd=18,seq_check)
  {
    description: 'Venus phase-diagnosis with PRESS',
    deviceType: 'HMG-1',
    command: 'phase-diagnosis',
    input: 'PRESS',
    expectedOutput: 'cd=18,seq_check',
  },

  // Venus time-period commands
  {
    description: 'Venus time-period/0/enabled true',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: false, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/enabled',
    input: 'true',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Venus time-period/0/start-time valid',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/start-time',
    input: '6:30',
    expectedOutput: 'cd=3,md=1,nm=0,bt=06:30,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Venus time-period/0/end-time valid',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/end-time',
    input: '22:30',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=22:30,wk=127,vv=500,as=1',
  },
  {
    // The device parses `bt`/`et` positionally, so a single-digit hour has to be
    // zero-padded or it swallows the tens digit of the minutes (#184).
    description: 'Venus time-period/0/start-time zero-pads a single-digit hour',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/start-time',
    input: '2:43',
    expectedOutput: 'cd=3,md=1,nm=0,bt=02:43,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Venus time-period/0/end-time zero-pads a single-digit hour',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/end-time',
    input: '4:25',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=04:25,wk=127,vv=500,as=1',
  },
  {
    // A period whose stored state came back from the device as `9:05` must still
    // go out padded when an unrelated field is changed.
    description: 'Venus time-period/0/power zero-pads times carried over from device state',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '9:05', endTime: '1:30', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/power',
    input: '800',
    expectedOutput: 'cd=3,md=1,nm=0,bt=09:05,et=01:30,wk=127,vv=800,as=1',
  },
  {
    description: 'Venus time-period/0/power valid',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/power',
    input: '800',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=20:00,wk=127,vv=800,as=1',
  },
  {
    description: 'Venus time-period/0/weekday valid (weekdays only)',
    deviceType: 'HMG-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/weekday',
    input: '12345', // Monday-Friday
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=20:00,wk=62,vv=500,as=1', // 62 = 0b111110
  },

  // ============================================================
  // JUPITER (HMN, HMM, JPLS) COMMANDS
  // ============================================================

  // working-mode command
  {
    description: 'Jupiter working-mode automatic',
    deviceType: 'HMN-1',
    command: 'working-mode',
    input: 'automatic',
    expectedOutput: 'cd=2,md=1',
  },
  {
    description: 'Jupiter working-mode manual',
    deviceType: 'HMN-1',
    command: 'working-mode',
    input: 'manual',
    expectedOutput: 'cd=2,md=2',
  },
  {
    description: 'Jupiter working-mode ai',
    deviceType: 'HMN-1',
    command: 'working-mode',
    input: 'ai',
    expectedOutput: 'cd=2,md=5,nl=1',
  },
  {
    description: 'Jupiter working-mode invalid',
    deviceType: 'HMN-1',
    command: 'working-mode',
    input: 'trading', // Not valid for Jupiter
    expectedOutput: null,
  },

  // recharge-mode command (single-/three-phase)
  {
    description: 'Jupiter recharge-mode single phase',
    deviceType: 'HMN-1',
    command: 'recharge-mode',
    input: 'singlePhase',
    expectedOutput: 'cd=16,dchrg=0',
  },
  {
    description: 'Jupiter recharge-mode three phase',
    deviceType: 'HMN-1',
    command: 'recharge-mode',
    input: 'threePhase',
    expectedOutput: 'cd=16,dchrg=1',
  },
  {
    description: 'Jupiter meter-type CT002 with configured MAC',
    deviceType: 'HMN-1',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: 'cd=16,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterType: 'ct002' },
  },
  {
    description: 'Jupiter meter-type Shelly Pro 3EM forces all-zero MAC',
    deviceType: 'HMN-1',
    command: 'meter-type',
    input: 'shellyPro3em',
    expectedOutput: 'cd=16,meter=1,mac=000000000000',
  },
  {
    description: 'Jupiter meter-mac re-applies configured meter type with new MAC',
    deviceType: 'HMN-1',
    initialState: { meterType: 'ct003' },
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: 'cd=16,meter=4,mac=aabbccddeeff',
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },
  {
    description: 'Jupiter phase-diagnosis',
    deviceType: 'HMN-1',
    command: 'phase-diagnosis',
    input: 'PRESS',
    expectedOutput: 'cd=16,seq_check',
  },
  {
    description: 'Jupiter bluetooth-advertising enable',
    deviceType: 'HMN-1',
    command: 'bluetooth-advertising',
    input: 'on',
    expectedOutput: 'cd=57,adv=1',
    expectedStateChanges: { bluetoothAdvertisingEnabled: true },
  },
  {
    description: 'Jupiter bluetooth-advertising disable',
    deviceType: 'HMN-1',
    command: 'bluetooth-advertising',
    input: 'off',
    expectedOutput: 'cd=57,adv=0',
    expectedStateChanges: { bluetoothAdvertisingEnabled: false },
  },
  {
    description: 'Jupiter battery-pack-recovery',
    deviceType: 'JPLS-8H',
    command: 'battery-pack-recovery',
    input: 'PRESS',
    expectedOutput: 'cd=20,number_as',
  },
  {
    description: 'Jupiter meter-mac without configured meter type does not publish',
    deviceType: 'HMN-1',
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: null,
    expectedStateChanges: { meterMac: 'aabbccddeeff' },
  },

  // surplus-feed-in command
  {
    description: 'Jupiter surplus-feed-in enable',
    deviceType: 'HMN-1',
    command: 'surplus-feed-in',
    input: 'true',
    expectedOutput: 'cd=13,full_d=1',
  },
  {
    description: 'Jupiter surplus-feed-in disable',
    deviceType: 'HMN-1',
    command: 'surplus-feed-in',
    input: 'false',
    expectedOutput: 'cd=13,full_d=0',
  },

  // discharge-depth command (Jupiter: 30-90%)
  {
    description: 'Jupiter discharge-depth valid',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '70',
    expectedOutput: 'cd=56,dod=70',
  },
  {
    description: 'Jupiter discharge-depth minimum (30%)',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '30',
    expectedOutput: 'cd=56,dod=30',
  },
  {
    description: 'Jupiter discharge-depth maximum (90%)',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '90',
    expectedOutput: 'cd=56,dod=90',
  },
  {
    description: 'Jupiter discharge-depth below minimum (invalid)',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '29',
    expectedOutput: null,
  },
  {
    description: 'Jupiter discharge-depth above maximum (invalid)',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '91',
    expectedOutput: null,
  },

  // refresh command
  {
    description: 'Jupiter refresh with PRESS',
    deviceType: 'HMN-1',
    command: 'refresh',
    input: 'PRESS',
    expectedOutput: 'cd=1',
  },

  // factory-reset command
  {
    description: 'Jupiter factory-reset with PRESS',
    deviceType: 'HMN-1',
    command: 'factory-reset',
    input: 'PRESS',
    expectedOutput: 'cd=5,rs=2',
  },

  // Jupiter time-period commands
  {
    description: 'Jupiter time-period/0/enabled true',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'automatic',
      timePeriods: [
        { enabled: false, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/enabled',
    input: 'true',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Jupiter time-period/0/enabled true (manual mode)',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'manual',
      timePeriods: [
        { enabled: false, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/enabled',
    input: 'true',
    expectedOutput: 'cd=3,md=2,nm=0,bt=08:00,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Jupiter time-period/0/enabled true (ai mode preserves md=5)',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'ai',
      timePeriods: [
        { enabled: false, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/enabled',
    input: 'true',
    expectedOutput: 'cd=3,md=5,nm=0,bt=08:00,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Jupiter time-period/0/power valid',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'automatic',
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/power',
    input: '750',
    expectedOutput: 'cd=3,md=1,nm=0,bt=08:00,et=20:00,wk=127,vv=750,as=1',
  },
  {
    description: 'Jupiter time-period/0/start-time zero-pads a single-digit hour',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'automatic',
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/start-time',
    input: '2:43',
    expectedOutput: 'cd=3,md=1,nm=0,bt=02:43,et=20:00,wk=127,vv=500,as=1',
  },
  {
    description: 'Jupiter time-period/0/power above max (invalid)',
    deviceType: 'HMN-1',
    initialState: {
      workingMode: 'automatic',
      timePeriods: [
        { enabled: true, startTime: '8:00', endTime: '20:00', weekday: '0123456', power: 500 },
      ],
    },
    command: 'time-period/0/power',
    input: '801',
    expectedOutput: null,
  },

  // ============================================================
  // HMI INVERTER COMMANDS
  // ============================================================

  // max-output-power command
  {
    description: 'HMI inverter max-output-power valid',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '500',
    expectedOutput: 'cd=8,p1=500',
  },
  {
    description: 'HMI inverter max-output-power minimum',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '0',
    expectedOutput: 'cd=8,p1=0',
  },
  {
    description: 'HMI inverter max-output-power maximum',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '800',
    expectedOutput: 'cd=8,p1=800',
  },
  {
    description: 'HMI inverter max-output-power non-numeric (no validation in handler)',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: 'abc',
    expectedOutput: null,
  },

  // mode command
  {
    description: 'HMI inverter mode default',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'default',
    expectedOutput: 'cd=11,p1=0',
  },
  {
    description: 'HMI inverter mode b2500Boost',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'b2500Boost',
    expectedOutput: 'cd=11,p1=1',
  },
  {
    description: 'HMI inverter mode reverseCurrentProtection',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'reverseCurrentProtection',
    expectedOutput: 'cd=11,p1=2',
  },
  {
    description: 'HMI inverter mode invalid',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'invalid',
    expectedOutput: null,
  },

  // grid-connection-ban command
  {
    description: 'HMI inverter grid-connection-ban enable',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'true',
    expectedOutput: 'cd=22,p1=1',
  },
  {
    description: 'HMI inverter grid-connection-ban disable',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'false',
    expectedOutput: 'cd=22,p1=0',
  },
  {
    description: 'HMI inverter grid-connection-ban with on',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'on',
    expectedOutput: 'cd=22,p1=1',
  },
  {
    description: 'HMI inverter grid-connection-ban with 1',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: '1',
    expectedOutput: 'cd=22,p1=1',
  },

  // ============================================================
  // VENUS E MINI COMMANDS
  // ============================================================

  {
    description: 'Venus E Mini refresh with PRESS',
    deviceType: 'VNSEMINI-0',
    command: 'refresh',
    input: 'PRESS',
    expectedOutput: 'cd=01',
  },

  // The Marstek app picks this command's number from the device type: the
  // Venus variants take 55, Jupiter 57, and everything else — the Mini
  // included — falls back to 55.
  {
    description: 'Venus E Mini bluetooth-advertising enable',
    deviceType: 'VNSEMINI-0',
    command: 'bluetooth-advertising',
    input: 'true',
    expectedOutput: 'cd=55,adv=1',
  },
  {
    description: 'Venus E Mini bluetooth-advertising disable',
    deviceType: 'VNSEMINI-0',
    command: 'bluetooth-advertising',
    input: 'false',
    expectedOutput: 'cd=55,adv=0',
  },
  {
    description: 'Venus E Mini bluetooth-advertising with on',
    deviceType: 'VNSEMINI-0',
    command: 'bluetooth-advertising',
    input: 'on',
    expectedOutput: 'cd=55,adv=1',
  },
  {
    description: 'Venus E Mini bluetooth-advertising with 1',
    deviceType: 'VNSEMINI-0',
    command: 'bluetooth-advertising',
    input: '1',
    expectedOutput: 'cd=55,adv=1',
  },

  // Depth of discharge is cd=44 on this generation, where the Venus C/D/E use
  // cd=56 - see docs/venus-generations.md.
  {
    description: 'Venus E Mini discharge-depth at the minimum',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '30',
    expectedOutput: 'cd=44,do=30',
  },
  {
    description: 'Venus E Mini discharge-depth at the maximum',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '90',
    expectedOutput: 'cd=44,do=90',
  },
  {
    description: 'Venus E Mini discharge-depth sends the maximum as itself, not 0',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '90',
    expectedOutput: 'cd=44,do=90',
  },
  {
    description: 'Venus E Mini discharge-depth below the minimum is rejected',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '29',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini discharge-depth above the maximum is rejected',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '91',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini discharge-depth rejects a non-integer',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '50.5',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini discharge-depth rejects junk',
    deviceType: 'VNSEMINI-0',
    command: 'discharge-depth',
    input: '70foo',
    expectedOutput: null,
  },

  // Reboot is cd=61 here. The Venus C/D/E have no reboot command at all -
  // cd=10 on those models is the WiFi-module version query.
  {
    description: 'Venus E Mini restart with PRESS',
    deviceType: 'VNSEMINI-0',
    command: 'restart',
    input: 'PRESS',
    expectedOutput: 'cd=61',
  },
  {
    description: 'Venus E Mini restart ignores an unrelated payload',
    deviceType: 'VNSEMINI-0',
    command: 'restart',
    input: 'nope',
    expectedOutput: null,
  },

  // Working mode. The second generation's codes are 0/2/3, where the Venus
  // C/D/E use 0/1/2/5 - taking those would select the wrong mode.
  {
    description: 'Venus E Mini working-mode automatic',
    deviceType: 'VNSEMINI-0',
    command: 'working-mode',
    input: 'automatic',
    expectedOutput: 'cd=02,md=0',
    expectedStateChanges: { workingMode: 'automatic' },
  },
  {
    description: 'Venus E Mini working-mode manual',
    deviceType: 'VNSEMINI-0',
    command: 'working-mode',
    input: 'manual',
    expectedOutput: 'cd=02,md=2',
  },
  {
    description: 'Venus E Mini working-mode ai',
    deviceType: 'VNSEMINI-0',
    command: 'working-mode',
    input: 'ai',
    expectedOutput: 'cd=02,md=3',
  },
  {
    // `trading` is a Venus C/D/E mode with no counterpart here, so the shared
    // option names stop short of it rather than mapping it to something else.
    description: 'Venus E Mini working-mode rejects a mode this model lacks',
    deviceType: 'VNSEMINI-0',
    command: 'working-mode',
    input: 'trading',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini working-mode rejects junk',
    deviceType: 'VNSEMINI-0',
    command: 'working-mode',
    input: 'notamode',
    expectedOutput: null,
  },

  // Factory reset takes no rs parameter on this generation.
  {
    description: 'Venus E Mini factory-reset with PRESS',
    deviceType: 'VNSEMINI-0',
    command: 'factory-reset',
    input: 'PRESS',
    expectedOutput: 'cd=05',
  },
  {
    description: 'Venus E Mini factory-reset ignores an unrelated payload',
    deviceType: 'VNSEMINI-0',
    command: 'factory-reset',
    input: 'nope',
    expectedOutput: null,
  },

  // Meter type: the same cd=18 and the same meter codes as the other families.
  {
    description: 'Venus E Mini meter-type CT002 with configured MAC',
    deviceType: 'VNSEMINI-0',
    initialState: { meterMac: 'aabbccddeeff' },
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: 'cd=18,meter=3,mac=aabbccddeeff',
    expectedStateChanges: { meterType: 'ct002' },
  },
  {
    description: 'Venus E Mini meter-type Shelly Pro 3EM forces an all-zero MAC',
    deviceType: 'VNSEMINI-0',
    command: 'meter-type',
    input: 'shellyPro3em',
    expectedOutput: 'cd=18,meter=1,mac=000000000000',
  },
  {
    description: 'Venus E Mini meter-type CT002 without a MAC is rejected',
    deviceType: 'VNSEMINI-0',
    command: 'meter-type',
    input: 'ct002',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini meter-type rejects junk',
    deviceType: 'VNSEMINI-0',
    command: 'meter-type',
    input: 'notameter',
    expectedOutput: null,
  },
  {
    description: 'Venus E Mini meter-mac stores an uppercased MAC',
    deviceType: 'VNSEMINI-0',
    command: 'meter-mac',
    input: 'aabbccddeeff',
    expectedOutput: null,
    expectedStateChanges: { meterMac: 'AABBCCDDEEFF' },
  },
  {
    description: 'Venus E Mini meter-mac rejects a malformed MAC',
    deviceType: 'VNSEMINI-0',
    command: 'meter-mac',
    input: 'aabbcc',
    expectedOutput: null,
  },
];

describe('Device Commands', () => {
  let deviceManager: DeviceManager;
  let publishCallback: jest.Mock;
  let controlHandler: ControlHandler;
  let deviceState: DeviceStateData;

  function setupTest(
    deviceType: string,
    initialState?: Partial<DeviceStateData>,
    useFlashCommands = true,
  ) {
    const device: Device = {
      deviceType,
      deviceId: `test-${deviceType.toLowerCase()}`,
    };

    const config: MqttConfig = {
      brokerUrl: 'mqtt://test.mosquitto.org',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [device],
      responseTimeout: 15000,
    };

    deviceState = {} as DeviceStateData;
    const stateUpdateHandler = (_device: Device, _publishPath: string, state: DeviceStateData) => {
      deviceState = state;
    };

    deviceManager = new DeviceManager(config, stateUpdateHandler);

    // Set up initial state including useFlashCommands
    const baseState = { useFlashCommands, ...initialState };
    deviceManager.updateDeviceState(device, 'data', () => baseState);

    publishCallback = jest.fn();
    // Record only `(device, payload)`; the message index the handler also passes
    // is covered in controlHandler.test.ts and is not what these cases assert.
    controlHandler = new ControlHandler(deviceManager, (device, payload) =>
      publishCallback(device, payload),
    );

    return device;
  }

  function handleControlTopic(device: Device, command: string, message: string): void {
    const deviceTopics = deviceManager.getDeviceTopics(device);
    if (!deviceTopics) {
      throw new Error('Device topics not found');
    }
    const topic = `${deviceTopics.controlSubscriptionTopic}/${command}`;
    controlHandler.handleControlTopic(device, topic, message);
  }

  // Generate tests from test cases
  describe.each(commandTestCases)(
    '$deviceType $command: $description',
    ({
      deviceType,
      initialState,
      command,
      input,
      expectedOutput,
      expectedStateChanges,
      useFlashCommands,
    }) => {
      test(`input: "${input}" -> output: ${expectedOutput === null ? 'null' : JSON.stringify(expectedOutput)}`, () => {
        const device = setupTest(deviceType, initialState, useFlashCommands ?? true);

        handleControlTopic(device, command, input);

        if (expectedOutput === null) {
          expect(publishCallback).not.toHaveBeenCalled();
        } else if (Array.isArray(expectedOutput)) {
          expect(publishCallback.mock.calls).toEqual(
            expectedOutput.map(output => [device, output]),
          );
        } else {
          expect(publishCallback).toHaveBeenCalledWith(device, expectedOutput);
        }

        // Check expected state changes if specified
        if (expectedStateChanges) {
          for (const [key, value] of Object.entries(expectedStateChanges)) {
            expect(deviceState).toHaveProperty(key, value);
          }
        }
      });
    },
  );

  // Test for unknown command
  describe('Unknown commands', () => {
    test('should not call publish callback for unknown command', () => {
      const device = setupTest('HMA-1');
      handleControlTopic(device, 'unknown-command', 'value');
      expect(publishCallback).not.toHaveBeenCalled();
    });
  });
});
