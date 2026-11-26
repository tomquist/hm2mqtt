import { discoveryDeviceInfo } from './discoveryDeviceInfo.js';

describe('Discovery device metadata', () => {
  const device = {
    deviceType: 'JPLS-8H',
    deviceId: '0123456789ab',
  };

  test('preserves the existing device identity', () => {
    expect(discoveryDeviceInfo(device)).toMatchObject({
      ids: ['hame_energy_0123456789ab'],
      name: 'HAME Energy JPLS-8H 0123456789ab',
      model_id: 'JPLS-8H',
      manufacturer: 'HAME Energy',
    });
  });

  test('formats Bluetooth MAC addresses', () => {
    expect(discoveryDeviceInfo(device).connections).toEqual([['bluetooth', '01:23:45:67:89:AB']]);
  });

  test('includes known firmware metadata', () => {
    expect(
      discoveryDeviceInfo(device, {
        firmwareVersion: '143.39.217.110',
      }).sw_version,
    ).toBe('143.39.217.110');
  });

  test('omits unknown firmware metadata', () => {
    expect(discoveryDeviceInfo(device)).not.toHaveProperty('sw_version');
  });

  test('does not interpret arbitrary identifiers as MAC addresses', () => {
    expect(
      discoveryDeviceInfo({
        ...device,
        deviceId: 'test-device',
      }),
    ).not.toHaveProperty('connections');
  });
});
