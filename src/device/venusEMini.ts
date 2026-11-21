import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import {
  MeterType,
  VenusMiniDeviceData,
  VenusMiniTimePeriod,
  VenusMiniWorkingMode,
  WeekdaySet,
  isValidMeterType,
  isValidVenusMiniFeedInPowerLimit,
  isValidVenusMiniGridChargePowerLimit,
  isValidVenusMiniPhaseMode,
  isValidVenusMiniScheduleDirection,
  isValidVenusMiniWorkingMode,
  meterTypeCommandCodes,
  meterTypeLabels,
  resolveMeterMac,
  venusMiniScheduleDirectionCodes,
  venusMiniWorkingModeCommandCodes,
} from '../types.js';
import { registerNetworkInfoMessage } from './networkInfoBase.js';
import {
  binarySensorComponent,
  buttonComponent,
  numberComponent,
  selectComponent,
  sensorComponent,
  switchComponent,
  textComponent,
} from '../homeAssistantDiscovery.js';
import logger from '../logger.js';
import { divide, equalsBoolean, identity, map, negateIfPositive, number } from '../transforms.js';

/**
 * Marstek Venus E Mini, device type `VNSEMINI-X` (e.g. `VNSEMINI-0`).
 *
 * Despite the name, this model does not speak the protocol the other Venus
 * variants use: its runtime response shares almost no field names with the
 * HMG/VNSE3/VNSA/VNSD family, so it gets its own definition here rather than
 * reusing anything in `venus.ts`.
 *
 * Only the runtime response to `cd=01` has been captured from a real device.
 * The commands were first read out of the Marstek app's command table for this
 * model, then checked against the control firmware itself (PMU 309 / V135,
 * with inverter firmware 270), run in marsemu (github.com/tomquist/marsemu):
 * what each handler parses, where it stores the values and what reads them.
 * They have not all been confirmed on hardware. Fields whose meaning is not
 * known are exposed verbatim as disabled-by-default sensors under
 * `raw`/`ctRaw` rather than being given a name that asserts a meaning.
 *
 * How the firmware reads a command: it splits the message at `,`, takes what
 * follows each `=` and splits that again at `:`, and stores the numbers in
 * order - so `st=08:15` is two values, the key names are ignored, values are
 * 16-bit unsigned, and a value that is left out is whatever was on the stack.
 * Every command below therefore sends all of its values. Each handler is
 * found by searching the whole message for `cd=NN`.
 *
 * This model runs Marstek's second-generation Venus firmware, along with the
 * Venus X and Venus G. That generation numbers its commands differently from
 * the Venus C/D/E in venus.ts - depth of discharge is `cd=44` here and `cd=56`
 * there, the LED `cd=56` here and `cd=59` there - so nothing in venus.ts can
 * be reused, and a number read off that file is more likely wrong than right.
 * docs/venus-generations.md has the full map and how the two are told apart.
 *
 * That generation also writes every command number as two characters - `cd=01`,
 * `cd=02`, `cd=05` - and on this model the padding is not decoration: a real
 * device answered `cd=01` and ignored the bare `cd=1`. Its firmware evidently
 * matches the string rather than parsing the number, so every command below is
 * padded the way the app sends it.
 *
 * Commands the firmware has that are deliberately not exposed:
 *
 * - `cd=A0`..`cd=A3`: the firmware update of the control, inverter and DC/DC
 *   boards (`A1,cnt=` the number of images, `A2,num=` one image's `type`,
 *   `url`, `mod`, `size`, `crc`, `ver`, `A3` starts it, `A0` reports its state).
 * - `cd=60,ser=<n>`: the cloud region for the device's own HTTP requests
 *   (0 eu, 1 us, 2 dev, 3 staging), reported as `ser`.
 * - `cd=62,port=<n>`: a custom UDP port for the Shelly meters (default 1010
 *   for the Pro 3EM, 2222 for the EM gen3, 2223 for the Pro EM 50). Once set,
 *   there is no way back to the default.
 * - `cd=54` (anti-reverse flow, `am`/`aw`/`ap`): three values the control
 *   passes to the inverter; firmware 270 ignores the first two and uses the
 *   third in its output ramp. Reported as `ar`/`aw`/`apt`.
 * - `cd=53`: all six schedule slots in one message (48 values); the per-slot
 *   commands below do the same one slot at a time.
 * - `cd=32`, `cd=35`, `cd=38` and `cd=45` are accepted but change nothing in
 *   this firmware (`cd=38` is reported back as `gn`); `cd=46`, which the app's
 *   table lists for the grid-connection power, does not exist.
 * - `cd=59` answers with the last 15 samples of the device's power and SOC
 *   (`gn_pwr1`.., `bat_pwr1`.., `bat_soc1`.., `dev_sta1`..), nothing that is
 *   not in `cd=01` already.
 * - `CMD_SET_WIFI` (configure device WiFi) carries network credentials, and is
 *   Bluetooth-only anyway - it has no MQTT form.
 */

// The app's own setting screen enforces this range.
const MINI_DOD_MIN = 30;
const MINI_DOD_MAX = 90;

// The range the control firmware clamps the UPS charge power (cd=64) to.
const MINI_UPS_POWER_MIN = 100;
const MINI_UPS_POWER_MAX = 1500;

// The schedule slots' power: the firmware caps it at 1500 W.
const MINI_SCHEDULE_POWER_MAX = 1500;

const IPV4_PATTERN =
  '^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$';

/**
 * The MAC sent with `cd=18` for a meter type. The P1 Meter and the EcoTracker
 * are found by IP (`cd=66`) instead, but the firmware's `ct_t=%d,mac=%12s`
 * still expects a MAC, so they get the configured one or zeros.
 */
function miniMeterMac(meterType: MeterType, configuredMac?: string): string | null {
  if (meterType === 'p1Meter' || meterType === 'ecoTracker') {
    return configuredMac ?? '000000000000';
  }
  return resolveMeterMac(meterType, configuredMac);
}

const isOn = (message: string) => ['true', 'on', '1'].includes(message.toLowerCase());

const SCHEDULE_TIME_PATTERN = '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$';

/** `H:MM` or `HH:MM` as the zero-padded `HH:MM` the device reports, or null. */
function normalizeScheduleTime(value: string): string | null {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

/** re{n}, a weekday bitmask with bit 0 = Monday, as the digits of its set bits. */
function weekdayMaskToSet(value: string): WeekdaySet {
  const mask = parseInt(value, 10);
  let days = '';
  for (let day = 0; day < 7; day++) {
    if (mask & (1 << day)) days += day;
  }
  return days as WeekdaySet;
}

function weekdaySetToMask(days: WeekdaySet): number {
  return days.split('').reduce((mask, day) => mask | (1 << Number(day)), 0);
}

/**
 * The `cd=47`..`cd=52` command that sets schedule slot n (1-6) to `slot`, or
 * null while any of its values is unknown - the firmware stores all eight
 * values in order, so none can be left out.
 */
function scheduleSlotCommand(n: number, slot: VenusMiniTimePeriod): string | null {
  const { enabled, power, direction, startTime, endTime, weekday } = slot;
  if (
    enabled == null ||
    power == null ||
    direction == null ||
    direction === 'unknown' ||
    startTime == null ||
    endTime == null ||
    weekday == null
  ) {
    return null;
  }
  const start = normalizeScheduleTime(startTime);
  const end = normalizeScheduleTime(endTime);
  if (start === null || end === null) return null;
  return (
    `cd=${46 + n},m=${enabled ? 1 : 0},mp=${power},ms=${venusMiniScheduleDirectionCodes[direction]},` +
    `st=${start},et=${end},re=${weekdaySetToMask(weekday)}`
  );
}

const requiredMiniRuntimeInfoKeys = ['gp', 'lp', 'soc', 'be', 'pmu', 'wif_s', 'mq_s', 'm1', 'time'];
function isVenusMiniRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredMiniRuntimeInfoKeys.every(key => key in values);
}

const requiredCtPowerKeys = ['power_a', 'power_b', 'power_c'];
function isVenusMiniCtPowerMessage(values: Record<string, string>): boolean {
  return requiredCtPowerKeys.every(key => key in values);
}

// Keys the control firmware sends alongside power_a..power_s, with no
// confirmed meaning. See registerVenusMiniCtPowerMessage.
const venusMiniCtRawFields = ['d_p', 'ct_st'] as const;

function extractMiniAdditionalDeviceInfo(state: VenusMiniDeviceData) {
  return {
    firmwareVersion: state.pmuFirmwareVersion?.toString(),
  };
}

// Parses the Venus E Mini's device-local `time` field into an ISO-8601
// timestamp. The device does not zero-pad the individual components (e.g.
// "2026-8-23 7:47:40"), so passing it straight through made Home Assistant
// show malformed-looking values like "13:1:45". The device's clock is
// assumed to be in the host's local timezone - the same assumption the
// sync-time command makes when setting it. Falls back to the raw value if it
// doesn't match the expected shape.
const venusMiniDeviceTimePattern = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/;
function parseVenusMiniDeviceTime(value: string): string {
  const match = venusMiniDeviceTimePattern.exec(value);
  if (!match) {
    return value;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  // Date silently normalizes out-of-range components rather than rejecting
  // them: "2026-02-31" becomes March 3rd, hour 25 becomes 01:00 the next day.
  // The pattern above accepts any one- or two-digit component, so a corrupt
  // reading would otherwise be published as a plausible-looking wrong
  // timestamp. Only accept a date that reads back as what was parsed.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return value;
  }
  return date.toISOString();
}

// Fields the vendor app does parse, named after what it parses them into.
// That says what each one is about, but the codes of ls and gs are not known
// (only ls=1 and gs=5 have been seen), so they are reported as plain numbers
// and stay disabled by default. ser is the cloud region the device's own HTTP
// requests go to (0 eu, 1 us, 2 dev, 3 staging; set with cd=60, which is not
// exposed).
const venusMiniNamedRawFields = [
  { key: 'ls', path: 'loadState', id: 'load_state', name: 'Load State' },
  { key: 'gs', path: 'gridMode', id: 'grid_mode', name: 'Grid Mode' },
  { key: 'ser', path: 'serverState', id: 'server_state', name: 'Server State' },
] as const;

// Fields observed in the Venus E Mini's cd=1 payload with no confirmed
// meaning (see VENUS_MINI_NOTES.md and VENUS_MINI_IMPLEMENTATION_PROMPT.md).
// Exposed verbatim as disabled-by-default sensors, keyed by their raw MQTT
// field name, so the values are available for correlation without asserting
// semantics.
const venusMiniRawFields = [
  'eg',
  'cv',
  'gn',
  'ar',
  'aw',
  'apt',
  'e1',
  'e2',
  'e3',
  'e4',
  'e5',
  'e6',
  'e7',
];

function registerVenusMiniRuntimeInfoMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=01',
    isMessage: isVenusMiniRuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: extractMiniAdditionalDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  };
  message<VenusMiniDeviceData>(options, ({ field, advertise, command }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    // Negative = importing from the grid, positive = exporting.
    field({ key: 'gp', path: ['gridPower'], transform: number() });
    advertise(
      ['gridPower'],
      sensorComponent<number>({
        id: 'grid_power',
        name: 'Grid Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // ig always matched gp exactly, including sign flips, across every live
    // sample checked so far; kept as a separate disabled-by-default sensor in
    // case it diverges on other units or firmware, mirroring the
    // batteryPower/calculatedBatteryPower (bp/rp) precedent above.
    field({ key: 'ig', path: ['gridPowerAlt'], transform: number() });
    advertise(
      ['gridPowerAlt'],
      sensorComponent<number>({
        id: 'grid_power_alt',
        name: 'Grid Power (Alt)',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );

    // Matches the app's own "Backup" reading exactly.
    field({ key: 'lp', path: ['backupPower'], transform: number() });
    advertise(
      ['backupPower'],
      sensorComponent<number>({
        id: 'backup_power',
        name: 'Backup Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // inv_p also always matched gp exactly so far; see gridPowerAlt above.
    field({ key: 'inv_p', path: ['inverterPower'], transform: number() });
    advertise(
      ['inverterPower'],
      sensorComponent<number>({
        id: 'inverter_power',
        name: 'Inverter Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );

    // Live battery charge/discharge power. Negative = discharging, positive =
    // charging; confirmed against the app's own "Batterie" reading across
    // multiple samples.
    field({ key: 'dpt', path: ['batteryPower'], transform: number() });
    advertise(
      ['batteryPower'],
      sensorComponent<number>({
        id: 'battery_power',
        name: 'Battery Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // soc is reported ×10 (e.g. 966 -> 96.6%); cross-checked live against the
    // Hame cloud API's independently-reported value for the same device.
    field({ key: 'soc', path: ['batterySoc'], transform: divide(10) });
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

    field({ key: 'be', path: ['batteryEnergyStored'], transform: number() });
    advertise(
      ['batteryEnergyStored'],
      sensorComponent<number>({
        id: 'battery_energy_stored',
        name: 'Battery Energy Stored',
        device_class: 'energy_storage',
        unit_of_measurement: 'Wh',
        state_class: 'measurement',
      }),
    );

    // Usable-discharge percentage; the app enforces a 30-90% range and
    // reserves the remainder as backup capacity. Confirmed at both 90% and
    // 50% matching the app's own setting screen exactly.
    field({ key: 'do', path: ['dischargeDepth'], transform: number() });
    advertise(
      ['dischargeDepth'],
      numberComponent({
        id: 'depth_of_discharge',
        name: 'Depth of Discharge',
        device_class: 'battery',
        unit_of_measurement: '%',
        command: 'discharge-depth',
        min: MINI_DOD_MIN,
        max: MINI_DOD_MAX,
        step: 1,
      }),
    );
    // `cd=44,do=` is the second-generation form. The first-generation Venus
    // models use `cd=56,dod=` for the same setting - see
    // docs/venus-generations.md. Deliberately without the first generation's
    // quirk of sending its maximum as 0: that is a property of that firmware,
    // and nothing says this one shares it.
    command('discharge-depth', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const dod = /^\d+$/.test(message) ? parseInt(message, 10) : NaN;
        if (Number.isNaN(dod) || dod < MINI_DOD_MIN || dod > MINI_DOD_MAX) {
          logger.warn(
            `Invalid depth of discharge value (should be ${MINI_DOD_MIN}-${MINI_DOD_MAX}):`,
            message,
          );
          return;
        }
        updateDeviceState(() => ({ dischargeDepth: dod }));
        publishCallback(`cd=44,do=${dod}`);
      },
    });

    // pmu matched the firmware version reported by the Hame cloud API for the
    // same device exactly.
    field({ key: 'pmu', path: ['pmuFirmwareVersion'], transform: number() });
    advertise(
      ['pmuFirmwareVersion'],
      sensorComponent<number>({
        id: 'pmu_firmware_version',
        name: 'PMU Firmware Version',
        icon: 'mdi:information',
      }),
    );

    // inv/dcdc are presumed sibling sub-board firmware versions alongside pmu
    // (unconfirmed which sub-board is which).
    field({ key: 'inv', path: ['inverterFirmwareVersion'], transform: number() });
    advertise(
      ['inverterFirmwareVersion'],
      sensorComponent<number>({
        id: 'inverter_firmware_version',
        name: 'Inverter Firmware Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
    );

    field({ key: 'dcdc', path: ['dcdcFirmwareVersion'], transform: number() });
    advertise(
      ['dcdcFirmwareVersion'],
      sensorComponent<number>({
        id: 'dcdc_firmware_version',
        name: 'DCDC Firmware Version',
        icon: 'mdi:information',
        enabled_by_default: false,
      }),
    );

    field({ key: 'wif_s', path: ['wifiStatus'], transform: equalsBoolean('1') });
    advertise(
      ['wifiStatus'],
      binarySensorComponent({
        id: 'wifi_status',
        name: 'WiFi Status',
        device_class: 'connectivity',
        icon: 'mdi:wifi',
      }),
    );

    field({ key: 'mq_s', path: ['mqttStatus'], transform: equalsBoolean('1') });
    advertise(
      ['mqttStatus'],
      binarySensorComponent({
        id: 'mqtt_status',
        name: 'MQTT Status',
        device_class: 'connectivity',
        icon: 'mdi:lan',
      }),
    );

    // Confirmed as a live/fluctuating reading rather than a static value. The
    // device reports the magnitude of the RSSI, not the RSSI itself: the
    // vendor app flips the sign of any positive value before showing it as a
    // WiFi signal strength, so a reported 41 is -41 dBm. Only positive values
    // have been seen on the wire, but the app leaves an already-negative
    // value alone, and so does this: negating unconditionally would turn a
    // correctly signed -41 from some other firmware into +41. Reported in dBm
    // to match the wifiRssi sensor on the other models.
    field({ key: 'wifi_a', path: ['wifiSignal'], transform: negateIfPositive() });
    advertise(
      ['wifiSignal'],
      sensorComponent<number>({
        id: 'wifi_signal',
        name: 'WiFi Signal',
        device_class: 'signal_strength',
        unit_of_measurement: 'dBm',
        icon: 'mdi:wifi',
        state_class: 'measurement',
      }),
    );

    // The meter code last set with `cd=18,ct_t=<n>` (the Meter Type codes),
    // read back unchanged by the control firmware. It is 0 until a meter is
    // set, which is also CT001's code, so it stays a raw number rather than
    // being mapped to labels.
    field({ key: 'ct_type', path: ['ctType'], transform: number() });
    advertise(
      ['ctType'],
      sensorComponent<number>({
        id: 'ct_type',
        name: 'CT Type',
        icon: 'mdi:current-ac',
      }),
    );

    // 1 while the configured meter answers, 0 when none is set or it does not
    // answer (control firmware V135, in marsemu: a CT002 set with ct_t=3 and
    // answering reads 1; a Shelly Pro 3EM set with no Shelly on the network
    // reads 0).
    field({ key: 'ct', path: ['meterConnected'], transform: equalsBoolean('1') });
    advertise(
      ['meterConnected'],
      binarySensorComponent({
        id: 'meter_connected',
        name: 'Meter Connected',
        device_class: 'connectivity',
        icon: 'mdi:meter-electric',
      }),
    );

    // The phase that phase detection (`cd=58`) found: 0 until it has run, then
    // 1-3 for phase A-C (control firmware V135, run in marsemu).
    field({ key: 'ct_ph', path: ['ctPhase'], transform: number() });
    advertise(
      ['ctPhase'],
      sensorComponent<number>({
        id: 'ct_phase',
        name: 'CT Phase',
        icon: 'mdi:sine-wave',
      }),
    );

    // Working mode, `cd=02,md=<n>`, reported as cm. What the control firmware
    // does in each (V135):
    //   0 self-consumption: the inverter follows the meter;
    //   1 UPS: charges from the grid at the UPS charge power (cd=64);
    //   2 manual: the six schedule slots (cd=47..52);
    //   3 AI: the same evaluation over a plan the device fetches from the
    //     Marstek cloud - with no plan it idles.
    // Every other value behaves like 0, so unrecognised codes fall back to
    // `automatic`, as they do on the other Venus models.
    field({
      key: 'cm',
      path: ['workingMode'],
      transform: map(
        {
          '0': 'automatic',
          '1': 'ups',
          '2': 'manual',
          '3': 'ai',
        },
        'automatic',
      ),
    });
    advertise(
      ['workingMode'],
      selectComponent<VenusMiniWorkingMode>({
        id: 'working_mode',
        name: 'Working Mode',
        icon: 'mdi:cog',
        command: 'working-mode',
        // `cm=0` is the self-consumption mode, which the Marstek app labels as
        // such. The option is named "Automatic" to match the same mode on the
        // other Venus models - an entity reports its state by option name, so
        // diverging here would mean an automation that reads or sets the mode
        // could not treat the models alike, for no functional gain.
        valueMappings: {
          automatic: 'Automatic',
          ups: 'UPS',
          manual: 'Manual',
          ai: 'AI',
        },
      }),
    );
    command('working-mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusMiniWorkingMode(message)) {
          logger.warn('Invalid working mode value:', message);
          return;
        }
        updateDeviceState(() => ({ workingMode: message }));
        publishCallback(`cd=02,md=${venusMiniWorkingModeCommandCodes[message]}`);
      },
    });

    // 0/1/2 are confirmed against a real device; 3, 4 and 5 come from the
    // state table the vendor app builds for this model, which labels 3 as
    // bypass, 5 as a fault and both 2 and 4 as discharging - 4 maps to the
    // very same state value as 2 there, so it gets the same label here rather
    // than a name that invents a distinction.
    field({
      key: 'dev_sta',
      path: ['deviceState'],
      transform: map(
        {
          '0': 'standby',
          '1': 'charging',
          '2': 'discharging',
          '3': 'bypass',
          '4': 'discharging',
          '5': 'fault',
        },
        'unknown',
      ),
    });
    advertise(
      ['deviceState'],
      sensorComponent<NonNullable<VenusMiniDeviceData['deviceState']>>({
        id: 'device_state',
        name: 'Device State',
        icon: 'mdi:state-machine',
        valueMappings: {
          standby: 'Standby',
          charging: 'Charging',
          discharging: 'Discharging',
          bypass: 'Bypass',
          fault: 'Fault',
          unknown: 'Unknown',
        },
      }),
    );

    // Status LED, `cd=56,led=<n>`, reported as leds. Inverted: 0 means the LED
    // is on, 1 that it is off (a real device's toggle test, and the firmware,
    // which runs its LED logic only while the value is 0).
    field({ key: 'leds', path: ['ledEnabled'], transform: equalsBoolean('0') });
    advertise(
      ['ledEnabled'],
      switchComponent({
        id: 'led_enabled',
        name: 'Status LED',
        icon: 'mdi:led-on',
        command: 'led-enabled',
      }),
    );
    command('led-enabled', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enabled = isOn(message);
        updateDeviceState(() => ({ ledEnabled: enabled }));
        publishCallback(`cd=56,led=${enabled ? 0 : 1}`);
      },
    });

    // Bluetooth lock (Bluetooth-Sperre in the app): the value last set with
    // cd=55, which also drives the Bluetooth Advertising switch (see there).
    field({ key: 'bbs', path: ['bluetoothLockRaw'], transform: number() });
    advertise(
      ['bluetoothLockRaw'],
      sensorComponent<number>({
        id: 'bluetooth_lock_raw',
        name: 'Bluetooth Lock (Raw)',
        icon: 'mdi:bluetooth',
        enabled_by_default: false,
      }),
    );

    // The two power limits, both set with `cd=57,gps=<n>,ogpc=<n>`: the
    // control passes them to the inverter, which derives its clamps from
    // them. gps is the feed-in limit, 0 = 800 W and 1 = the app's "1500 W"
    // (confirmed both ways on a real device; inverter firmware 270 caps it at
    // 1250 W). ogpc is the grid-charge limit, 0 = 1250 W and 1 = 800 W; builds
    // that do not report it get 0, the default.
    field({
      key: 'gps',
      path: ['feedInPowerLimit'],
      transform: map(
        {
          '0': '800W',
          '1': '1500W',
        },
        'unknown',
      ),
    });
    advertise(
      ['feedInPowerLimit'],
      selectComponent<NonNullable<VenusMiniDeviceData['feedInPowerLimit']>>({
        id: 'feed_in_power_limit',
        name: 'Feed-in Power Limit',
        icon: 'mdi:transmission-tower-export',
        command: 'feed-in-power-limit',
        valueMappings: {
          '800W': '800 W',
          '1500W': '1500 W',
          unknown: 'Unknown',
        },
      }),
    );
    field({
      key: 'ogpc',
      path: ['gridChargePowerLimit'],
      transform: map({ '0': '1250W', '1': '800W' }, 'unknown'),
    });
    advertise(
      ['gridChargePowerLimit'],
      selectComponent<NonNullable<VenusMiniDeviceData['gridChargePowerLimit']>>({
        id: 'grid_charge_power_limit',
        name: 'Grid Charge Power Limit',
        icon: 'mdi:transmission-tower-import',
        command: 'grid-charge-power-limit',
        valueMappings: {
          '1250W': '1250 W',
          '800W': '800 W',
          unknown: 'Unknown',
        },
      }),
      { enabled: state => (state.gridChargePowerLimit != null ? true : undefined) },
    );
    const sendPowerLimits = (
      state: Pick<VenusMiniDeviceData, 'feedInPowerLimit' | 'gridChargePowerLimit'>,
      publishCallback: (payload: string) => void,
    ): boolean => {
      if (state.feedInPowerLimit !== '800W' && state.feedInPowerLimit !== '1500W') {
        logger.warn('The power limits cannot be set until the device reports its feed-in limit');
        return false;
      }
      const gps = state.feedInPowerLimit === '1500W' ? 1 : 0;
      const ogpc = state.gridChargePowerLimit === '800W' ? 1 : 0;
      publishCallback(`cd=57,gps=${gps},ogpc=${ogpc}`);
      return true;
    };
    command('feed-in-power-limit', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusMiniFeedInPowerLimit(message)) {
          logger.warn('Invalid feed-in power limit:', message);
          return;
        }
        updateDeviceState(state =>
          sendPowerLimits({ ...state, feedInPowerLimit: message }, publishCallback)
            ? { feedInPowerLimit: message }
            : undefined,
        );
      },
    });
    command('grid-charge-power-limit', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusMiniGridChargePowerLimit(message)) {
          logger.warn('Invalid grid charge power limit:', message);
          return;
        }
        updateDeviceState(state =>
          sendPowerLimits({ ...state, gridChargePowerLimit: message }, publishCallback)
            ? { gridChargePowerLimit: message }
            : undefined,
        );
      },
    });

    // UPS charge power, `cd=64,ups_p=<W>`, reported as ups_p: what the device
    // charges with from the grid in UPS mode. The firmware clamps it to
    // 100-1500 W. Not reported by older builds, which are left without it.
    field({ key: 'ups_p', path: ['upsChargePower'], transform: number() });
    advertise(
      ['upsChargePower'],
      numberComponent({
        id: 'ups_charge_power',
        name: 'UPS Charge Power',
        icon: 'mdi:battery-charging',
        unit_of_measurement: 'W',
        device_class: 'power',
        command: 'ups-charge-power',
        min: MINI_UPS_POWER_MIN,
        max: MINI_UPS_POWER_MAX,
        step: 1,
      }),
      { enabled: state => (state.upsChargePower != null ? true : undefined) },
    );
    command('ups-charge-power', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const power = Number(message);
        if (!Number.isInteger(power) || power < MINI_UPS_POWER_MIN || power > MINI_UPS_POWER_MAX) {
          logger.warn(
            `Invalid UPS charge power (expected ${MINI_UPS_POWER_MIN}-${MINI_UPS_POWER_MAX} W):`,
            message,
          );
          return;
        }
        updateDeviceState(() => ({ upsChargePower: power }));
        publishCallback(`cd=64,ups_p=${power}`);
      },
    });

    // Which phases the device balances, `cd=63,ct_chg_type=<n>` (the app's
    // CMD_SET_CT_CHARGE_TYPE), reported as rechg_type. With 0 it asks the meter
    // for its own phase and covers that one; with 1 it asks for the sum of all
    // three phases and covers the total - what a meter that nets the phases
    // bills. Checked in marsemu: 300 W on phase A and 500 W on B, battery on
    // A, covered 300 W with 0 and 800 W with 1.
    field({
      key: 'rechg_type',
      path: ['phaseMode'],
      transform: map({ '1': 'allPhases' }, 'ownPhase'),
    });
    advertise(
      ['phaseMode'],
      selectComponent<NonNullable<VenusMiniDeviceData['phaseMode']>>({
        id: 'phase_mode',
        name: 'Phase Mode',
        icon: 'mdi:sine-wave',
        command: 'phase-mode',
        valueMappings: {
          ownPhase: 'Own Phase',
          allPhases: 'All Phases',
        },
      }),
    );
    command('phase-mode', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidVenusMiniPhaseMode(message)) {
          logger.warn('Invalid phase mode:', message);
          return;
        }
        updateDeviceState(() => ({ phaseMode: message }));
        publishCallback(`cd=63,ct_chg_type=${message === 'allPhases' ? 1 : 0}`);
      },
    });

    // Local API (the Marstek Open API, JSON over UDP), `cd=65,en=<0|1>,
    // sp=<port>,rp=<port>`, reported as lapi_en, self_port and rem_port.
    // self_port is the port it listens on; rem_port is sent back as it is.
    // All three go in every command, so both entities wait for the report.
    field({ key: 'lapi_en', path: ['localApiEnabled'], transform: equalsBoolean('1') });
    field({ key: 'self_port', path: ['localApiPort'], transform: number() });
    field({ key: 'rem_port', path: ['localApiRemotePort'], transform: number() });
    type LocalApiState = Pick<
      VenusMiniDeviceData,
      'localApiEnabled' | 'localApiPort' | 'localApiRemotePort'
    >;
    const localApiReported = (state: LocalApiState) =>
      state.localApiEnabled != null &&
      state.localApiPort != null &&
      state.localApiRemotePort != null
        ? true
        : undefined;
    advertise(
      ['localApiEnabled'],
      switchComponent({
        id: 'local_api_enabled',
        name: 'Local API Enabled',
        icon: 'mdi:lan',
        command: 'local-api-enabled',
      }),
      { enabled: localApiReported },
    );
    advertise(
      ['localApiPort'],
      numberComponent({
        id: 'local_api_port',
        name: 'Local API Port',
        icon: 'mdi:numeric',
        command: 'local-api-port',
        min: 1,
        max: 65535,
        step: 1,
      }),
      { enabled: localApiReported },
    );
    const sendLocalApi = (
      state: LocalApiState,
      publishCallback: (payload: string) => void,
    ): boolean => {
      if (!localApiReported(state)) {
        logger.warn('Local API control is not available until the device reports its local API');
        return false;
      }
      publishCallback(
        `cd=65,en=${state.localApiEnabled ? 1 : 0},sp=${state.localApiPort},rp=${state.localApiRemotePort}`,
      );
      return true;
    };
    command('local-api-enabled', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enabled = isOn(message);
        updateDeviceState(state =>
          sendLocalApi({ ...state, localApiEnabled: enabled }, publishCallback)
            ? { localApiEnabled: enabled }
            : undefined,
        );
      },
    });
    command('local-api-port', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const port = Number(message);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          logger.warn('Invalid local API port value:', message);
          return;
        }
        updateDeviceState(state =>
          sendLocalApi({ ...state, localApiPort: port }, publishCallback)
            ? { localApiPort: port }
            : undefined,
        );
      },
    });

    // Confirmed incrementing during active discharge/charge and exactly when
    // the device started net-exporting to the grid, matching the app.
    field({ key: 'dbd', path: ['batteryDischargedEnergyToday'], transform: number() });
    advertise(
      ['batteryDischargedEnergyToday'],
      sensorComponent<number>({
        id: 'battery_discharged_energy_today',
        name: 'Battery Discharged Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'tbd', path: ['batteryDischargedEnergyTotal'], transform: number() });
    advertise(
      ['batteryDischargedEnergyTotal'],
      sensorComponent<number>({
        id: 'battery_discharged_energy_total',
        name: 'Battery Discharged Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    // Supporting evidence (jumped noticeably during a real active-charging
    // test) but not an isolated before/after test like the fields above.
    field({ key: 'dbc', path: ['batteryChargedEnergyToday'], transform: number() });
    advertise(
      ['batteryChargedEnergyToday'],
      sensorComponent<number>({
        id: 'battery_charged_energy_today',
        name: 'Battery Charged Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'tbc', path: ['batteryChargedEnergyTotal'], transform: number() });
    advertise(
      ['batteryChargedEnergyTotal'],
      sensorComponent<number>({
        id: 'battery_charged_energy_total',
        name: 'Battery Charged Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    // dgs is energy taken FROM the grid, not sold to it - it was named the
    // other way round when this file was written. It is one of six daily
    // energy counters the vendor app keeps in one place: load consumption,
    // grid import, grid export, generator input, battery charged, battery
    // discharged, in that order. The order is not guesswork: the two
    // counters dbc and dbd feed are exactly the ones behind the app's own
    // Charged and Discharged readings, and those two keys already carry
    // device-confirmed names here (see above), which pins the sequence at
    // both ends. The app divides the same counters by 1000 to display kWh,
    // confirming the Wh unit used here.
    //
    // Still unconfirmed on hardware: no isolated import/export test has been
    // run on a real unit, though dgs=0 next to dgp=99 in the capture fits an
    // import counter on a unit that had been exporting all day. The lifetime
    // tgs is inference too - the app reads no t* key at all - so it is named
    // by symmetry with the other confirmed daily/lifetime pairs.
    field({ key: 'dgs', path: ['gridImportedEnergyToday'], transform: number() });
    advertise(
      ['gridImportedEnergyToday'],
      sensorComponent<number>({
        id: 'grid_imported_energy_today',
        name: 'Grid Imported Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'tgs', path: ['gridImportedEnergyTotal'], transform: number() });
    advertise(
      ['gridImportedEnergyTotal'],
      sensorComponent<number>({
        id: 'grid_imported_energy_total',
        name: 'Grid Imported Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    // dgb and dgp are the daily load-consumption and daily exported-to-grid
    // counters from the same group, on the same evidence. tgb and tgp are
    // their lifetime totals: the control firmware (V135) prints the ten
    // counters as dgb,dgs,dgp,dbc,dbd,tgb,tgs,tgp,tbc,tbd, and in marsemu tgp
    // rose with dgp, watt-hour for watt-hour.
    field({ key: 'dgb', path: ['loadConsumedEnergyToday'], transform: number() });
    advertise(
      ['loadConsumedEnergyToday'],
      sensorComponent<number>({
        id: 'load_consumed_energy_today',
        name: 'Load Consumed Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'dgp', path: ['gridExportedEnergyToday'], transform: number() });
    advertise(
      ['gridExportedEnergyToday'],
      sensorComponent<number>({
        id: 'grid_exported_energy_today',
        name: 'Grid Exported Energy Today',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'tgb', path: ['loadConsumedEnergyTotal'], transform: number() });
    advertise(
      ['loadConsumedEnergyTotal'],
      sensorComponent<number>({
        id: 'load_consumed_energy_total',
        name: 'Load Consumed Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    field({ key: 'tgp', path: ['gridExportedEnergyTotal'], transform: number() });
    advertise(
      ['gridExportedEnergyTotal'],
      sensorComponent<number>({
        id: 'grid_exported_energy_total',
        name: 'Grid Exported Energy Total',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    // The two cells' temperatures in 0.1 degC, as the control converts them
    // from the DC/DC board's readings (control firmware V135, in marsemu).
    for (const cell of [1, 2] as const) {
      field({
        key: `cell${cell}_t`,
        path: [cell === 1 ? 'cell1Temperature' : 'cell2Temperature'],
        transform: divide(10),
      });
      advertise(
        [cell === 1 ? 'cell1Temperature' : 'cell2Temperature'],
        sensorComponent<number>({
          id: `cell_${cell}_temperature`,
          name: `Cell ${cell} Temperature`,
          device_class: 'temperature',
          unit_of_measurement: '°C',
          state_class: 'measurement',
        }),
        // Not in older builds' reports (PMU 295 has none), so only announced
        // once a device sends them.
        {
          enabled: state =>
            (cell === 1 ? state.cell1Temperature : state.cell2Temperature) != null
              ? true
              : undefined,
        },
      );
    }

    field({ key: 'time', path: ['deviceTime'], transform: parseVenusMiniDeviceTime });
    advertise(
      ['deviceTime'],
      sensorComponent<string>({
        id: 'device_time',
        name: 'Device Time',
        device_class: 'timestamp',
        icon: 'mdi:clock-time-four-outline',
      }),
    );

    // Six schedule slots, used in manual mode (`cd=02,md=2`). Slot n is reported
    // as m{n} (enabled), mp{n} (W), ms{n} (what it does), st{n}/et{n} (HH:MM)
    // and re{n} (weekdays), and set with `cd=4{6+n}` - 47 for slot 1, 52 for
    // slot 6 - whose eight values are the same in that order, the times as h:m:
    //
    //   cd=47,m=1,mp=300,ms=1,st=08:15,et=17:45,re=127
    //
    // From the control firmware's evaluator (V135): a slot applies while
    // start <= now < end on a day in its mask (bit 0 = Monday .. bit 6 =
    // Sunday, 127 every day); an end of 23:59 runs to midnight, and a slot
    // cannot cross midnight. ms 0 idles, 1 charges and 2 discharges at the
    // slot's power (capped at 1500 W), 3 follows the meter as in
    // self-consumption. Outside every slot the device follows the meter while
    // the enabled slots only idle or charge, and idles once any of them
    // discharges or follows the meter. Every command sends the whole slot, so
    // a slot can only be changed once the device has reported it.
    for (let i = 1; i <= 6; i++) {
      const idx = i - 1;

      field({
        key: `m${i}`,
        path: ['timePeriods', idx, 'enabled'],
        transform: equalsBoolean('1'),
      });
      advertise(
        ['timePeriods', idx, 'enabled'],
        switchComponent({
          id: `schedule_${i}_enabled`,
          name: `Schedule Slot ${i} Enabled`,
          icon: 'mdi:clock-time-four-outline',
          command: `schedule/${i}/enabled`,
        }),
      );

      field({ key: `mp${i}`, path: ['timePeriods', idx, 'power'], transform: number() });
      advertise(
        ['timePeriods', idx, 'power'],
        numberComponent({
          id: `schedule_${i}_power`,
          name: `Schedule Slot ${i} Power`,
          icon: 'mdi:flash',
          device_class: 'power',
          unit_of_measurement: 'W',
          command: `schedule/${i}/power`,
          min: 0,
          max: MINI_SCHEDULE_POWER_MAX,
          step: 1,
        }),
      );

      field({ key: `st${i}`, path: ['timePeriods', idx, 'startTime'], transform: identity() });
      advertise(
        ['timePeriods', idx, 'startTime'],
        textComponent({
          id: `schedule_${i}_start_time`,
          name: `Schedule Slot ${i} Start Time`,
          icon: 'mdi:clock-time-four-outline',
          command: `schedule/${i}/start-time`,
          pattern: SCHEDULE_TIME_PATTERN,
        }),
      );

      field({ key: `et${i}`, path: ['timePeriods', idx, 'endTime'], transform: identity() });
      advertise(
        ['timePeriods', idx, 'endTime'],
        textComponent({
          id: `schedule_${i}_end_time`,
          name: `Schedule Slot ${i} End Time`,
          icon: 'mdi:clock-time-four-outline',
          command: `schedule/${i}/end-time`,
          pattern: SCHEDULE_TIME_PATTERN,
        }),
      );

      field({
        key: `ms${i}`,
        path: ['timePeriods', idx, 'direction'],
        transform: map(
          {
            '0': 'idle',
            '1': 'charge',
            '2': 'discharge',
            '3': 'selfConsumption',
          },
          'unknown',
        ),
      });
      advertise(
        ['timePeriods', idx, 'direction'],
        selectComponent<NonNullable<VenusMiniTimePeriod['direction']>>({
          id: `schedule_${i}_direction`,
          name: `Schedule Slot ${i} Direction`,
          icon: 'mdi:swap-vertical',
          command: `schedule/${i}/direction`,
          valueMappings: {
            idle: 'Idle',
            charge: 'Charge',
            discharge: 'Discharge',
            selfConsumption: 'Self Consumption',
            unknown: 'Unknown',
          },
        }),
      );

      field({
        key: `re${i}`,
        path: ['timePeriods', idx, 'weekday'],
        transform: weekdayMaskToSet,
      });
      advertise(
        ['timePeriods', idx, 'weekday'],
        textComponent<WeekdaySet>({
          id: `schedule_${i}_weekday`,
          name: `Schedule Slot ${i} Weekday`,
          icon: 'mdi:calendar-week',
          command: `schedule/${i}/weekday`,
          pattern: '^0?1?2?3?4?5?6?$',
        }),
      );

      const setSlot = (
        patch: Partial<VenusMiniTimePeriod>,
        updateDeviceState: Parameters<
          Parameters<typeof command>[1]['handler']
        >[0]['updateDeviceState'],
        publishCallback: (payload: string) => void,
      ) => {
        updateDeviceState(state => {
          const slot = { ...state.timePeriods?.[idx], ...patch };
          const payload = scheduleSlotCommand(i, slot);
          if (payload === null) {
            logger.warn(`Schedule slot ${i} cannot be set until the device has reported it`);
            return;
          }
          const timePeriods = [...(state.timePeriods ?? [])];
          timePeriods[idx] = slot;
          publishCallback(payload);
          return { timePeriods };
        });
      };

      command(`schedule/${i}/enabled`, {
        handler: ({ message, publishCallback, updateDeviceState }) =>
          setSlot({ enabled: isOn(message) }, updateDeviceState, publishCallback),
      });
      command(`schedule/${i}/power`, {
        handler: ({ message, publishCallback, updateDeviceState }) => {
          const power = Number(message);
          if (!Number.isInteger(power) || power < 0 || power > MINI_SCHEDULE_POWER_MAX) {
            logger.warn(
              `Invalid schedule power (expected 0-${MINI_SCHEDULE_POWER_MAX} W):`,
              message,
            );
            return;
          }
          setSlot({ power }, updateDeviceState, publishCallback);
        },
      });
      for (const [suffix, key] of [
        ['start-time', 'startTime'],
        ['end-time', 'endTime'],
      ] as const) {
        command(`schedule/${i}/${suffix}`, {
          handler: ({ message, publishCallback, updateDeviceState }) => {
            const time = normalizeScheduleTime(message);
            if (time === null) {
              logger.warn('Invalid schedule time (expected HH:MM):', message);
              return;
            }
            setSlot({ [key]: time }, updateDeviceState, publishCallback);
          },
        });
      }
      command(`schedule/${i}/direction`, {
        handler: ({ message, publishCallback, updateDeviceState }) => {
          if (!isValidVenusMiniScheduleDirection(message)) {
            logger.warn('Invalid schedule direction:', message);
            return;
          }
          setSlot({ direction: message }, updateDeviceState, publishCallback);
        },
      });
      command(`schedule/${i}/weekday`, {
        handler: ({ message, publishCallback, updateDeviceState }) => {
          if (!/^0?1?2?3?4?5?6?$/.test(message)) {
            logger.warn('Invalid schedule weekdays (expected digits 0-6, 0 = Monday):', message);
            return;
          }
          setSlot({ weekday: message as WeekdaySet }, updateDeviceState, publishCallback);
        },
      });
    }

    // Remove what earlier versions advertised read-only, under the same ids in
    // another domain, or as raw fields that now have a meaning.
    const retired = { enabled: () => false as const };
    advertise(
      ['ledEnabled'],
      binarySensorComponent({ id: 'led_enabled', name: 'Status LED' }),
      retired,
    );
    advertise(
      ['feedInPowerLimit'],
      sensorComponent<NonNullable<VenusMiniDeviceData['feedInPowerLimit']>>({
        id: 'feed_in_power_limit',
        name: 'Feed-in Power Limit',
      }),
      retired,
    );
    advertise(
      ['phaseMode'],
      sensorComponent<NonNullable<VenusMiniDeviceData['phaseMode']>>({
        id: 'recharge_type',
        name: 'Recharge Type',
      }),
      retired,
    );
    // tgb, tgp and ct are named sensors now (lifetime totals, Meter Connected).
    for (const [key, path] of [
      ['tgb', 'loadConsumedEnergyTotal'],
      ['tgp', 'gridExportedEnergyTotal'],
    ] as const) {
      advertise([path], sensorComponent<number>({ id: `raw_${key}`, name: `Raw ${key}` }), retired);
    }
    advertise(['ctType'], sensorComponent<number>({ id: 'raw_ct', name: 'Raw ct' }), retired);
    for (let i = 1; i <= 6; i++) {
      const idx = i - 1;
      advertise(
        ['timePeriods', idx, 'enabled'],
        binarySensorComponent({ id: `schedule_${i}_enabled`, name: `Schedule Slot ${i} Enabled` }),
        retired,
      );
      for (const [suffix, name, path] of [
        ['power', 'Power', 'power'],
        ['start_time', 'Start Time', 'startTime'],
        ['end_time', 'End Time', 'endTime'],
        ['direction', 'Direction', 'direction'],
        ['mode_raw', 'Mode (Raw)', 'direction'],
        ['repeat_raw', 'Repeat (Raw)', 'weekday'],
      ] as const) {
        advertise(
          ['timePeriods', idx, path],
          sensorComponent<string>({
            id: `schedule_${i}_${suffix}`,
            name: `Schedule Slot ${i} ${name}`,
          }),
          retired,
        );
      }
    }

    for (const raw of venusMiniNamedRawFields) {
      field({ key: raw.key, path: [raw.path], transform: number() });
      advertise(
        [raw.path],
        sensorComponent<number>({
          id: raw.id,
          name: raw.name,
          icon: 'mdi:help-circle-outline',
          enabled_by_default: false,
        }),
      );
    }

    for (const key of venusMiniRawFields) {
      field({ key, path: ['raw', key], transform: number() });
      advertise(
        ['raw', key],
        sensorComponent<number>({
          id: `raw_${key}`,
          name: `Raw ${key}`,
          icon: 'mdi:help-circle-outline',
          enabled_by_default: false,
        }),
        { enabled: state => (state.raw?.[key] != null ? true : undefined) },
      );
    }

    // Bluetooth, `cd=55,adv=<n>` (CMD_SET_BLUETOOTH_STATE in the app). What the
    // values do, from the control firmware (V135) in marsemu: it keeps the
    // value (reported back as `bbs`) and, whenever it differs from the one
    // last applied,
    //
    //   0: does nothing;
    //   1: stops BLE advertising about ten minutes later (AT+QBLEADVSTOP),
    //      saved across restarts;
    //   2: starts advertising at once (AT+QBLEADVSTART), saved;
    //   3: as 1 and 4: as 2, but not saved.
    //
    // The device advertises after every boot. So this is the app's "Bluetooth
    // lock" (Bluetooth-Sperre), which a real device was seen to report as a
    // rising bbs: the lock is 1, and turning Bluetooth back on takes 2 - 0
    // leaves it off. hm2mqtt used to send 1 for on and 0 for off, which
    // switched Bluetooth off ten minutes after it was "enabled".
    field({
      key: 'bbs',
      path: ['bluetoothAdvertisingEnabled'],
      transform: map({ '0': true, '1': false, '2': true, '3': false, '4': true }),
    });
    advertise(
      ['bluetoothAdvertisingEnabled'],
      switchComponent({
        id: 'bluetooth_advertising',
        name: 'Bluetooth Advertising',
        icon: 'mdi:bluetooth',
        command: 'bluetooth-advertising',
      }),
    );
    command('bluetooth-advertising', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable =
          message.toLowerCase() === 'true' || message.toLowerCase() === 'on' || message === '1';
        updateDeviceState(() => ({ bluetoothAdvertisingEnabled: enable }));
        publishCallback(`cd=55,adv=${enable ? 2 : 1}`);
      },
    });

    // Reboot, `cd=61,rst=1`: the control firmware (V135) restarts about 50 ticks
    // later only when the value is 1 (the key name is ignored), so a bare
    // `cd=61` - which hm2mqtt used to send - is acknowledged and does nothing.
    // The first generation reboots with `cd=28` instead, and
    // `cd=10` on those models is the WiFi-module version query, not a restart.
    // Disabled by default, matching the reset buttons on the other families.
    advertise(
      [],
      buttonComponent({
        id: 'restart',
        name: 'Restart',
        icon: 'mdi:restart',
        command: 'restart',
        payload_press: 'PRESS',
        enabled_by_default: false,
      }),
    );
    command('restart', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback('cd=61,rst=1');
        }
      },
    });

    // Refresh and Get CT Power, matching the same two buttons on the other
    // Venus models. The numbers differ: this generation asks for power with
    // `cd=59`, not `cd=19` - see registerVenusMiniCtPowerMessage.
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
    command('refresh', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback('cd=01');
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
    command('get-ct-power', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback('cd=19');
        }
      },
    });

    // Set the clock, `cd=33,d=,m=,y=,h=,mi=,s=` - day, month, year, hour,
    // minute, second, in that order. There is no time zone: the schedule
    // slots run on this clock, and Device Time is read as local time, so the
    // host's local time is sent.
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
    command('sync-time', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          const now = new Date();
          publishCallback(
            `cd=33,d=${now.getDate()},m=${now.getMonth() + 1},y=${now.getFullYear()},` +
              `h=${now.getHours()},mi=${now.getMinutes()},s=${now.getSeconds()}`,
          );
        }
      },
    });

    // Factory reset, `cd=05`. Unlike the first generation's reset, which selects
    // between clearing all/part/certificates with an `rs` parameter, this one
    // takes none.
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
    command('factory-reset', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback('cd=05');
        }
      },
    });

    // Meter type, `cd=18,ct_t=<n>,mac=<mac>` with the same meter codes as the
    // other families. The key is `ct_t`, not the `meter` of the app's base
    // command table: the control firmware (V135) parses
    // `cd=18,ct_t=%d,mac=%12s`, and acknowledges `meter=` with `cd18=ok` but
    // ignores it. It reports the code back in ct_type, but that reads 0 both
    // with no meter and with a CT001, so this stays write-only.
    advertise(
      ['meterType'],
      selectComponent<NonNullable<VenusMiniDeviceData['meterType']>>({
        id: 'meter_type',
        name: 'Meter Type',
        icon: 'mdi:meter-electric',
        command: 'meter-type',
        valueMappings: meterTypeLabels,
        optimistic: true,
        enabled_by_default: false,
      }),
    );
    command('meter-type', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        if (!isValidMeterType(message)) {
          logger.warn('Invalid meter type value:', message);
          return;
        }
        updateDeviceState(state => {
          const mac = miniMeterMac(message, state.meterMac);
          if (mac === null) {
            logger.warn(
              `Meter type ${message} requires a MAC; set the "Meter MAC" entity before selecting it`,
            );
            return;
          }
          publishCallback(`cd=18,ct_t=${meterTypeCommandCodes[message]},mac=${mac}`);
          return { meterType: message };
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
        optimistic: true,
        enabled_by_default: false,
        pattern: '^[0-9A-Fa-f]{12}$',
      }),
    );
    command('meter-mac', {
      handler: ({ message, updateDeviceState }) => {
        const mac = message.trim();
        if (!/^[0-9A-Fa-f]{12}$/.test(mac)) {
          logger.warn('Invalid meter MAC (expected 12 hex characters):', message);
          return;
        }
        updateDeviceState(() => ({ meterMac: mac.toUpperCase() }));
      },
    });

    // Meter IP, `cd=66,meter_ip=<ip>`: where the device polls a network meter -
    // the P1 Meter (HomeWizard, `http://<ip>/api/v1/data`) and the EcoTracker
    // (`http://<ip>/v1/json`). The firmware reads it up to the end of the line,
    // so it has to be the last thing in the message. Not reported back, so
    // the entity shows the last value set.
    advertise(
      ['meterIp'],
      textComponent({
        id: 'meter_ip',
        name: 'Meter IP',
        icon: 'mdi:ip-network',
        command: 'meter-ip',
        optimistic: true,
        enabled_by_default: false,
        pattern: IPV4_PATTERN,
      }),
    );
    command('meter-ip', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const ip = message.trim();
        if (!new RegExp(IPV4_PATTERN).test(ip)) {
          logger.warn('Invalid meter IP (expected an IPv4 address):', message);
          return;
        }
        updateDeviceState(() => ({ meterIp: ip }));
        publishCallback(`cd=66,meter_ip=${ip}`);
      },
    });

    // Phase detection, `cd=58,dt=1` (`CMD_SET_CT_PHASE_AUTO_CHECK` in the app,
    // which sends it after setting the meter). The device probes with 800 W
    // and stores the phase whose meter reading follows as ct_ph. Until it has
    // a phase, it does not regulate on the meter. The firmware reads only the
    // value after `=`, so the key name `dt` is arbitrary.
    advertise(
      [],
      buttonComponent({
        id: 'phase_detection',
        name: 'Phase Detection',
        icon: 'mdi:sine-wave',
        command: 'phase-detection',
        payload_press: 'PRESS',
        enabled_by_default: false,
      }),
    );
    command('phase-detection', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          publishCallback('cd=58,dt=1');
        }
      },
    });
  });
}

/**
 * Per-phase CT readings, answered with one key per phase plus the three-phase
 * total, all in watts — where the other Venus models pack the same five values
 * into a single pipe-separated `get_power` field.
 *
 * `power_a`/`power_b`/`power_c` are phases A/B/C and `power_s` the three-phase
 * total; the phase order is established rather than inferred from the key
 * names.
 *
 * Requested with `cd=19`. The control firmware (V135) answers `cd=19` with
 * `power_a=…,power_b=…,power_c=…,power_s=…,d_p=…,ct_ph=…,ct_type=…,ct_st=…,ct_mac=…`,
 * all zero while no meter is set. `cd=59`, which the app's table for this
 * model lists as "get NOW power", answers with something else: the last 15
 * samples of the device's own power and SOC (`gn_pwr1`..`gn_pwr15`,
 * `bat_pwr1`.., `bat_soc1`.., `dev_sta1`..), which nothing here parses. Both
 * were checked by running the firmware in marsemu, not on a real device.
 */
function registerVenusMiniCtPowerMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=19',
    isMessage: isVenusMiniCtPowerMessage,
    publishPath: 'ct',
    defaultState: {},
    getAdditionalDeviceInfo: () => ({}),
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: false,
  };
  message<VenusMiniDeviceData>(options, ({ field, advertise }) => {
    const phases = [
      { key: 'power_a', path: 'phaseAPower', id: 'phase_a_power', name: 'Phase A Power' },
      { key: 'power_b', path: 'phaseBPower', id: 'phase_b_power', name: 'Phase B Power' },
      { key: 'power_c', path: 'phaseCPower', id: 'phase_c_power', name: 'Phase C Power' },
      { key: 'power_s', path: 'totalPhasePower', id: 'total_phase_power', name: 'Total CT Power' },
    ] as const;

    for (const phase of phases) {
      field({ key: phase.key, path: [phase.path], transform: number() });
      advertise(
        [phase.path],
        sensorComponent<number>({
          id: phase.id,
          name: phase.name,
          device_class: 'power',
          unit_of_measurement: 'W',
          state_class: 'measurement',
        }),
      );
    }

    // The firmware sends two more keys with no confirmed meaning (`ct_st` reads
    // 1 while the meter answers, `d_p` has only been seen as 0), so they follow
    // the same rule as the unconfirmed cd=1 fields above: published verbatim,
    // disabled by default, no device_class that would assert a meaning.
    for (const key of venusMiniCtRawFields) {
      field({ key, path: ['ctRaw', key], transform: number() });
      advertise(
        ['ctRaw', key],
        sensorComponent<number>({
          id: `raw_${key}`,
          name: `Raw ${key}`,
          icon: 'mdi:help-circle-outline',
          enabled_by_default: false,
        }),
        { enabled: state => (state.ctRaw?.[key] != null ? true : undefined) },
      );
    }
    // Keys earlier versions expected here, which come with cd=59 instead.
    for (const key of ['gn_pwr', 'gn_pwr1', 'gf_pwr', 'bat_pwr'] as const) {
      advertise(
        ['totalPhasePower'],
        sensorComponent<number>({ id: `raw_${key}`, name: `Raw ${key}` }),
        {
          enabled: () => false,
        },
      );
    }
  });
}

// See the file header for why this model has its own definition rather than
// reusing anything in venus.ts.
registerDeviceDefinition(
  {
    deviceTypes: ['VNSEMINI'],
    beta: true,
  },
  ({ message }) => {
    registerVenusMiniRuntimeInfoMessage(message);
    registerVenusMiniCtPowerMessage(message);
    // `cd=03` answers `net_info=ip:…,gate:…,mask:…,dns:…`, which the message
    // parser normalizes like the other Venus models' cd=26 reply.
    registerNetworkInfoMessage(message, {
      commandCode: 3,
      refreshDataPayload: 'cd=03',
      isMessage: values => 'ip' in values && 'gate' in values && 'mask' in values,
      ipEnabledByDefault: true,
    });
  },
);
