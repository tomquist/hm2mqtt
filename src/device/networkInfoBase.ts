import { BuildMessageFn, globalPollInterval } from '../deviceDefinition.js';
import { NetworkInfo } from '../types.js';
import { sensorComponent } from '../homeAssistantDiscovery.js';
import { identity } from '../transforms.js';

/**
 * Shared handling of the `cd=26` network-configuration response, which the
 * Venus (see `venus.ts`) and the Jupiter (see `jupiter.ts`) answer with the
 * same payload:
 *
 *   cd=26,dev_net_info:ip:1.2.3.4,gate:1.2.3.1,mask:255.255.255.0,dns:1.2.3.1,ct_connect_ip:1.2.3.255
 *
 * The message parser normalizes that non-standard colon-delimited format into
 * plain `ip=…` key/value pairs before the fields below see it.
 */

const networkFields = [
  ['ip', 'ipAddress', 'IP Address', 'mdi:ip-network'],
  ['gate', 'gateway', 'Gateway', 'mdi:router-network'],
  ['mask', 'subnetMask', 'Subnet Mask', 'mdi:ip-network-outline'],
  ['dns', 'dns', 'DNS Server', 'mdi:dns'],
  ['ct_connect_ip', 'ctConnectIp', 'CT Connect IP', 'mdi:current-ac'],
] as const;

export interface NetworkInfoMessageOptions {
  /** Device-specific `cd` code for requesting the network information. */
  commandCode: number;
  /** Recognizes the normalized `cd=26` response for this device family. */
  isMessage: (values: Record<string, string>) => boolean;
  /**
   * Whether the IP Address sensor is enabled by default. Every other network
   * sensor is always disabled by default.
   */
  ipEnabledByDefault: boolean;
}

export function registerNetworkInfoMessage(
  message: BuildMessageFn,
  { commandCode, isMessage, ipEnabledByDefault }: NetworkInfoMessageOptions,
): void {
  message<NetworkInfo>(
    {
      refreshDataPayload: `cd=${commandCode}`,
      isMessage,
      publishPath: 'network',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      // Network configuration changes rarely, so poll it infrequently.
      pollInterval: Math.max(globalPollInterval, 300000),
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      for (const [key, path, name, icon] of networkFields) {
        field({ key, path: [path], transform: identity() });
        advertise(
          [path],
          sensorComponent<string>({
            id: `network_${path.replace(/([A-Z])/g, '_$1').toLowerCase()}`,
            name,
            icon,
            enabled_by_default: ipEnabledByDefault && key === 'ip',
          }),
          // Only publish a sensor once the device has actually reported the
          // corresponding value.
          { enabled: state => (state[path] != null ? true : undefined) },
        );
      }
    },
  );
}
