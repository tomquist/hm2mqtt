import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import {
  VenusMiniDeviceData,
  VenusMiniTimePeriod,
  VenusMiniWorkingMode,
  isValidMeterType,
  isValidVenusMiniWorkingMode,
  meterTypeCommandCodes,
  meterTypeLabels,
  resolveMeterMac,
  venusMiniWorkingModeCommandCodes,
} from '../types.js';
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
 * The other command formats here are read out of the Marstek app's own command
 * table for this model rather than observed on hardware, so they are the app's
 * ground truth but not yet confirmed end to end. Fields whose meaning is not
 * confirmed are exposed verbatim as disabled-by-default sensors under
 * `raw`/`ctRaw` rather than being given a name that asserts a meaning.
 *
 * This model runs Marstek's second-generation Venus firmware, along with the
 * Venus X and Venus G. That generation numbers its commands differently from
 * the Venus C/D/E in venus.ts - depth of discharge is `cd=44` here and `cd=56`
 * there, the LED `cd=56` here and `cd=59` there - so nothing in venus.ts can
 * be reused, and a number read off that file is more likely wrong than right.
 * docs/venus-generations.md has the full map and how the two are told apart.
 *
 * Not implemented, and why. Each of these is a real command in the app's
 * tables; what is missing in every case is the set of values it accepts, which
 * the app encodes at the call site rather than in the table:
 *
 * - `cd=60,ser=<n>` (configure server). No value domain, and pointing a device
 *   at a different server can take it off the network. Reported back as `ser`,
 *   of which only 0 has been seen.
 * - `cd=63,ct_chg_type=<n>` (configure recharge type). No value domain;
 *   reported back as `rechg_type`, only ever 0.
 * - `cd=46,cv=<n>` (access power). This is the grid-connection power
 *   entitlement - the app does not set it over MQTT at all, but through
 *   Marstek's cloud, which then provisions the device; the 800/1500 W pair
 *   lives in the app's HTTP API. The device reports the result as `gps`. Since
 *   an export limit carries regulatory weight, guessing the units is not worth
 *   the risk.
 * - `cd=54,am=<n>,aw=<n>,ap=<n>` (anti-reverse-flow). Three parameters, only
 *   the first of which has a guessable meaning.
 * - `cd=3` / `cd=4` (network info, error code). These are reads, and the shape
 *   of what comes back is not known, so there would be nothing to parse.
 * - `cd=33` (set device time), whose parameters are known - d, m, y, h, min, s
 *   and `wy` - but not whether the clock fields are local or UTC. `wy` is the
 *   timezone offset in minutes, the same key the B2500 uses on its own
 *   set-time command, and there the clock fields go as UTC while the
 *   first-generation Venus `cd=4`, which has no `wy` at all, takes local time.
 *   The app calls timeZoneOffset once either way, so it does not settle which
 *   convention this command follows. Getting it wrong sets the device clock off
 *   by the offset, which is the bug the B2500 shipped once already; and since
 *   nothing here drives the Mini's schedules yet, a sync button would carry
 *   that risk without buying anything. Pressing it in the app with a device
 *   whose reported `time` is watched would settle it in one go.
 * - Manual-mode scheduling. The app builds the `cd=` number at the call site,
 *   and the device reports no schedule state at all, so there is nothing to
 *   check an implementation against.
 * - `CMD_SET_WIFI` (configure device WiFi) carries network credentials, and is
 *   Bluetooth-only anyway - it has no MQTT form.
 */

// The app's own setting screen enforces this range.
const MINI_DOD_MIN = 30;
const MINI_DOD_MAX = 90;

const requiredMiniRuntimeInfoKeys = ['gp', 'lp', 'soc', 'be', 'pmu', 'wif_s', 'mq_s', 'm1', 'time'];
function isVenusMiniRuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredMiniRuntimeInfoKeys.every(key => key in values);
}

const requiredCtPowerKeys = ['power_a', 'power_b', 'power_c'];
function isVenusMiniCtPowerMessage(values: Record<string, string>): boolean {
  return requiredCtPowerKeys.every(key => key in values);
}

// Keys the vendor app parses alongside power_a..power_s, with no confirmed
// meaning. See registerVenusMiniCtPowerMessage.
const venusMiniCtRawFields = ['d_p', 'ct_st', 'gn_pwr', 'gn_pwr1', 'gf_pwr', 'bat_pwr'] as const;

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
// That says what each one is about, but none of the individual codes is
// known - only ls=1, gs=5 and ser=0/rechg_type=0 have been seen at all - so
// they are reported as plain numbers rather than mapped to labels, and stay
// disabled by default until someone works out what the codes mean.
const venusMiniNamedRawFields = [
  { key: 'ls', path: 'loadState', id: 'load_state', name: 'Load State' },
  { key: 'gs', path: 'gridMode', id: 'grid_mode', name: 'Grid Mode' },
  { key: 'ser', path: 'serverState', id: 'server_state', name: 'Server State' },
  { key: 'rechg_type', path: 'rechargeType', id: 'recharge_type', name: 'Recharge Type' },
] as const;

// Fields observed in the Venus E Mini's cd=1 payload with no confirmed
// meaning (see VENUS_MINI_NOTES.md and VENUS_MINI_IMPLEMENTATION_PROMPT.md).
// Exposed verbatim as disabled-by-default sensors, keyed by their raw MQTT
// field name, so the values are available for correlation without asserting
// semantics. tgb/tgp look like the lifetime totals of the named dgb/dgp
// counters, but no t* key is read by the vendor app at all, so that reading
// is still a hypothesis and they stay here.
const venusMiniRawFields = [
  'eg',
  'cv',
  'ct',
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
  'tgb',
  'tgp',
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

    // Only ct_type=0 ("no external meter configured") has been observed so
    // far; the full enum is unconfirmed, so this is reported as a raw number
    // rather than mapped to labels.
    field({ key: 'ct_type', path: ['ctType'], transform: number() });
    advertise(
      ['ctType'],
      sensorComponent<number>({
        id: 'ct_type',
        name: 'CT Type',
        icon: 'mdi:current-ac',
      }),
    );

    // Only ct_ph=0 has been observed so far; meaning unconfirmed.
    field({ key: 'ct_ph', path: ['ctPhase'], transform: number() });
    advertise(
      ['ctPhase'],
      sensorComponent<number>({
        id: 'ct_phase',
        name: 'CT Phase',
        icon: 'mdi:sine-wave',
      }),
    );

    // Working mode, cd=2. Backed by cm rather than write-only, matching the
    // Working Mode select on the other Venus models: the device reports its
    // mode, so there is no reason for the entity to show only what was last
    // written. Unrecognised codes fall back to `automatic`, as they do there.
    //
    // Only 0 (self-consumption) and 2 (manual) have been observed; a 3rd "AI
    // optimization" mode exists in the app UI but is greyed out as "coming
    // soon" - 3 is the code it will report, from the app's own work-mode
    // enum. In manual mode, actual charge/discharge behavior is driven by
    // which schedule rule is enabled, not by this field itself.
    field({
      key: 'cm',
      path: ['workingMode'],
      transform: map(
        {
          '0': 'automatic',
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
        publishCallback(`cd=2,md=${venusMiniWorkingModeCommandCodes[message]}`);
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

    // leds is inverted: 0 means the LED is on, 1 means it's off. Confirmed
    // via a clean single-variable toggle test.
    field({ key: 'leds', path: ['ledEnabled'], transform: equalsBoolean('0') });
    advertise(
      ['ledEnabled'],
      binarySensorComponent({
        id: 'led_enabled',
        name: 'Status LED',
        icon: 'mdi:led-on',
      }),
    );

    // Bluetooth lock (Bluetooth-Sperre in the app). The direction is
    // confirmed - enabling the lock increases the value - but the absolute
    // mapping across every LED x lock combination isn't, so this stays a raw
    // diagnostic rather than a binary sensor.
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

    // A preset selector, not a literal wattage: 0 = Germany's 800W
    // simplified-registration cap, 1 = the 1500W alternative. Confirmed both
    // directions via a real settings change in the app.
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
      sensorComponent<NonNullable<VenusMiniDeviceData['feedInPowerLimit']>>({
        id: 'feed_in_power_limit',
        name: 'Feed-in Power Limit',
        icon: 'mdi:transmission-tower-export',
        valueMappings: {
          '800W': '800 W',
          '1500W': '1500 W',
          unknown: 'Unknown',
        },
      }),
    );

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
    // counters from the same group, on the same evidence. Their tgb/tgp
    // siblings look like the lifetime totals of the two, but with no t* key
    // read by the app and no second confirmed pair to lean on, they stay
    // unnamed under `raw`.
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

    // Six charge/discharge schedule slots - the same concept as the other
    // Venus variants' tim_0..tim_9 periods, but with a flatter per-slot
    // encoding (m{n}/mp{n}/ms{n}/st{n}/et{n}/re{n} instead of one
    // pipe-separated field). The mode and repeat values are captured but
    // their meaning is unconfirmed (see VENUS_MINI_NOTES.md).
    for (let i = 1; i <= 6; i++) {
      const idx = i - 1;

      field({
        key: `m${i}`,
        path: ['timePeriods', idx, 'enabled'],
        transform: equalsBoolean('1'),
      });
      advertise(
        ['timePeriods', idx, 'enabled'],
        binarySensorComponent({
          id: `schedule_${i}_enabled`,
          name: `Schedule Slot ${i} Enabled`,
          icon: 'mdi:clock-time-four-outline',
        }),
      );

      field({ key: `mp${i}`, path: ['timePeriods', idx, 'power'], transform: number() });
      advertise(
        ['timePeriods', idx, 'power'],
        sensorComponent<number>({
          id: `schedule_${i}_power`,
          name: `Schedule Slot ${i} Power`,
          device_class: 'power',
          unit_of_measurement: 'W',
          state_class: 'measurement',
        }),
      );

      field({ key: `st${i}`, path: ['timePeriods', idx, 'startTime'], transform: identity() });
      advertise(
        ['timePeriods', idx, 'startTime'],
        sensorComponent<string>({
          id: `schedule_${i}_start_time`,
          name: `Schedule Slot ${i} Start Time`,
          icon: 'mdi:clock-time-four-outline',
        }),
      );

      field({ key: `et${i}`, path: ['timePeriods', idx, 'endTime'], transform: identity() });
      advertise(
        ['timePeriods', idx, 'endTime'],
        sensorComponent<string>({
          id: `schedule_${i}_end_time`,
          name: `Schedule Slot ${i} End Time`,
          icon: 'mdi:clock-time-four-outline',
        }),
      );

      // ms{n} is the slot's charge/discharge direction: 1 = charge, 2 =
      // discharge (fixed power), 3 = self-consumption (per-rule, distinct
      // from the top-level operatingMode). modeRaw is kept alongside the
      // mapped value for any future value outside this range.
      field({
        key: `ms${i}`,
        path: ['timePeriods', idx, 'direction'],
        transform: map(
          {
            '1': 'charge',
            '2': 'discharge',
            '3': 'selfConsumption',
          },
          'unknown',
        ),
      });
      advertise(
        ['timePeriods', idx, 'direction'],
        sensorComponent<NonNullable<VenusMiniTimePeriod['direction']>>({
          id: `schedule_${i}_direction`,
          name: `Schedule Slot ${i} Direction`,
          icon: 'mdi:swap-vertical',
          valueMappings: {
            charge: 'Charge',
            discharge: 'Discharge',
            selfConsumption: 'Self Consumption',
            unknown: 'Unknown',
          },
        }),
      );

      field({ key: `ms${i}`, path: ['timePeriods', idx, 'modeRaw'], transform: number() });
      advertise(
        ['timePeriods', idx, 'modeRaw'],
        sensorComponent<number>({
          id: `schedule_${i}_mode_raw`,
          name: `Schedule Slot ${i} Mode (Raw)`,
          icon: 'mdi:help-circle-outline',
          enabled_by_default: false,
        }),
      );

      // re{n} (127 seen on every active-looking slot, possibly a bitmask or
      // "always" sentinel) - meaning unconfirmed.
      field({ key: `re${i}`, path: ['timePeriods', idx, 'repeatRaw'], transform: number() });
      advertise(
        ['timePeriods', idx, 'repeatRaw'],
        sensorComponent<number>({
          id: `schedule_${i}_repeat_raw`,
          name: `Schedule Slot ${i} Repeat (Raw)`,
          icon: 'mdi:help-circle-outline',
          enabled_by_default: false,
        }),
      );
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

    // Bluetooth advertising, `cd=55,adv=1` to enable and `cd=55,adv=0` to
    // disable.
    //
    // `cd=55` is solid: the Mini's own command table names it
    // CMD_SET_BLUETOOTH_STATE, and CommonCommand.handleBleSwitch reaches the
    // same number for a Mini through its fallback arm (Venus 55, Jupiter 57,
    // everything else 55).
    //
    // The `adv=` parameter is NOT solid, and the reason matters. The app has
    // two generations of Venus code. The first - Venus C/D/E, the HMG/VNSE3/
    // VNSA/VNSD this repo already supports - lives in pages/Ac_Coupler with
    // CommonCommand and talks over `hame_energy/…`. The second - Venus X,
    // Venus G and this model - lives in modules/devices with its own
    // DataVenus* command tables and talks over `marstek_energy/…` via
    // VNXMqttStrategy. The two disagree on numbering wherever they both
    // implement something: depth of discharge is 56 then 44, the LED 59 then
    // 56, set-time 4 then 33, network info 26 then 03.
    //
    // `adv=` comes from handleBleSwitch, which is first-generation. The
    // Mini's own second-generation descriptor is a bare `cd=55` whose
    // parameter is filled in at the call site, and that call site has not been
    // read. So the number is confirmed for this model and the parameter name
    // is borrowed from the older line - worth confirming on a device before
    // trusting it.
    //
    // Kept optimistic, but not because nothing reports the state back: `bbs`
    // in the cd=1 payload is the likely readback. The app's own label for
    // cd=55 is "设置蓝牙广播状态" - set Bluetooth *broadcast state* - which is
    // what bbs reads like, and it has only ever been seen as 0 or 1. What is
    // missing is the polarity. The one hardware note on bbs (see
    // bluetoothLockRaw above) says enabling the Bluetooth *lock* raises it,
    // which would make it the inverse of advertising, and that the mapping
    // across LED x lock combinations did not come out cleanly - so bbs may not
    // be tracking this setting alone.
    //
    // A switch wired to the wrong polarity shows the opposite of reality,
    // which is worse than showing nothing, so this stays optimistic until
    // someone toggles it on a device and reports which way bbs moves. The
    // other Venus models do report advertising back, in `ble` bit 2.
    advertise(
      ['bluetoothAdvertisingEnabled'],
      switchComponent({
        id: 'bluetooth_advertising',
        name: 'Bluetooth Advertising',
        icon: 'mdi:bluetooth',
        command: 'bluetooth-advertising',
        // Optimistic: the readback is probably `bbs`, but its polarity is
        // unconfirmed, so the switch shows the last value set instead of a
        // state that might be inverted. See the note above.
        optimistic: true,
      }),
    );
    command('bluetooth-advertising', {
      handler: ({ message, publishCallback, updateDeviceState }) => {
        const enable =
          message.toLowerCase() === 'true' || message.toLowerCase() === 'on' || message === '1';
        updateDeviceState(() => ({ bluetoothAdvertisingEnabled: enable }));
        publishCallback(`cd=55,adv=${enable ? 1 : 0}`);
      },
    });

    // Reboot, `cd=61`. The first generation has no reboot command at all, so
    // this is not a renumbering of anything - `cd=10` on those models is the
    // WiFi-module version query, not a restart. No parameters, so there is
    // nothing here to get wrong beyond the number itself. Disabled by default,
    // matching the reset buttons on the other families.
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
          publishCallback('cd=61');
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
          publishCallback('cd=59');
        }
      },
    });

    // Factory reset, `cd=5`. Unlike the first generation's reset, which selects
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
          publishCallback('cd=5');
        }
      },
    });

    // Meter type, `cd=18,meter=<n>,mac=<mac>` - the same command and the same
    // meter codes as the other families, which is one of the few places the two
    // generations agree. The device reports a meter code back in ct_type, but
    // nothing establishes that it is the same numbering as `meter`, so this
    // stays write-only rather than reading that field back.
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
          const mac = resolveMeterMac(message, state.meterMac);
          if (mac === null) {
            logger.warn(
              `Meter type ${message} requires a MAC; set the "Meter MAC" entity before selecting it`,
            );
            return;
          }
          publishCallback(`cd=18,meter=${meterTypeCommandCodes[message]},mac=${mac}`);
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
 * Requested with `cd=59`. The Marstek app asks this model for power with
 * `cd=59` ("get NOW statistics power") and never sends it `cd=19` at all —
 * `cd=19` belongs to the other Venus variants, which declare both commands
 * separately. hm2mqtt used to send `cd=19` here, which was a guess carried over
 * from those variants. Neither number has been confirmed against a real Mini:
 * the unit these mappings were checked against reports `ct_type=0`, meaning no
 * external meter is configured, so it answers no power request at all. The
 * entities only appear once a device actually reports the keys.
 */
function registerVenusMiniCtPowerMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=59',
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

    // The vendor app reads six more keys immediately after power_a..power_s in
    // the same parser. The names suggest power readings — battery, grid, grid
    // feed-in — but nothing in the app confirms a unit, a sign convention or
    // what distinguishes gn_pwr from gn_pwr1, so they follow the same rule as
    // the unconfirmed cd=1 fields above: published verbatim, disabled by
    // default, no device_class that would assert a meaning.
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
  },
);
