import type { Device } from './types.js';
import type { AdditionalDeviceInfo } from './deviceDefinition.js';

const MAC_REGEX = /^[0-9a-fA-F]{12}$/;

function formatMac(id: string): string {
  const parts = id.toUpperCase().match(/.{2}/g);
  return parts ? parts.join(':') : id.toUpperCase();
}

export function discoveryDeviceInfo(
  device: Device,
  additionalDeviceInfo: AdditionalDeviceInfo = {},
) {
  return {
    ids: [`hame_energy_${device.deviceId}`],
    name: `HAME Energy ${device.deviceType} ${device.deviceId}`,
    model_id: device.deviceType,
    manufacturer: 'HAME Energy',
    ...(additionalDeviceInfo.firmwareVersion != null
      ? { sw_version: additionalDeviceInfo.firmwareVersion }
      : {}),
    ...(MAC_REGEX.test(device.deviceId)
      ? { connections: [['bluetooth', formatMac(device.deviceId)]] }
      : {}),
  };
}
