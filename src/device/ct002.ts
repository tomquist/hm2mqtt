import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import { CT002DeviceData } from '../types.js';
import { extractMeterDeviceInfo, registerMeterBaseFields } from './meterBase.js';

/**
 * Marstek CT002 smart meter. Three device types are sold under the CT002 model
 * and all speak the same protocol:
 *
 * - `HME-4` — CT002
 * - `TPM-CN` — CT002-CN
 * - `TPM2-0` — CT002, sold as the TPM2-100CT
 *
 * (`HME-2` is a CT002 as well and shares the `HME` base type with `HME-4`.)
 */
const requiredRuntimeInfoKeys = ['pwr_a', 'pwr_b', 'pwr_c', 'pwr_t'];

function isCt002RuntimeInfoMessage(values: Record<string, string>): boolean {
  return requiredRuntimeInfoKeys.every(k => k in values);
}

registerDeviceDefinition(
  {
    deviceTypes: ['HME', 'TPM', 'TPM2'],
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
    getAdditionalDeviceInfo: extractMeterDeviceInfo,
    pollInterval: globalPollInterval,
    controlsDeviceAvailability: true,
  } as const;
  // The CT002 is the one meter whose `cd=5` is the phase direction command, so
  // it gets switches rather than read-only sensors.
  message<CT002DeviceData>(options, args =>
    registerMeterBaseFields(args, { settablePhaseMeasurementDirection: true }),
  );
}
