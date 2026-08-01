import { ControlHandlerDefinition } from '../controlHandler.js';
import {
  B2500V2CD16Data,
  B2500V2DeviceData,
  B2500V2SmartMeterStatus,
  CommandParams,
  meterTypeCommandCodes,
  meterTypeLabels,
  normalizeMeterMac,
  resolveMeterMac,
  isValidMeterType,
  isValidB2500RechargeMode,
} from '../types.js';
import logger from '../logger.js';
import {
  CommandType,
  extractAdditionalDeviceInfo,
  isB2500RuntimeInfoMessage,
  processCommand,
  registerBaseMessage,
  registerCalibrationDataMessage,
  registerCellDataMessage,
} from './b2500Base.js';
import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import {
  binarySensorComponent,
  buttonComponent,
  numberComponent,
  selectComponent,
  sensorComponent,
  switchComponent,
  textComponent,
} from '../homeAssistantDiscovery.js';
import { number, boolean, map, timeString, equalsBoolean, divide } from '../transforms.js';

/**
 * Create a time period handler for a specific setting
 */
export const timePeriodSettingHandler = (
  periodNumber: number,
  setting: string,
): ControlHandlerDefinition<B2500V2DeviceData> => ({
  command: `time-period/${periodNumber}/${setting}`,
  handler: ({ device, updateDeviceState, message, publishCallback, deviceState }) => {
    // Convert to zero-based index for internal use
    const periodIndex = periodNumber - 1;

    // Update the device state
    updateDeviceState(state => {
      if (state.timePeriods == null || state.timePeriods.length < periodNumber) {
        logger.error(`No time period ${periodNumber} found for ${device.deviceId}`);
        return;
      }
      const newTimePeriodSettings = state.timePeriods.map(p => ({ ...p }));
      // Update the appropriate setting
      switch (setting) {
        case 'enabled':
          newTimePeriodSettings[periodIndex].enabled =
            message.toLowerCase() === 'true' || message === '1' || message === 'ON';
          break;
        case 'start-time':
          // Validate time format (HH:MM)
          if (!/^([0-2]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            logger.warn('Invalid start time format (should be HH:MM):', message);
            return;
          }
          newTimePeriodSettings[periodIndex].startTime = message;
          break;
        case 'end-time':
          // Validate time format (HH:MM)
          if (!/^([0-2]?[0-9]|2[0-3]):[0-5][0-9]$/.test(message)) {
            logger.warn('Invalid end time format (should be HH:MM):', message);
            return;
          }
          newTimePeriodSettings[periodIndex].endTime = message;
          break;
        case 'output-value':
          const outputValue = parseInt(message, 10);
          if (isNaN(outputValue) || outputValue < 0 || outputValue > 800) {
            logger.warn('Invalid output value (should be 0-800):', message);
            return;
          }
          newTimePeriodSettings[periodIndex].outputValue = outputValue;
          break;
        default:
          logger.warn('Unknown time period setting:', setting);
          return;
      }

      logger.debug(`Current period ${periodNumber} settings:`, newTimePeriodSettings[periodIndex]);

      // Build time period parameters for all periods
      const params = buildTimePeriodParams(newTimePeriodSettings);

      // Process the command and send it
      publishCallback(
        processCommand(CommandType.TIMED_DISCHARGE, params, deviceState.useFlashCommands),
      );

      // Update the device state with the new settings
      return { timePeriods: newTimePeriodSettings };
    });
  },
});

/**
 * Build time period parameters for all periods
 */
function formatTimeForB2500V2(time: string): string {
  // Device seems to prefer H:M (no leading zeros).
  // Examples:
  // - "00:30" should be sent as "0:30"
  // - "08:01" should be sent as "8:1"
  const [hStr, mStr] = time.split(':');
  if (hStr == null || mStr == null) return time;

  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;

  // Minutes are also sent without zero-padding (e.g. 08:01 -> 8:1), matching device/app behavior.
  return `${h}:${m}`;
}

function buildTimePeriodParams(
  timePeriods: NonNullable<B2500V2DeviceData['timePeriods']>,
): CommandParams {
  // Initialize command parameters
  const params: CommandParams = { md: 0 };

  // Process all 5 time periods
  for (const periodIndex of [1, 2, 3, 4, 5] as const) {
    const idx = periodIndex - 1;
    if (idx >= timePeriods.length) {
      break;
    }
    const period = timePeriods[idx];

    // Use new settings if available, otherwise use stored settings
    const enabled = period.enabled;
    const startTime = formatTimeForB2500V2(period.startTime);
    const endTime = formatTimeForB2500V2(period.endTime);
    const outputValue = period.outputValue;

    // Set parameters dynamically using the period index
    params[`a${periodIndex}`] = enabled ? 1 : 0;
    params[`b${periodIndex}`] = startTime;
    params[`e${periodIndex}`] = endTime;
    params[`v${periodIndex}`] = outputValue;
  }

  return params;
}

registerDeviceDefinition(
  {
    deviceTypes: ['HMA', 'HMF', 'HMJ', 'HMK'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerExtraBatteryData(message);
    registerCellDataMessage(message);
    registerCalibrationDataMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=1',
    isMessage: isB2500RuntimeInfoMessage,
    defaultState: { useFlashCommands: false },
    getAdditionalDeviceInfo: extractAdditionalDeviceInfo,
    publishPath: 'data',
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;
  const isSurplusFeedInSupported = (
    state: Pick<B2500V2DeviceData, 'deviceType'> & { deviceInfo?: B2500V2DeviceData['deviceInfo'] },
  ) => {
    // deviceType comes from config/topic and can include a suffix like "HMJ-2".
    // Normalize it to the base type for feature gating.
    const baseType = state.deviceType?.split('-')[0];
    if (baseType == null) {
      return undefined;
    }
    const requiredVersion = baseType === 'HMJ' ? 108 : 226;
    const deviceVersion = state.deviceInfo?.deviceVersion;
    if (deviceVersion == null) {
      return undefined;
    }

    return deviceVersion >= requiredVersion;
  };

  message<B2500V2DeviceData>(options, ({ field, command, advertise }) => {
    registerBaseMessage({ command, advertise, field });

    // Charging and discharging settings
    field({
      key: 'lv',
      path: ['batteryOutputThreshold'],
      transform: number(),
    });
    // Read-only on V2. The threshold setting is only offered on the V1 (HMB);
    // V2 models report the current value in `lv` but do not act on `cd=6`.
    advertise(
      ['batteryOutputThreshold'],
      sensorComponent<number>({
        id: 'battery_output_threshold',
        name: 'Battery Output Threshold',
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
    field({
      key: 'cs',
      path: ['chargingMode'],
      transform: map({ '0': 'chargeDischargeSimultaneously', '1': 'chargeThenDischarge' }),
    });
    advertise(
      ['chargingMode'],
      selectComponent({
        id: 'charging_mode',
        name: 'Charging Mode',
        command: 'charging-mode',
        valueMappings: {
          chargeDischargeSimultaneously: 'Simultaneous Charging/Discharging',
          chargeThenDischarge: 'Fully Charge Then Discharge',
        },
      }),
    );
    command('charging-mode', {
      handler: ({ message, publishCallback, deviceState }) => {
        const validModes = ['chargeDischargeSimultaneously', 'chargeThenDischarge'];
        if (!validModes.includes(message)) {
          logger.warn('Invalid charging mode value:', message);
          return;
        }

        let mode: number;
        switch (message) {
          case 'chargeDischargeSimultaneously':
            mode = 0;
            break;
          case 'chargeThenDischarge':
            mode = 1;
            break;
          default:
            mode = 0;
        }

        publishCallback(
          processCommand(CommandType.CHARGING_MODE, { md: mode }, deviceState.useFlashCommands),
        );
      },
    });

    field({
      key: 'md',
      path: ['adaptiveMode'],
      transform: boolean(),
    });
    advertise(
      ['adaptiveMode'],
      switchComponent({
        id: 'adaptive_mode',
        name: 'Adaptive Mode',
        icon: 'mdi:auto-fix',
        command: 'adaptive-mode',
      }),
    );

    /**
     * Control handler for adaptive mode
     */
    command('adaptive-mode', {
      handler: ({ message, publishCallback, deviceState }) => {
        const newState = message.toLowerCase() === 'true' || message === '1' || message === 'ON';
        let mode = newState ? 1 : 0;

        publishCallback(
          processCommand(CommandType.DISCHARGE_MODE, { md: mode }, deviceState.useFlashCommands),
        );
      },
    });

    for (const i of [0, 1, 2, 3, 4] as const) {
      field({
        key: `d${i + 1}`,
        path: ['timePeriods', i, 'enabled'],
        transform: boolean(),
      });
      advertise(
        ['timePeriods', i, 'enabled'],
        switchComponent({
          id: `time_period_${i + 1}_enabled`,
          name: `Time Period ${i + 1} Enabled`,
          icon: 'mdi:clock-time-four-outline',
          command: `time-period/${i + 1}/enabled`,
        }),
      );
      field({
        key: `e${i + 1}`,
        path: ['timePeriods', i, 'startTime'],
        transform: timeString(),
      });
      advertise(
        ['timePeriods', i, 'startTime'],
        textComponent({
          id: `time_period_${i + 1}_start_time`,
          name: `Time Period ${i + 1} Start Time`,
          command: `time-period/${i + 1}/start-time`,
          pattern: '^([0-2]?[0-9]|2[0-3]):[0-5][0-9]$',
        }),
      );
      field({
        key: `f${i + 1}`,
        path: ['timePeriods', i, 'endTime'],
        transform: timeString(),
      });
      advertise(
        ['timePeriods', i, 'endTime'],
        textComponent({
          id: `time_period_${i + 1}_end_time`,
          name: `Time Period ${i + 1} End Time`,
          command: `time-period/${i + 1}/end-time`,
          pattern: '^([0-2]?[0-9]|2[0-3]):[0-5][0-9]$',
        }),
      );
      field({
        key: `h${i + 1}`,
        path: ['timePeriods', i, 'outputValue'],
        transform: number(),
      });
      advertise(
        ['timePeriods', i, 'outputValue'],
        numberComponent({
          id: `time_period_${i + 1}_output_value`,
          name: `Time Period ${i + 1} Output Value`,
          unit_of_measurement: 'W',
          command: `time-period/${i + 1}/output-value`,
          min: 0,
          max: 800,
        }),
      );

      const timerPeriodCommands = [
        timePeriodSettingHandler(i + 1, 'enabled'),
        timePeriodSettingHandler(i + 1, 'start-time'),
        timePeriodSettingHandler(i + 1, 'end-time'),
        timePeriodSettingHandler(i + 1, 'output-value'),
      ];
      for (const { command: name, ...commandHandler } of timerPeriodCommands) {
        command(name, commandHandler);
      }
    }

    // Daily power statistics
    field({
      key: 'bc',
      path: ['dailyStats', 'batteryChargingPower'],
      transform: number(),
      monotonic: true,
    });
    advertise(
      ['dailyStats', 'batteryChargingPower'],
      sensorComponent<number>({
        id: 'battery_charging_power',
        name: 'Daily Battery Charging',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );
    field({
      key: 'bs',
      path: ['dailyStats', 'batteryDischargePower'],
      transform: number(),
      monotonic: true,
    });
    advertise(
      ['dailyStats', 'batteryDischargePower'],
      sensorComponent<number>({
        id: 'battery_discharge_power',
        name: 'Daily Battery Discharging',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );
    field({
      key: 'pt',
      path: ['dailyStats', 'photovoltaicChargingPower'],
      transform: number(),
      monotonic: true,
    });
    advertise(
      ['dailyStats', 'photovoltaicChargingPower'],
      sensorComponent<number>({
        id: 'photovoltaic_charging_power',
        name: 'Daily PV Charging',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );
    field({
      key: 'it',
      path: ['dailyStats', 'microReverseOutputPower'],
      transform: number(),
      monotonic: true,
    });
    advertise(
      ['dailyStats', 'microReverseOutputPower'],
      sensorComponent<number>({
        id: 'micro_reverse_output_power',
        name: 'Daily Micro Reverse Output Power',
        device_class: 'energy',
        unit_of_measurement: 'Wh',
        state_class: 'total_increasing',
      }),
    );

    // CT information
    field({
      key: 'sg',
      path: ['ctInfo', 'connected'],
      transform: boolean(),
    });
    advertise(
      ['ctInfo', 'connected'],
      binarySensorComponent({
        id: 'ct_connected',
        name: 'CT Connected',
        device_class: 'power',
      }),
    );
    field({
      key: 'sp',
      path: ['ctInfo', 'automaticPowerSize'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'automaticPowerSize'],
      sensorComponent<number>({
        id: 'ct_automatic_power_size',
        name: 'CT Automatic Power Size',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'st',
      path: ['ctInfo', 'transmittedPower'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'transmittedPower'],
      sensorComponent<number>({
        id: 'ct_transmitted_power',
        name: 'CT Transmitted Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'c0',
      path: ['ctInfo', 'connectedPhase'],
      transform: map({ '0': 0, '1': 1, '2': 2, '3': 'searching', '255': 'unknown' }),
    });
    advertise(
      ['ctInfo', 'connectedPhase'],
      selectComponent<NonNullable<NonNullable<B2500V2DeviceData['ctInfo']>['connectedPhase']>>({
        id: 'ct_connected_phase',
        command: 'connected-phase',
        name: 'CT Connected Phase',
        valueMappings: {
          0: 'Phase 1',
          1: 'Phase 2',
          2: 'Phase 3',
          searching: 'Searching',
          unknown: 'None',
        },
      }),
    );
    command('connected-phase', {
      handler: ({ message, publishCallback, deviceState }) => {
        // The select publishes the state name, so the two non-numeric values it
        // can report have to map back onto the codes the device takes. Without
        // the `searching` alias, picking that option published the literal
        // string and was rejected here, leaving it a dead entry in the picker.
        const aliases: Record<string, string> = {
          auto: '255',
          none: '255',
          null: '255',
          unknown: '255',
          searching: '3',
        };
        const channelValue = aliases[message.toLowerCase()] ?? message;
        const channel = parseInt(channelValue, 10);
        // The device accepts 0-3 and 255 for "none", and ignores anything else,
        // so reject it here rather than sending something that does nothing.
        if (isNaN(channel) || (channel !== 255 && (channel < 0 || channel > 3))) {
          logger.warn('Invalid connected phase value:', message);
          return;
        }

        publishCallback(
          processCommand(
            CommandType.SET_CONNECTED_PHASE,
            { md: channel },
            deviceState.useFlashCommands,
          ),
        );
      },
    });

    field({
      key: 'c1',
      path: ['ctInfo', 'status'],
      transform: map(
        {
          '5': 'preparing1',
          '6': 'preparing2',
          '7': 'diagnosingEquipment',
          '8': 'diagnosingChannel',
          '9': 'diagnosisTimeout',
          '10': 'chargingInProgress',
          '11': 'unableToFindChannel',
        },
        'notInDiagnosis',
      ),
    });
    advertise(
      ['ctInfo', 'status'],
      sensorComponent<B2500V2SmartMeterStatus>({
        id: 'ct_status',
        name: 'CT Status',
        valueMappings: {
          preparing1: 'Preparing to diagnose CT001 (Step 1)',
          preparing2: 'Preparing to diagnose CT001 (Step 2)',
          diagnosingEquipment: 'Diagnosing CT001 equipment',
          diagnosingChannel: 'Diagnosing CT001 channel',
          diagnosisTimeout: 'Diagnosis timeout',
          chargingInProgress: 'Charging in progress',
          unableToFindChannel: 'Unable to find channel',
          notInDiagnosis: 'Not in diagnosis',
        } satisfies Record<B2500V2SmartMeterStatus, string>,
      }),
    );
    field({
      key: 'm0',
      path: ['ctInfo', 'phase1'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'phase1'],
      sensorComponent<number>({
        id: 'ct_clip_power1',
        name: 'CT Clip Power 1',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'm1',
      path: ['ctInfo', 'phase2'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'phase2'],
      sensorComponent<number>({
        id: 'ct_clip_power2',
        name: 'CT Clip Power 2',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'm2',
      path: ['ctInfo', 'phase3'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'phase3'],
      sensorComponent<number>({
        id: 'ct_clip_power3',
        name: 'CT Clip Power 3',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    // The meter the device is currently configured for. hm2mqtt can set this
    // with `cd=27`, but the device only ever echoed it back here, so the
    // configured value was not visible anywhere. Note that `ct_t` uses its own
    // code space, *not* the one the `meter=` parameter takes — see
    // docs/b2500.md for the two tables.
    field({
      key: 'ct_t',
      path: ['ctType'],
      transform: map({
        '1': 'ct001',
        '3': 'ct002',
        '4': 'shellyPro3em',
        '5': 'p1Meter',
        '6': 'ct003',
        '7': 'shellyEmGen3',
        '8': 'shellyProEm50',
        '9': 'ecoTracker',
      }),
    });
    advertise(
      ['ctType'],
      sensorComponent<NonNullable<B2500V2DeviceData['ctType']>>({
        id: 'ct_type',
        name: 'CT Type',
        valueMappings: {
          ct001: 'CT001',
          ct002: 'CT002',
          ct003: 'CT003',
          shellyPro3em: 'Shelly Pro 3EM',
          shellyEmGen3: 'Shelly EM Gen3',
          shellyProEm50: 'Shelly Pro EM50',
          p1Meter: 'P1 Meter',
          ecoTracker: 'EcoTracker',
        },
        enabled_by_default: false,
      }),
    );

    field({
      key: 'm3',
      path: ['ctInfo', 'microInverterPower'],
      transform: number(),
    });
    advertise(
      ['ctInfo', 'microInverterPower'],
      sensorComponent<number>({
        id: 'micro_inverter_power',
        name: 'Micro Inverter Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    // Power ratings
    field({
      key: 'lmo',
      path: ['ratedPower', 'output'],
      transform: number(),
    });
    advertise(
      ['ratedPower', 'output'],
      sensorComponent<number>({
        id: 'rated_output_power',
        name: 'Rated Output Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'lmi',
      path: ['ratedPower', 'input'],
      transform: number(),
    });
    advertise(
      ['ratedPower', 'input'],
      sensorComponent<number>({
        id: 'rated_input_power',
        name: 'Rated Input Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'lmf',
      path: ['ratedPower', 'isLimited'],
      transform: boolean(),
    });
    advertise(
      ['ratedPower', 'isLimited'],
      binarySensorComponent({ id: 'rated_power_limited', name: 'Rated Power Limited' }),
    );

    command('time-zone', {
      handler: ({ message, publishCallback, deviceState }) => {
        const timezone = parseInt(message, 10);
        if (isNaN(timezone)) {
          logger.warn('Invalid time zone value:', message);
          return;
        }

        publishCallback(
          processCommand(CommandType.TIME_ZONE, { wy: timezone }, deviceState.useFlashCommands),
        );
      },
    });
    command('sync-time', {
      handler: ({ message, publishCallback, deviceState }) => {
        try {
          // If the message is "PRESS" or similar from Home Assistant button, generate current time
          if (message === 'PRESS' || message === 'press' || message === 'true' || message === '1') {
            const now = new Date();
            // `cd=08` takes the local wall-clock time together with the offset
            // of that same zone in `wy` — not UTC. Sending UTC components with
            // a local `wy` left the device clock wrong by the offset. `mm` is
            // 0-based and `yy` is the year minus 1900.
            const timeData = {
              wy: -now.getTimezoneOffset(),
              yy: now.getFullYear() - 1900,
              mm: now.getMonth(),
              rr: now.getDate(),
              hh: now.getHours(),
              mn: now.getMinutes(),
              ss: now.getSeconds(),
            };
            publishCallback(
              processCommand(CommandType.SYNC_TIME, timeData, deviceState.useFlashCommands),
            );
            return;
          }

          // Otherwise try to parse as JSON. Every field is checked for presence
          // rather than truthiness: 0 is a legal value for all of them (January,
          // midnight, UTC+0, …) and used to be rejected as "missing".
          const timeData = JSON.parse(message);
          const requiredKeys = ['wy', 'yy', 'mm', 'rr', 'hh', 'mn', 'ss'] as const;
          if (requiredKeys.some(key => timeData?.[key] == null)) {
            logger.error('Missing time parameters:', message);
            return;
          }

          publishCallback(
            processCommand(CommandType.SYNC_TIME, timeData, deviceState.useFlashCommands),
          );
        } catch {
          logger.warn('Invalid time sync data:', message);
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

    // Surplus Feed-in switch
    field({
      key: 'tc_dis',
      path: ['surplusFeedInEnabled'],
      transform: equalsBoolean('0'),
    });
    advertise(
      ['surplusFeedInEnabled'],
      switchComponent({
        id: 'surplus_feed_in',
        name: 'Surplus Feed-in',
        icon: 'mdi:transfer',
        command: 'surplus-feed-in',
        defaultValue: 'false',
      }),
      { enabled: isSurplusFeedInSupported },
    );
    // Surplus Feed-in command
    command('surplus-feed-in', {
      handler: ({ message, publishCallback, deviceState }) => {
        const surplusFeedInSupported = isSurplusFeedInSupported(deviceState);
        if (surplusFeedInSupported === false) {
          logger.warn(
            `Surplus feed-in is not supported on ${deviceState.deviceType} version ${deviceState.deviceInfo?.deviceVersion}`,
          );
          return;
        }
        // Accepts 'true'/'1'/'ON' to enable, 'false'/'0'/'OFF' to disable
        const enable = message.toLowerCase() === 'true' || message === '1' || message === 'on';
        const value = enable ? 0 : 1;
        publishCallback(
          processCommand(
            CommandType.SURPLUS_FEED_IN,
            { touchuan_disa: value },
            deviceState.useFlashCommands,
          ),
        );
      },
    });

    // MAC address used when configuring an external meter (CT002/CT003/Shelly).
    command('meter-mac', {
      handler: ({ message, publishCallback, updateDeviceState, deviceState }) => {
        const mac = normalizeMeterMac(message);
        if (!mac) {
          logger.warn('Invalid meter MAC (expected 12 hex digits):', message);
          return;
        }
        updateDeviceState(state => {
          if (state.meterType) {
            const resolved = resolveMeterMac(state.meterType, mac);
            if (resolved !== null) {
              publishCallback(
                processCommand(
                  CommandType.SET_SMART_METER_TYPE,
                  { meter: meterTypeCommandCodes[state.meterType], mac: resolved },
                  deviceState.useFlashCommands,
                ),
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
        pattern: '^[0-9A-Fa-f]{12}$',
        // Write-only: the device never reports the configured MAC back.
        optimistic: true,
        enabled_by_default: false,
      }),
    );

    // Configure the external meter type (cd=27,meter=...,mac=...).
    command('meter-type', {
      handler: ({ message, publishCallback, updateDeviceState, deviceState }) => {
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
            processCommand(
              CommandType.SET_SMART_METER_TYPE,
              { meter: meterTypeCommandCodes[message], mac },
              deviceState.useFlashCommands,
            ),
          );
          return { meterType: message };
        });
      },
    });
    advertise(
      ['meterType'],
      selectComponent<NonNullable<B2500V2DeviceData['meterType']>>({
        id: 'meter_type',
        name: 'Meter Type',
        icon: 'mdi:meter-electric',
        command: 'meter-type',
        valueMappings: meterTypeLabels,
        // Write-only: the device never reports the configured meter type back.
        // The separate CT Type sensor shows what the device actually took.
        optimistic: true,
        enabled_by_default: false,
      }),
    );

    // `cd=27` doubles as the grid recharge command, the same way `cd=18` does on
    // the Venus and Jupiter. The device does not report the current value in any
    // response hm2mqtt polls, so this entity shows the last value that was set
    // rather than the device's own state.
    command('recharge-mode', {
      handler: ({ message, publishCallback, updateDeviceState, deviceState }) => {
        if (!isValidB2500RechargeMode(message)) {
          logger.warn('Invalid recharge mode value:', message);
          return;
        }
        updateDeviceState(() => ({ rechargeMode: message }));
        publishCallback(
          processCommand(
            CommandType.SET_SMART_METER_TYPE,
            { dchrg: message === 'threePhase' ? 1 : 0 },
            deviceState.useFlashCommands,
          ),
        );
      },
    });
    advertise(
      ['rechargeMode'],
      selectComponent<NonNullable<B2500V2DeviceData['rechargeMode']>>({
        id: 'recharge_mode',
        name: 'Recharge Mode',
        icon: 'mdi:flash',
        command: 'recharge-mode',
        valueMappings: {
          singlePhase: 'Single Phase',
          threePhase: 'Three Phase',
        },
        // Write-only: the device never reports the recharge mode back.
        optimistic: true,
        enabled_by_default: false,
      }),
    );

    // Starts the grid-phase detection routine. The device clears the phase and
    // moves the CT status to "Preparing to diagnose CT001 (Step 1)", so progress
    // can be followed on the CT Status sensor.
    command('phase-diagnosis', {
      handler: ({ message, publishCallback }) => {
        if (message.toLowerCase() === 'true' || message === '1' || message === 'PRESS') {
          // `seq_check` is a bare flag, so it cannot go through processCommand.
          publishCallback(`cd=${CommandType.SET_SMART_METER_TYPE},seq_check`);
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
  });
}

function isB2500CD16Message(message: Record<string, string>): boolean {
  let cd16BatteryInfo = ['bb', 'bv', 'bc', 'sb', 'sv', 'sc', 'lb', 'lv', 'lc'];
  if (cd16BatteryInfo.every(k => k in message)) {
    return true;
  }
  // None of the keys below are exclusive to cd=16: in a cd=01 runtime response
  // `m1`/`m2` are the CT clip 2/3 measured power instead of the input voltages,
  // so a status poll from a device with a CT meter attached looks the same. A
  // complete runtime response is never extra battery data.
  if (isB2500RuntimeInfoMessage(message)) {
    return false;
  }
  const cd16VoltageInfo = ['p1', 'p2', 'm1', 'm2', 'w1', 'w2', 'e1', 'e2', 'o1', 'o2', 'g1', 'g2'];
  const forbiddenKeys = ['m3', 'cj'];
  return cd16VoltageInfo.every(k => k in message) && !forbiddenKeys.some(k => k in message);
}

export function registerExtraBatteryData(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=16',
    isMessage: isB2500CD16Message,
    publishPath: 'extraBatteryData',
    defaultState: {},
    pollInterval: 60000,
    controlsDeviceAvailability: false,
    getAdditionalDeviceInfo: () => ({}),
    enabled: process.env.POLL_EXTRA_BATTERY_DATA === 'true',
  } as const;
  message<B2500V2CD16Data>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp_extra_battery_data',
        name: 'Extra Battery Last Updated',
        device_class: 'timestamp',
        icon: 'mdi:clock',
        enabled_by_default: false,
      }),
    );
    for (const input of [1, 2] as const) {
      field({
        key: `m${input}`,
        path: [`input${input}`, 'voltage'],
        transform: divide(1000),
      });
      advertise(
        [`input${input}`, 'voltage'],
        sensorComponent<number>({
          id: `solar_input_voltage_${input}`,
          name: `Input Voltage ${input}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
        }),
      );
      field({
        key: `c${input}`,
        path: [`input${input}`, 'current'],
        transform: divide(1000),
      });
      advertise(
        [`input${input}`, 'current'],
        sensorComponent<number>({
          id: `solar_input_current_${input}`,
          name: `Input Current ${input}`,
          device_class: 'current',
          unit_of_measurement: 'A',
          state_class: 'measurement',
        }),
      );
      field({
        key: `w${input}`,
        path: [`input${input}`, 'power'],
      });

      field({
        key: `i${input}`,
        path: [`output${input}`, 'voltage'],
        transform: divide(1000),
      });
      advertise(
        [`output${input}`, 'voltage'],
        sensorComponent<number>({
          id: `output_voltage_${input}`,
          name: `Output Voltage ${input}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
          state_class: 'measurement',
        }),
      );
      field({
        key: `c${input + 2}`,
        path: [`output${input}`, 'current'],
        transform: divide(1000),
      });
      advertise(
        [`output${input}`, 'current'],
        sensorComponent<number>({
          id: `output_current_${input}`,
          name: `Output Current ${input}`,
          device_class: 'current',
          unit_of_measurement: 'A',
          state_class: 'measurement',
        }),
      );
      field({
        key: `g${input}`,
        path: [`output${input}`, 'power'],
      });
    }

    field({
      key: 'bb',
      path: ['batteryData', 'host', 'power'],
    });
    field({
      key: 'bv',
      path: ['batteryData', 'host', 'voltage'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'host', 'voltage'],
      sensorComponent<number>({
        id: 'battery_voltage',
        name: 'Host Battery Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'bc',
      path: ['batteryData', 'host', 'current'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'host', 'current'],
      sensorComponent<number>({
        id: 'battery_current',
        name: 'Host Battery Current',
        device_class: 'current',
        unit_of_measurement: 'A',
        state_class: 'measurement',
      }),
    );
    field({
      key: 'sb',
      path: ['batteryData', 'extra1', 'power'],
    });
    field({
      key: 'sv',
      path: ['batteryData', 'extra1', 'voltage'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'extra1', 'voltage'],
      sensorComponent<number>({
        id: 'battery_extra1_voltage',
        name: 'Extra Battery 1 Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );
    field({
      key: 'sc',
      path: ['batteryData', 'extra1', 'current'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'extra1', 'current'],
      sensorComponent<number>({
        id: 'battery_extra1_current',
        name: 'Extra Battery 1 Current',
        device_class: 'current',
        unit_of_measurement: 'A',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );
    field({
      key: 'lb',
      path: ['batteryData', 'extra2', 'power'],
    });
    field({
      key: 'lv',
      path: ['batteryData', 'extra2', 'voltage'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'extra2', 'voltage'],
      sensorComponent<number>({
        id: 'battery_extra2_voltage',
        name: 'Extra Battery 2 Voltage',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );
    field({
      key: 'lc',
      path: ['batteryData', 'extra2', 'current'],
      transform: divide(1000),
    });
    advertise(
      ['batteryData', 'extra2', 'current'],
      sensorComponent<number>({
        id: 'battery_extra2_current',
        name: 'Extra Battery 2 Current',
        device_class: 'current',
        unit_of_measurement: 'A',
        state_class: 'measurement',
        enabled_by_default: false,
      }),
    );
  });
}
