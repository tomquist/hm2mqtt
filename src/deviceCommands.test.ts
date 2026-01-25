import { ControlHandler } from './controlHandler';
import { DeviceManager, DeviceStateData } from './deviceManager';
import { MqttConfig, Device } from './types';
import { DEFAULT_TOPIC_PREFIX } from './constants';

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
  /** Expected MQTT output message (null if no output expected) */
  expectedOutput: string | null;
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
    command: 'use-flash-commands',
    input: 'true',
    expectedOutput: null,
    expectedStateChanges: { useFlashCommands: true },
  },
  {
    description: 'B2500 use-flash-commands disable',
    deviceType: 'HMA-1',
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

  // sync-time command with JSON (V2 only)
  {
    description: 'B2500V2 sync-time with JSON',
    deviceType: 'HMA-1',
    command: 'sync-time',
    input: '{"wy":480,"yy":123,"mm":1,"rr":2,"hh":23,"mn":56,"ss":56}',
    expectedOutput: 'cd=8,wy=480,yy=123,mm=1,rr=2,hh=23,mn=56,ss=56',
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

  // time-period commands (V2 only)
  {
    description: 'B2500V2 time-period/1/enabled true',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: false, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/enabled',
    input: 'true',
    expectedOutput: 'cd=7,md=0,a1=1,b1=08:00,e1=20:00,v1=500',
  },
  {
    description: 'B2500V2 time-period/1/enabled false',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/enabled',
    input: 'false',
    expectedOutput: 'cd=7,md=0,a1=0,b1=08:00,e1=20:00,v1=500',
  },
  {
    description: 'B2500V2 time-period/1/start-time valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/start-time',
    input: '06:30',
    expectedOutput: 'cd=7,md=0,a1=1,b1=06:30,e1=20:00,v1=500',
  },
  {
    description: 'B2500V2 time-period/1/start-time invalid format (letters)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/start-time',
    input: 'abc',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/start-time invalid format (bad minutes)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/start-time',
    input: '12:99', // invalid minutes
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/1/end-time valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/end-time',
    input: '22:45',
    expectedOutput: 'cd=7,md=0,a1=1,b1=08:00,e1=22:45,v1=500',
  },
  {
    description: 'B2500V2 time-period/1/output-value valid',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/output-value',
    input: '750',
    expectedOutput: 'cd=7,md=0,a1=1,b1=08:00,e1=20:00,v1=750',
  },
  {
    description: 'B2500V2 time-period/1/output-value above max (invalid)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
    },
    command: 'time-period/1/output-value',
    input: '801',
    expectedOutput: null,
  },
  {
    description: 'B2500V2 time-period/6/enabled (invalid period number)',
    deviceType: 'HMA-1',
    initialState: {
      timePeriods: [
        { enabled: true, startTime: '08:00', endTime: '20:00', outputValue: 500 },
      ],
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
    description: 'Venus working-mode trading',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'trading',
    expectedOutput: 'cd=2,md=2',
  },
  {
    description: 'Venus working-mode invalid',
    deviceType: 'HMG-1',
    command: 'working-mode',
    input: 'invalid',
    expectedOutput: null,
  },

  // version-set command
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
    description: 'Venus version-set invalid',
    deviceType: 'HMG-1',
    command: 'version-set',
    input: '1000W',
    expectedOutput: null,
  },

  // max-discharge-power command
  {
    description: 'Venus max-discharge-power valid',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '1500',
    expectedOutput: 'cd=15,vs=1500',
  },
  {
    description: 'Venus max-discharge-power minimum',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '0',
    expectedOutput: 'cd=15,vs=0',
  },
  {
    description: 'Venus max-discharge-power maximum',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '2500',
    expectedOutput: 'cd=15,vs=2500',
  },
  {
    description: 'Venus max-discharge-power above max (invalid)',
    deviceType: 'HMG-1',
    command: 'max-discharge-power',
    input: '2501',
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

  // local-api-enabled command (requires firmware >= 153)
  {
    description: 'Venus local-api-enabled enable',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiPort: 8080 },
    command: 'local-api-enabled',
    input: 'true',
    expectedOutput: 'cd=30,api=1,port=8080',
  },
  {
    description: 'Venus local-api-enabled disable',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiPort: 8080 },
    command: 'local-api-enabled',
    input: 'false',
    expectedOutput: 'cd=30,api=0,port=8080',
  },
  {
    description: 'Venus local-api-enabled unsupported firmware (no output)',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 150 },
    command: 'local-api-enabled',
    input: 'true',
    expectedOutput: null,
  },

  // local-api-port command
  {
    description: 'Venus local-api-port valid',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153, localApiEnabled: true },
    command: 'local-api-port',
    input: '9090',
    expectedOutput: 'cd=30,port=9090,api=1',
  },
  {
    description: 'Venus local-api-port invalid (above max)',
    deviceType: 'HMG-1',
    initialState: { deviceVersion: 153 },
    command: 'local-api-port',
    input: '70000',
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

  // get-ct-power command
  {
    description: 'Venus get-ct-power with PRESS',
    deviceType: 'HMG-1',
    command: 'get-ct-power',
    input: 'PRESS',
    expectedOutput: 'cd=19',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=20:00,wk=127,vv=500,as=1',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=6:30,et=20:00,wk=127,vv=500,as=1',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=22:30,wk=127,vv=500,as=1',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=20:00,wk=127,vv=800,as=1',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=20:00,wk=62,vv=500,as=1', // 62 = 0b111110
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
    description: 'Jupiter working-mode invalid',
    deviceType: 'HMN-1',
    command: 'working-mode',
    input: 'trading', // Not valid for Jupiter
    expectedOutput: null,
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
  {
    description: 'Jupiter surplus-feed-in with 3 (feed-in active)',
    deviceType: 'HMN-1',
    command: 'surplus-feed-in',
    input: '3',
    expectedOutput: 'cd=13,full_d=1',
  },

  // discharge-depth command (Jupiter: 30-88%)
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
    description: 'Jupiter discharge-depth maximum (88%)',
    deviceType: 'HMN-1',
    command: 'discharge-depth',
    input: '88',
    expectedOutput: 'cd=56,dod=88',
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
    input: '89',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=20:00,wk=127,vv=500,as=1',
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
    expectedOutput: 'cd=3,md=2,nm=0,bt=8:00,et=20:00,wk=127,vv=500,as=1',
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
    expectedOutput: 'cd=3,md=1,nm=0,bt=8:00,et=20:00,wk=127,vv=750,as=1',
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
  // MI800 (HMI) COMMANDS
  // ============================================================

  // max-output-power command
  {
    description: 'MI800 max-output-power valid',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '500',
    expectedOutput: 'cd=8,p1=500',
  },
  {
    description: 'MI800 max-output-power minimum',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '0',
    expectedOutput: 'cd=8,p1=0',
  },
  {
    description: 'MI800 max-output-power maximum',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: '800',
    expectedOutput: 'cd=8,p1=800',
  },
  {
    description: 'MI800 max-output-power non-numeric (no validation in handler)',
    deviceType: 'HMI-1',
    command: 'max-output-power',
    input: 'abc',
    expectedOutput: null,
  },

  // mode command
  {
    description: 'MI800 mode default',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'default',
    expectedOutput: 'cd=11,p1=0',
  },
  {
    description: 'MI800 mode b2500Boost',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'b2500Boost',
    expectedOutput: 'cd=11,p1=1',
  },
  {
    description: 'MI800 mode reverseCurrentProtection',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'reverseCurrentProtection',
    expectedOutput: 'cd=11,p1=2',
  },
  {
    description: 'MI800 mode invalid',
    deviceType: 'HMI-1',
    command: 'mode',
    input: 'invalid',
    expectedOutput: null,
  },

  // grid-connection-ban command
  {
    description: 'MI800 grid-connection-ban enable',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'true',
    expectedOutput: 'cd=22,p1=1',
  },
  {
    description: 'MI800 grid-connection-ban disable',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'false',
    expectedOutput: 'cd=22,p1=0',
  },
  {
    description: 'MI800 grid-connection-ban with on',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: 'on',
    expectedOutput: 'cd=22,p1=1',
  },
  {
    description: 'MI800 grid-connection-ban with 1',
    deviceType: 'HMI-1',
    command: 'grid-connection-ban',
    input: '1',
    expectedOutput: 'cd=22,p1=1',
  },
];

describe('Device Commands', () => {
  let deviceManager: DeviceManager;
  let publishCallback: jest.Mock;
  let controlHandler: ControlHandler;
  let deviceState: DeviceStateData;

  function setupTest(deviceType: string, initialState?: Partial<DeviceStateData>, useFlashCommands = true) {
    const device: Device = {
      deviceType,
      deviceId: `test-${deviceType.toLowerCase()}`,
    };

    const config: MqttConfig = {
      brokerUrl: 'mqtt://test.mosquitto.org',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
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
    controlHandler = new ControlHandler(deviceManager, publishCallback);

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
    ({ deviceType, initialState, command, input, expectedOutput, expectedStateChanges, useFlashCommands }) => {
      test(`input: "${input}" -> output: ${expectedOutput === null ? 'null' : `"${expectedOutput}"`}`, () => {
        const device = setupTest(deviceType, initialState, useFlashCommands ?? true);

        handleControlTopic(device, command, input);

        if (expectedOutput === null) {
          expect(publishCallback).not.toHaveBeenCalled();
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
