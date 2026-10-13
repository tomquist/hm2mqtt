import {
  BaseDeviceData,
  BuildMessageFn,
  globalPollInterval,
  registerDeviceDefinition,
} from '../deviceDefinition.js';
import {
  CT002DeviceData,
  CT002EnergyInfo,
  CT002PhaseEnergyInfo,
  CT002PhaseMeasurementInfo,
  MeterBaseDeviceData,
} from '../types.js';
import {
  CT002_ENERGY_POLL_OFFSET_MS,
  CT002_MEASUREMENT_POLL_OFFSET_MS,
  MIN_PHASE_ENERGY_POLL_INTERVAL_MS,
} from '../constants.js';
import { sensorComponent } from '../homeAssistantDiscovery.js';
import { ct002Energy, number, sum } from '../transforms.js';
import { extractMeterDeviceInfo, registerMeterBaseFields } from './meterBase.js';

/**
 * Marstek CT002 smart meter. Three device types are sold under the CT002 model
 * and all speak the same protocol:
 *
 * - `HME-4` — CT002
 * - `TPM-CN` — CT002-CN
 * - `TPM2-0` — CT002, sold as the TPM2-100CT
 *
 * (`HME-2` is a CT002 as well and shares the `HME` base type with `HME-4`.
 * `HME-3` and `HME-5` share that base type too, but they are CT003 smart meter
 * readers with a different payload, and are registered in `smr.ts`.)
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

/** `cd=31` and `cd=32` exist from HME-4 firmware 124 on. */
function supportsMeasurementCommands(state: BaseDeviceData): boolean {
  return ((state as MeterBaseDeviceData).firmwareVersion ?? 0) >= 124;
}

/** Advertise only once the device has answered, as with the other optional readings. */
const whenReported =
  <T extends BaseDeviceData>(path: keyof T) =>
  (state: T) =>
    state[path] != null ? true : undefined;

const phaseMeasurementFields = [
  { phase: 1, voltage: 'va', current: 'ia', reactive: 'fvara' },
  { phase: 2, voltage: 'vb', current: 'ib', reactive: 'fvarb' },
  { phase: 3, voltage: 'vc', current: 'ic', reactive: 'fvarc' },
] as const;

const voltageAngleFields = [
  { key: 'uab', path: 'phase12VoltageAngle', id: 'phase12_voltage_angle', name: 'Phase 1-2' },
  { key: 'ubc', path: 'phase23VoltageAngle', id: 'phase23_voltage_angle', name: 'Phase 2-3' },
  { key: 'uca', path: 'phase31VoltageAngle', id: 'phase31_voltage_angle', name: 'Phase 3-1' },
] as const;

const energyFields = [
  { key: 'kwh_a', path: 'phase1PositiveEnergy', id: 'phase1_positive_energy', phase: 1 },
  { key: 'kwh_b', path: 'phase2PositiveEnergy', id: 'phase2_positive_energy', phase: 2 },
  { key: 'kwh_c', path: 'phase3PositiveEnergy', id: 'phase3_positive_energy', phase: 3 },
  { key: 'n_kwh_a', path: 'phase1NegativeEnergy', id: 'phase1_negative_energy', phase: 1 },
  { key: 'n_kwh_b', path: 'phase2NegativeEnergy', id: 'phase2_negative_energy', phase: 2 },
  { key: 'n_kwh_c', path: 'phase3NegativeEnergy', id: 'phase3_negative_energy', phase: 3 },
] as const;

const energyTotals = [
  {
    keys: ['kwh_a', 'kwh_b', 'kwh_c'],
    path: 'totalPositiveEnergy',
    id: 'total_positive_energy',
    name: 'Total Positive Energy',
  },
  {
    keys: ['n_kwh_a', 'n_kwh_b', 'n_kwh_c'],
    path: 'totalNegativeEnergy',
    id: 'total_negative_energy',
    name: 'Total Negative Energy',
  },
] as const;

// The HME firmware has no `cd=19`. Instead, firmware 124 and later answers
// `cd=31` (voltage and current) and `cd=32` (energy).
registerDeviceDefinition(
  {
    deviceTypes: ['HME'],
  },
  ({ message }) => {
    registerRuntimeInfoMessage(message);
    registerPhaseMeasurementMessage(message);
    registerEnergyMessage(message);
  },
);

registerDeviceDefinition(
  {
    deviceTypes: ['TPM', 'TPM2'],
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
 * Only registered for `TPM-CN` and `TPM2-X`, and unverified there: no reply to
 * `cd=19` has been reported from any meter. The `HME-X` firmware does not handle
 * `cd=19` at all, so it is not polled on those.
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
      pollInterval: Math.max(globalPollInterval, MIN_PHASE_ENERGY_POLL_INTERVAL_MS),
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

/**
 * Per-phase voltage and current, requested with `cd=31` (HME-4 firmware 124 and
 * later). The reply repeats the phase powers, which come from `cd=1` already,
 * and carries power-factor, plain reactive-power and `ui*` fields that are
 * always 0; none of those are mapped.
 *
 * `fvara`..`fvarc` are a reactive power per phase with the sign the metering
 * chip reports (the measurement direction does not apply to them), and
 * `uab`/`ubc`/`uca` are the angles between the phase voltages, about 120° each
 * on a correctly wired three-phase supply. Both are disabled by default.
 *
 * Never send `cd=30`: on firmware 124 it is answered with this `cd=31` reply.
 */
function registerPhaseMeasurementMessage(message: BuildMessageFn) {
  message<CT002PhaseMeasurementInfo>(
    {
      refreshDataPayload: 'cd=31',
      isMessage: values => values.cd === '31' && 'va' in values,
      publishPath: 'phase_measurements',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: globalPollInterval,
      pollOffsetMs: CT002_MEASUREMENT_POLL_OFFSET_MS,
      shouldPoll: supportsMeasurementCommands,
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      for (const { phase, voltage, current, reactive } of phaseMeasurementFields) {
        const voltagePath = `phase${phase}Voltage` as const;
        field({ key: voltage, path: [voltagePath], transform: number() });
        advertise(
          [voltagePath],
          sensorComponent<number>({
            id: `phase${phase}_voltage`,
            name: `Phase ${phase} Voltage`,
            device_class: 'voltage',
            unit_of_measurement: 'V',
            state_class: 'measurement',
          }),
          { enabled: whenReported(voltagePath) },
        );

        const currentPath = `phase${phase}Current` as const;
        field({ key: current, path: [currentPath], transform: number() });
        advertise(
          [currentPath],
          sensorComponent<number>({
            id: `phase${phase}_current`,
            name: `Phase ${phase} Current`,
            device_class: 'current',
            unit_of_measurement: 'A',
            state_class: 'measurement',
          }),
          { enabled: whenReported(currentPath) },
        );

        const reactivePath = `phase${phase}ReactivePower` as const;
        field({ key: reactive, path: [reactivePath], transform: number() });
        advertise(
          [reactivePath],
          sensorComponent<number>({
            id: `phase${phase}_reactive_power`,
            name: `Phase ${phase} Reactive Power`,
            device_class: 'reactive_power',
            unit_of_measurement: 'var',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: whenReported(reactivePath) },
        );
      }

      for (const { key, path, id, name } of voltageAngleFields) {
        field({ key, path: [path], transform: number() });
        advertise(
          [path],
          sensorComponent<number>({
            id,
            name: `${name} Voltage Angle`,
            icon: 'mdi:angle-acute',
            unit_of_measurement: '°',
            state_class: 'measurement',
            enabled_by_default: false,
          }),
          { enabled: whenReported(path) },
        );
      }
    },
  );
}

/**
 * Per-phase energy, requested with `cd=32` (HME-4 firmware 124 and later), e.g.
 * `kwh_a=12.50kwh`. "Positive" and "negative" are the two directions of energy
 * flow as the clamp sees it; which of them is import depends on how the clamp
 * is fitted, and the measurement direction setting does not apply to them.
 *
 * The counters only live in the meter's memory, so they restart from 0 when it
 * reboots. The meter's own `kwh`/`n_kwh` totals add the hundredths of the three
 * phases without carrying (15.133 instead of 16.33), so the totals are computed
 * from the phases instead. All of these are disabled by default.
 */
function registerEnergyMessage(message: BuildMessageFn) {
  message<CT002EnergyInfo>(
    {
      refreshDataPayload: 'cd=32',
      isMessage: values => values.cd === '32' && 'kwh_a' in values,
      publishPath: 'energy',
      defaultState: {},
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: Math.max(globalPollInterval, MIN_PHASE_ENERGY_POLL_INTERVAL_MS),
      pollOffsetMs: CT002_ENERGY_POLL_OFFSET_MS,
      shouldPoll: supportsMeasurementCommands,
      controlsDeviceAvailability: false,
    },
    ({ field, advertise }) => {
      const energySensor = (id: string, name: string) =>
        sensorComponent<number>({
          id,
          name,
          device_class: 'energy',
          unit_of_measurement: 'Wh',
          state_class: 'total_increasing',
          enabled_by_default: false,
        });

      for (const { key, path, id, phase } of energyFields) {
        const direction = key.startsWith('n_') ? 'Negative' : 'Positive';
        field({ key, path: [path], transform: ct002Energy(), monotonic: true });
        advertise([path], energySensor(id, `Phase ${phase} ${direction} Energy`), {
          enabled: whenReported(path),
        });
      }

      for (const { keys, path, id, name } of energyTotals) {
        field({
          key: keys,
          path: [path],
          transform: sum(undefined, ct002Energy()),
          monotonic: true,
        });
        advertise([path], energySensor(id, name), { enabled: whenReported(path) });
      }
    },
  );
}
