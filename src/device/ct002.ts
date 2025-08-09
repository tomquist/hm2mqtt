import { BuildMessageFn, globalPollInterval, registerDeviceDefinition } from '../deviceDefinition';
import { CT002DeviceData } from '../types';
import { sensorComponent } from '../homeAssistantDiscovery';

const requiredRuntimeInfoKeys = ['pwr_a', 'pwr_b', 'pwr_c', 'pwr_t'];

function isCt002RuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(k => k in values);
}

function extractAdditionalDeviceInfo(state: CT002DeviceData) {
  return {
    firmwareVersion: state.firmwareVersion?.toString(),
  };
}

registerDeviceDefinition(
  {
    deviceTypes: ['HME'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
  },
);

function registerRuntimeInfoMessage(message: BuildMessageFn) {
  const options = {
    refreshDataPayload: 'cd=1',
    isMessage: isCt002RuntimeInfoMessage,
    publishPath: 'data',
    defaultState: {},
    getAdditionalDeviceInfo: extractAdditionalDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;
  message<CT002DeviceData>(options, ({ field, advertise }) => {
    advertise(
      ['timestamp'],
      sensorComponent<string>({
        id: 'timestamp',
        name: 'Last Update',
        device_class: 'timestamp',
        icon: 'mdi:clock',
      }),
    );

    field({ key: 'pwr_a', path: ['phase1Power'] });
    advertise(
      ['phase1Power'],
      sensorComponent<number>({
        id: 'phase1_power',
        name: 'Phase 1 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_b', path: ['phase2Power'] });
    advertise(
      ['phase2Power'],
      sensorComponent<number>({
        id: 'phase2_power',
        name: 'Phase 2 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_c', path: ['phase3Power'] });
    advertise(
      ['phase3Power'],
      sensorComponent<number>({
        id: 'phase3_power',
        name: 'Phase 3 Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'pwr_t', path: ['totalPower'] });
    advertise(
      ['totalPower'],
      sensorComponent<number>({
        id: 'total_power',
        name: 'Total Power',
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      }),
    );

    field({ key: 'ble_s', path: ['bluetoothSignal'] });
    advertise(
      ['bluetoothSignal'],
      sensorComponent<number>({
        id: 'bluetooth_signal',
        name: 'Bluetooth Signal',
      }),
    );

    field({ key: 'wif_r', path: ['wifiRssi'] });
    advertise(
      ['wifiRssi'],
      sensorComponent<number>({
        id: 'wifi_rssi',
        name: 'WiFi RSSI',
        device_class: 'signal_strength',
        unit_of_measurement: 'dBm',
        state_class: 'measurement',
      }),
    );

    field({ key: 'fc4_v', path: ['fc4Version'], transform: v => v });
    advertise(
      ['fc4Version'],
      sensorComponent<string>({
        id: 'fc4_version',
        name: 'FC41D Firmware',
      }),
    );

    field({ key: 'ver_v', path: ['firmwareVersion'] });
    advertise(
      ['firmwareVersion'],
      sensorComponent<number>({
        id: 'firmware_version',
        name: 'Firmware Version',
      }),
    );

    field({ key: 'wif_s', path: ['wifiStatus'] });
    advertise(
      ['wifiStatus'],
      sensorComponent<number>({
        id: 'wifi_status',
        name: 'WiFi Status',
      }),
    );
  });
}
