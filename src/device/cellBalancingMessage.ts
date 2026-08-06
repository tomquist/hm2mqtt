import { BuildMessageFn } from '../deviceDefinition.js';
import { binarySensorComponent, sensorComponent } from '../homeAssistantDiscovery.js';
import { CellBalancingData } from '../types.js';
import {
  advanceBalancingState,
  BalancingState,
  CellSample,
  computeCellStats,
  computeDrift,
  initialBalancingState,
  SampleClock,
  StateByPath,
} from '../cellBalancing.js';
import { isPersistenceAvailable, loadRecord, saveRecord } from '../persistence.js';
import {
  CELL_BALANCE_HIGH_THRESHOLD_MV,
  CELL_BALANCE_THRESHOLD_MV,
  CELL_KNEE_CROSSING_MV,
  PERSIST_SCHEMA_VERSION,
} from '../constants.js';

/**
 * Registers the derived cell balancing message shared by every family that
 * reports individual cell voltages.
 *
 * The metrics answer a question the existing *Cell Voltage Difference* sensor
 * cannot: a pack whose spread collapsed overnight has almost certainly just
 * slid down the flat part of the LFP curve under its own standby draw, with no
 * change in the cells' relative state of charge.
 */

export interface CellBalancingSource {
  /** publishPath carrying the cell voltages; a new timestamp there is one sample. */
  cellPath: string;
  extract: (stateByPath: StateByPath, clock: SampleClock) => CellSample | undefined;
}

const states = new Map<string, BalancingState>();
const lastCellTimestamps = new Map<string, string>();
const restored = new Set<string>();

/** Test seam; production never needs to forget a device. */
export function resetCellBalancingState(): void {
  states.clear();
  lastCellTimestamps.clear();
  restored.clear();
}

function stateFor(key: string, deviceType: string, deviceId: string): BalancingState {
  let state = states.get(key);
  if (state != null) {
    return state;
  }

  state = initialBalancingState();

  // Restore only what survives an unobserved gap. The in-flight session and the
  // drift window are deliberately not persisted: we have no idea what the pack
  // did while we were not running, and a slope measured across the downtime
  // would be meaningless.
  if (!restored.has(key)) {
    restored.add(key);
    const stored = loadRecord(deviceType, deviceId);
    if (stored != null) {
      state.cycles = stored.cycles;
      state.msAboveThreshold = stored.msAboveThreshold;
      state.msAboveHighThreshold = stored.msAboveHighThreshold;
      state.localDate = stored.localDate;
      state.minSocPct = stored.minSocPct;
    }
  }

  states.set(key, state);
  return state;
}

/** Local calendar day, used only to roll the daily counters over. */
function localDateOf(at: number): string {
  return new Date(at).toLocaleDateString('en-CA');
}

export function registerCellBalancingMessage(
  message: BuildMessageFn,
  source: CellBalancingSource,
): void {
  message<CellBalancingData>(
    {
      // Never sent and never matched: this message is computed, not requested.
      refreshDataPayload: '',
      isMessage: () => false,
      publishPath: 'cellBalancing',
      // A derived message has no fields, so this is what declares the shape it
      // publishes — which is how the discovery-state-topic invariant knows the
      // advertised paths are backed by something.
      defaultState: { cellBalancing: {} },
      getAdditionalDeviceInfo: () => ({}),
      pollInterval: 60000,
      controlsDeviceAvailability: false,
      polled: false,
      enabled: process.env.CELL_BALANCING_DIAGNOSTICS === 'true',
      derive: ({ stateByPath, deviceType, deviceId, at, monotonicAt }) => {
        const key = `${deviceType}:${deviceId}`;

        // One new cell reading is one sample. Without this the derivation would
        // run for every inbound message and republish unchanged values.
        const timestamp = stateByPath[source.cellPath]?.timestamp;
        if (timestamp == null || lastCellTimestamps.get(key) === timestamp) {
          return undefined;
        }
        lastCellTimestamps.set(key, timestamp);

        const sample = source.extract(stateByPath, { at, monotonicAt });
        if (sample == null) {
          return undefined;
        }
        const stats = computeCellStats(sample.cellsMv);
        if (stats == null) {
          return undefined;
        }

        const previousState = stateFor(key, deviceType, deviceId);
        const { state, cycle } = advanceBalancingState(previousState, sample, localDateOf(at));
        states.set(key, state);

        saveRecord(
          deviceType,
          deviceId,
          {
            schemaVersion: PERSIST_SCHEMA_VERSION,
            cycles: state.cycles,
            msAboveThreshold: state.msAboveThreshold,
            msAboveHighThreshold: state.msAboveHighThreshold,
            localDate: state.localDate,
            minSocPct: state.minSocPct,
            savedAt: new Date(at).toISOString(),
          },
          // A completed cycle is the thing worth keeping; the running counters
          // can wait for the throttle.
          { immediate: cycle != null },
        );

        const lastCycle = state.cycles[state.cycles.length - 1];
        return {
          cellBalancing: {
            spreadMv: stats.spreadMv,
            sigmaMv: stats.sigmaMv,
            meanMv: stats.meanMv,
            normalisedDeviations: stats.normalisedDeviations,
            driftMvPerHour: computeDrift(state.driftPoints),
            balanceConditionsMet:
              sample.chargingIn === true && stats.maxMv >= CELL_BALANCE_THRESHOLD_MV,
            minutesAboveThreshold: state.msAboveThreshold / 60000,
            minutesAboveHighThreshold: state.msAboveHighThreshold / 60000,
            sessionMinutes: state.sessionMs / 60000,
            crossingSpreadMv: state.crossing?.spreadMv,
            crossingSigmaMv: state.crossing?.sigmaMv,
            restedSpreadMv: state.rested?.spreadMv,
            restedSigmaMv: state.rested?.sigmaMv,
            lastCycleEndedAt: lastCycle?.endedAt,
            cycleCount: state.cycles.length,
          },
        };
      },
    },
    ({ advertise }) => {
      advertise(
        ['cellBalancing', 'spreadMv'],
        sensorComponent<number>({
          id: 'cell_spread',
          name: 'Cell Spread',
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
        }),
      );
      advertise(
        ['cellBalancing', 'sigmaMv'],
        sensorComponent<number>({
          id: 'cell_spread_stddev',
          name: 'Cell Voltage Standard Deviation',
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
        }),
      );
      advertise(
        ['cellBalancing', 'meanMv'],
        sensorComponent<number>({
          id: 'cell_mean_voltage',
          name: 'Mean Cell Voltage',
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
        }),
      );
      advertise(
        ['cellBalancing', 'driftMvPerHour'],
        sensorComponent<number>({
          id: 'cell_mean_voltage_drift',
          name: 'Mean Cell Voltage Drift',
          unit_of_measurement: 'mV/h',
          state_class: 'measurement',
          icon: 'mdi:trending-down',
        }),
      );
      advertise(
        ['cellBalancing', 'balanceConditionsMet'],
        binarySensorComponent({
          id: 'balance_conditions_met',
          name: 'Balance Conditions Met',
          icon: 'mdi:scale-balance',
        }),
      );
      advertise(
        ['cellBalancing', 'minutesAboveThreshold'],
        sensorComponent<number>({
          id: 'minutes_above_balance_threshold',
          name: `Minutes Above ${CELL_BALANCE_THRESHOLD_MV} mV Today`,
          unit_of_measurement: 'min',
          state_class: 'measurement',
          icon: 'mdi:timer-outline',
        }),
      );
      advertise(
        ['cellBalancing', 'minutesAboveHighThreshold'],
        sensorComponent<number>({
          id: 'minutes_above_high_balance_threshold',
          name: `Minutes Above ${CELL_BALANCE_HIGH_THRESHOLD_MV} mV Today`,
          unit_of_measurement: 'min',
          state_class: 'measurement',
          icon: 'mdi:timer-outline',
        }),
      );
      advertise(
        ['cellBalancing', 'sessionMinutes'],
        sensorComponent<number>({
          id: 'balance_session_minutes',
          name: 'Balance Session Duration',
          unit_of_measurement: 'min',
          state_class: 'measurement',
          icon: 'mdi:timer-play-outline',
          enabled_by_default: false,
        }),
      );

      // Cross-cycle values only mean anything if they survive a restart, so
      // they are advertised only when there is somewhere durable to store them.
      // This must stay a predicate rather than a captured constant: discovery
      // calls it on every publish, whereas anything read at import time would
      // be pinned to whatever was true before the probe ran.
      const withPersistence = { enabled: () => isPersistenceAvailable() };

      advertise(
        ['cellBalancing', 'crossingSpreadMv'],
        sensorComponent<number>({
          id: 'cell_spread_at_crossing',
          name: `Cell Spread at ${CELL_KNEE_CROSSING_MV} mV`,
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
        }),
        withPersistence,
      );
      advertise(
        ['cellBalancing', 'crossingSigmaMv'],
        sensorComponent<number>({
          id: 'cell_stddev_at_crossing',
          name: `Cell Standard Deviation at ${CELL_KNEE_CROSSING_MV} mV`,
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
        withPersistence,
      );
      advertise(
        ['cellBalancing', 'restedSpreadMv'],
        sensorComponent<number>({
          id: 'rested_cell_spread',
          name: 'Rested Cell Spread',
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
        }),
        withPersistence,
      );
      advertise(
        ['cellBalancing', 'restedSigmaMv'],
        sensorComponent<number>({
          id: 'rested_cell_stddev',
          name: 'Rested Cell Standard Deviation',
          device_class: 'voltage',
          unit_of_measurement: 'mV',
          state_class: 'measurement',
          enabled_by_default: false,
        }),
        withPersistence,
      );
      advertise(
        ['cellBalancing', 'lastCycleEndedAt'],
        sensorComponent<string>({
          id: 'last_charge_cycle',
          name: 'Last Charge Cycle',
          device_class: 'timestamp',
          icon: 'mdi:calendar-clock',
          enabled_by_default: false,
        }),
        withPersistence,
      );
    },
  );
}
