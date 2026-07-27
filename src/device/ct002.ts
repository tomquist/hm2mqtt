import {
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import { CT002DeviceData, CT002PhaseEnergyInfo } from '../types.js';
import { sensorComponent } from '../homeAssistantDiscovery.js';
import { number } from '../transforms.js';
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

const phaseEnergyFields = [
  { key: 'ca', path: 'phase1Charge', id: 'phase1_charge', name: 'Phase 1 Charge' },
  { key: 'cb', path: 'phase2Charge', id: 'phase2_charge', name: 'Phase 2 Charge' },
  { key: 'cc', path: 'phase3Charge', id: 'phase3_charge', name: 'Phase 3 Charge' },
  { key: 'da', path: 'phase1Discharge', id: 'phase1_discharge', name: 'Phase 1 Discharge' },
  { key: 'db', path: 'phase2Discharge', id: 'phase2_discharge', name: 'Phase 2 Discharge' },
  { key: 'dc', path: 'phase3Discharge', id: 'phase3_discharge', name: 'Phase 3 Discharge' },
] as const;

function isPhaseEnergyMessage(values: Record<string, string>): boolean {
  // The `cd=19` acknowledgement of a write carries `ret` instead of the counters.
  return !('ret' in values) && phaseEnergyFields.every(({ key }) => key in values);
}

registerDeviceDefinition(
  {
    deviceTypes: ['HME', 'TPM', 'TPM2'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerPhaseEnergyMessage(message);
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

/**
 * Per-phase charge/discharge counters, requested with `cd=19`. They are not part
 * of the `cd=1` runtime payload, so they need their own poll.
 *
 * The counters are published raw: `ca`/`cb`/`cc` are the per-phase charge
 * counters and `da`/`db`/`dc` the discharge ones, but their unit and scale could
 * not be established, so no `device_class` or `unit_of_measurement` is claimed.
 * All six are disabled by default.
 */
function registerPhaseEnergyMessage(message: BuildMessageFn) {
  message<CT002PhaseEnergyInfo>(
    {
      refreshDataPayload: 'cd=19',
      isMessage: isPhaseEnergyMessage,
      publishPath: 'phase_energy',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      // Cumulative counters move slowly, so poll them far less often than the
      // runtime data.
      pollInterval: Math.max(globalPollInterval, 300000),
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      for (const { key, path, id, name } of phaseEnergyFields) {
        field({ key, path: [path], transform: number() });
        advertise(
          [path],
          sensorComponent<number>({
            id,
            name,
            icon: 'mdi:counter',
            enabled_by_default: false,
          }),
          { enabled: state => (state[path] != null ? true : undefined) },
        );
      }
    },
  );
}
