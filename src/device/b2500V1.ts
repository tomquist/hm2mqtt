import { registerDeviceDefinition } from '../deviceDefinition';
import { B2500V1DeviceData } from '../types';
import {
  CommandType,
  extractAdditionalDeviceInfo,
  processCommand,
  registerBaseMessage,
} from './b2500Base';
import {
  numberComponent,
  selectComponent,
  sensorComponent,
  switchComponent,
} from '../homeAssistantDiscovery';
import { transformBitBoolean } from './helpers';

registerDeviceDefinition<B2500V1DeviceData>(
  {
    deviceTypes: ['HMB'],
    defaultState: { useFlashCommands: false },
    refreshDataPayload: 'cd=1',
    getAdditionalDeviceInfo: extractAdditionalDeviceInfo,
  },
  args => {
    registerBaseMessage(args);
    const { field, command, advertise } = args;

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
      handler: ({ device, message, publishCallback, deviceState }) => {
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
  },
);
