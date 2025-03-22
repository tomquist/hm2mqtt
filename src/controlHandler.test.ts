import { ControlHandler } from './controlHandler';
import { DeviceManager, DeviceStateData } from './deviceManager';
import {
  MqttConfig,
  Device,
  B2500V2DeviceData,
  B2500BaseDeviceData,
  B2500V1DeviceData,
} from './types';

describe('ControlHandler', () => {
  let controlHandler: ControlHandler;
  let deviceManager: DeviceManager;
  let publishCallback: jest.Mock;
  let testDeviceV1: Device;
  let testDeviceV2: Device;
  let deviceState: B2500BaseDeviceData;
  let deviceStateV1: B2500V1DeviceData;
  let deviceStateV2: B2500V2DeviceData;

  beforeEach(() => {
    testDeviceV1 = {
      deviceType: 'HMB-1',
      deviceId: 'testdeviceV1',
    };
    // Create test device
    testDeviceV2 = {
      deviceType: 'HMA-1',
      deviceId: 'testdeviceV2',
    };

    // Create mock config
    const config: MqttConfig = {
      brokerUrl: 'mqtt://test.mosquitto.org',
      clientId: 'test-client',
      devices: [testDeviceV1, testDeviceV2],
      responseTimeout: 15000,
    };

    deviceState = undefined as any;
    deviceStateV1 = undefined as any;
    deviceStateV2 = undefined as any;
    const stateUpdateHandler = (device: Device, publishPath: string, state: DeviceStateData) => {
      deviceState = state as B2500BaseDeviceData;
      deviceStateV1 = state as B2500V1DeviceData;
      deviceStateV2 = state as B2500V2DeviceData;
    };
    deviceManager = new DeviceManager(config, stateUpdateHandler);
    deviceManager.updateDeviceState(testDeviceV1, 'data', () => ({ useFlashCommands: true }));
    deviceManager.updateDeviceState(testDeviceV2, 'data', () => ({ useFlashCommands: true }));
    publishCallback = jest.fn();
    controlHandler = new ControlHandler(deviceManager, publishCallback);
  });

  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks();
  });

  function handleControlTopic(device: Device, command: string, message: string): void {
    const deviceTopics = deviceManager.getDeviceTopics(device);
    if (!deviceTopics) {
      throw new Error('Device topics not found');
    }
    let topic = `${deviceTopics.controlSubscriptionTopic}/${command}`;
    controlHandler.handleControlTopic(device, topic, message);
  }

  describe('handleControlTopic', () => {
    test('should handle charging-mode control topic', () => {
      // Call the method with a charging mode message
      handleControlTopic(testDeviceV2, 'charging-mode', 'chargeDischargeSimultaneously');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=3,md=0'),
      );
    });

    test('should handle charging-mode with named option', () => {
      // Call the method with a named option
      handleControlTopic(testDeviceV2, 'charging-mode', 'chargeThenDischarge');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=3,md=1'),
      );
    });

    test('should handle invalid charging-mode value', () => {
      // Call the method with an invalid value
      handleControlTopic(testDeviceV2, 'charging-mode', 'invalid');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should enable adaptive-mode', () => {
      // Call the method with a discharge mode message
      handleControlTopic(testDeviceV2, 'adaptive-mode', 'true');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=4,md=1'),
      );
    });

    test('should disable adaptive-mode', () => {
      // Call the method with a named option
      handleControlTopic(testDeviceV2, 'adaptive-mode', 'false');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=4,md=0'),
      );
    });

    test('should handle individual output control', () => {
      // Enable output 1
      let device = testDeviceV1;
      handleControlTopic(device, 'output1', 'true');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        device,
        expect.stringContaining('cd=4,md=1'), // Bit 0 set (output1 enabled)
      );

      // Reset and test output 2
      publishCallback.mockClear();

      // Enable output 2
      handleControlTopic(device, 'output2', 'true');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        device,
        expect.stringContaining('cd=4,md=3'), // Bit 0 and 1 set (output1 and output2 enabled)
      );

      // Reset and test both outputs
      publishCallback.mockClear();

      // Disable output 1
      handleControlTopic(device, 'output1', 'false');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        device,
        expect.stringContaining('cd=4,md=2'), // Only bit 1 set (output1 disabled, output2 enabled)
      );
    });

    test('should handle discharge-depth control topic', () => {
      // Call the method with a discharge depth message
      handleControlTopic(testDeviceV2, 'discharge-depth', '75');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=5,md=75'),
      );
    });

    test('should handle invalid discharge-depth value', () => {
      // Call the method with an invalid value
      handleControlTopic(testDeviceV2, 'discharge-depth', '101');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle battery-threshold control topic', () => {
      // Call the method with a battery threshold message
      handleControlTopic(testDeviceV1, 'battery-threshold', '300');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV1,
        expect.stringContaining('cd=6,md=300'),
      );
    });

    test('should handle invalid battery-threshold value', () => {
      // Call the method with an invalid value
      handleControlTopic(testDeviceV2, 'battery-threshold', '900');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle restart control topic', () => {
      // Call the method with a restart message
      handleControlTopic(testDeviceV2, 'restart', 'true');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(testDeviceV2, expect.stringContaining('cd=10'));
    });

    test('should handle restart with numeric value', () => {
      // Call the method with a numeric value
      handleControlTopic(testDeviceV2, 'restart', '1');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(testDeviceV2, expect.stringContaining('cd=10'));
    });

    test('should not restart with false value', () => {
      // Call the method with a false value
      handleControlTopic(testDeviceV2, 'restart', 'false');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle factory-reset control topic', () => {
      // Call the method with a factory reset message
      handleControlTopic(testDeviceV2, 'factory-reset', 'true');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(testDeviceV2, expect.stringContaining('cd=11'));
    });

    test('should not factory reset with false value', () => {
      // Call the method with a false value
      handleControlTopic(testDeviceV2, 'factory-reset', 'false');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle time-zone control topic', () => {
      // Call the method with a time zone message
      handleControlTopic(testDeviceV2, 'time-zone', '480');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=9,wy=480'),
      );
    });

    test('should handle invalid time-zone value', () => {
      // Call the method with an invalid value
      handleControlTopic(testDeviceV2, 'time-zone', 'invalid');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle sync-time control topic with PRESS', () => {
      // Mock Date.now to return a consistent date for testing
      const mockDate = new Date(2023, 0, 1, 12, 30, 45);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      // Call the method with a sync time message
      handleControlTopic(testDeviceV2, 'sync-time', 'PRESS');

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=8,wy=480,yy=123,mm=0,rr=1,hh=12,mn=30,ss=45'),
      );

      // Restore Date
      jest.restoreAllMocks();
    });

    test('should handle sync-time control topic with JSON', () => {
      // Call the method with a sync time JSON message
      const timeData = {
        wy: 480,
        yy: 123,
        mm: 1,
        rr: 2,
        hh: 23,
        mn: 56,
        ss: 56,
      };

      handleControlTopic(testDeviceV2, 'sync-time', JSON.stringify(timeData));

      // Check that the publish callback was called with the correct payload
      expect(publishCallback).toHaveBeenCalledWith(
        testDeviceV2,
        expect.stringContaining('cd=8,wy=480,yy=123,mm=1,rr=2,hh=23,mn=56,ss=56'),
      );
    });

    test('should handle invalid sync-time JSON', () => {
      // Call the method with an invalid JSON
      handleControlTopic(testDeviceV2, 'sync-time', '{"wy": 480}');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle malformed sync-time JSON', () => {
      // Call the method with malformed JSON
      handleControlTopic(testDeviceV2, 'sync-time', 'not json');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle use-flash-commands control topic', () => {
      // Call the method with a use flash commands message
      handleControlTopic(testDeviceV2, 'use-flash-commands', 'false');

      expect(deviceState.useFlashCommands).toBe(false);
    });

    test('should handle time period settings', () => {
      deviceManager.updateDeviceState(testDeviceV2, 'data', () => ({
        timePeriods: [
          {
            enabled: false,
            startTime: '00:00',
            endTime: '23:59',
            outputValue: 800,
          },
        ],
      }));
      // Call the method with a time period setting
      handleControlTopic(testDeviceV2, 'time-period/1/enabled', 'true');

      expect(deviceStateV2.timePeriods?.[0].enabled).toBe(true);

      // Check that the publish callback was called with the correct payload
      // Note: The CD value can be 07 (flash) or 20 (non-flash)
      expect(publishCallback).toHaveBeenCalledWith(testDeviceV2, expect.stringMatching(/cd=7/));
    });

    test('should handle invalid time period number', () => {
      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn');

      // Call the method with an invalid time period number
      handleControlTopic(testDeviceV2, 'time-period/6/enabled', 'true');

      // Check that console.warn was called
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle unknown control topic', () => {
      // Call the method with an unknown control topic
      handleControlTopic(testDeviceV2, 'unknown-topic', 'value');

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle error in control topic processing', () => {
      // Mock getDeviceTopics to throw an error
      jest.spyOn(deviceManager, 'getDeviceTopics').mockImplementation(() => {
        throw new Error('Test error');
      });

      // Call the method
      controlHandler.handleControlTopic(
        testDeviceV2,
        `hame_energy/${testDeviceV2.deviceType}/control/${testDeviceV2.deviceId}`,
        'chargeDischargeSimultaneously',
      );

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });

    test('should handle missing device topics', () => {
      // Mock getDeviceTopics to return undefined
      jest.spyOn(deviceManager, 'getDeviceTopics').mockReturnValue(undefined);

      // Call the method
      controlHandler.handleControlTopic(
        testDeviceV2,
        `hame_energy/${testDeviceV2.deviceType}/control/${testDeviceV2.deviceId}`,
        'chargeDischargeSimultaneously',
      );

      // Check that the publish callback was not called
      expect(publishCallback).not.toHaveBeenCalled();
    });
  });
});
