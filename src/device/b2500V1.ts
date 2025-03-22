import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import { B2500V1CD16Data, B2500V1DeviceData } from '../types';
import {
  CommandType,
  extractAdditionalDeviceInfo,
  isB2500RuntimeInfoMessage,
  processCommand,
  registerBaseMessage,
  registerCalibrationDataMessage,
  registerCellDataMessage,
} from './b2500Base';
import {
  numberComponent,
  selectComponent,
  sensorComponent,
  switchComponent,
} from '../homeAssistantDiscovery';
import { transformBitBoolean } from './helpers';

registerDeviceDefinition(
  {
    deviceTypes: ['HMB'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    if (process.env.POLL_EXTRA_BATTERY_DATA === 'true') {
      registerExtraBatteryData(message);
    }
    if (process.env.POLL_CELL_DATA === 'true') {
      registerCellDataMessage(message);
    }
    if (process.env.POLL_CALIBRATION_DATA === 'true') {
      registerCalibrationDataMessage(message);
    }
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
  } as const;
  message<B2500V1DeviceData>(options, ({ field, command, advertise }) => {
    registerBaseMessage({ field, command, advertise });

    field({
      key: 'cs',
      path: ['chargingMode'],
      transform: v => {
        switch (v) {
          case '0':
            return 'pv2PassThrough';
          case '1':
            return 'chargeThenDischarge';
        }
      },
    });
    advertise(
      ['chargingMode'],
      selectComponent({
        id: 'charging_mode',
        name: 'Charging Mode',
        command: 'charging-mode',
        valueMappings: {
          pv2PassThrough: 'PV2 Pass Through',
          chargeThenDischarge: 'Fully Charge Then Discharge',
        },
      }),
    );
    command('charging-mode', {
      handler: ({ message, publishCallback, deviceState }) => {
        const validModes = ['pv2PassThrough', 'chargeThenDischarge'];
        if (!validModes.includes(message)) {
          console.error('Invalid charging mode value:', message);
          return;
        }

        let mode: number;
        switch (message) {
          case 'pv2PassThrough':
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
      key: 'lv',
      path: ['batteryOutputThreshold'],
    });
    advertise(
      ['batteryOutputThreshold'],
      numberComponent({
        id: 'battery_output_threshold',
        name: 'Battery Output Threshold',
        device_class: 'power',
        unit_of_measurement: 'W',
        command: 'battery-threshold',
        min: 0,
        max: 800,
      }),
    );

    command('battery-threshold', {
      handler: ({ message, publishCallback, deviceState }) => {
        const threshold = parseInt(message, 10);
        if (isNaN(threshold) || threshold < 0 || threshold > 800) {
          console.error('Invalid battery threshold value:', message);
          return;
        }

        publishCallback(
          processCommand(
            CommandType.BATTERY_OUTPUT_THRESHOLD,
            { md: threshold },
            deviceState.useFlashCommands,
          ),
        );
      },
    });

    for (const outputNumber of [1, 2] as const) {
      field({
        key: 'cd',
        path: ['outputEnabled', `output${outputNumber}`],
        transform: transformBitBoolean(outputNumber - 1),
      });
      advertise(
        [`outputEnabled`, `output${outputNumber}`],
        switchComponent({
          id: `output${outputNumber}_enabled`,
          name: `Output ${outputNumber} Enabled`,
          icon: 'mdi:power-socket',
          command: `output${outputNumber}`,
        }),
      );

      command(`output${outputNumber}`, {
        handler: ({ updateDeviceState, message, publishCallback, deviceState }) => {
          // Get current output states from device state or default to false
          const output1Enabled = deviceState.outputEnabled?.output1 || false;
          const output2Enabled = deviceState.outputEnabled?.output2 || false;

          // Parse the new state
          const newState = message.toLowerCase() === 'true' || message === '1' || message === 'ON';

          // Calculate the new discharge mode value
          let modeValue = 0;
          if (outputNumber === 1) {
            // Update output 1 state, keep output 2 state
            modeValue = (newState ? 1 : 0) | (output2Enabled ? 2 : 0);
          } else if (outputNumber === 2) {
            // Keep output 1 state, update output 2 state
            modeValue = (output1Enabled ? 1 : 0) | (newState ? 2 : 0);
          }

          console.log(
            `Setting output ${outputNumber} to ${newState ? 'ON' : 'OFF'}, new discharge mode: ${modeValue}`,
          );

          // Update the device state to reflect the change immediately
          updateDeviceState(state => {
            return {
              outputEnabled: {
                ...state.outputEnabled,
                ...(outputNumber === 1 ? { output1: newState } : { output2: newState }),
              },
            };
          });

          // Send the updated discharge mode
          publishCallback(
            processCommand(
              CommandType.DISCHARGE_MODE,
              { md: modeValue },
              // v1 doesn't (yet) support non-flash command for discharge mode
              true,
            ),
          );
        },
      });
    }
  });
}

function isB2500CD16Message(message: Record<string, string>): boolean {
  const cd16VoltageInfo = ['p1', 'p2', 'm1', 'm2', 'w1', 'w2', 'e1', 'e2', 'o1', 'o2', 'g1', 'g2'];
  const forbiddenKeys = ['m3', 'cj'];
  if (cd16VoltageInfo.every(k => k in message) && !forbiddenKeys.some(k => k in message)) {
    return true;
  }

  return false;
}

function registerExtraBatteryData(message: BuildMessageFn) {
  let options = {
    refreshDataPayload: 'cd=16',
    isMessage: isB2500CD16Message,
    publishPath: 'extraBatteryData',
    defaultState: {},
    getAdditionalDeviceInfo: () => ({}),
    pollInterval: globalPollInterval,
  } as const;
  message<B2500V1CD16Data>(options, ({ field, advertise }) => {
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
      });
      advertise(
        [`input${input}`, 'voltage'],
        sensorComponent<number>({
          id: `solar_input_voltage_${input}`,
          name: `Input Voltage ${input}`,
          device_class: 'voltage',
          unit_of_measurement: 'V',
        }),
      );
      field({
        key: `w${input}`,
        path: [`input${input}`, 'power'],
      });
      field({
        key: `g${input}`,
        path: [`output${input}`, 'power'],
      });
    }
  });
}
