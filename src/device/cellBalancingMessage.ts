import { BuildMessageFn } from '../deviceDefinition.js';
import logger from '../logger.js';
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

let warnedAboutCellData = false;

/**
 * The diagnostics need their own flag *and* the cell data they are computed
 * from. Asking for one without the other is a configuration mistake that would
 * otherwise present as entities that never leave unknown, so say so once.
 */
function cellBalancingEnabled(): boolean {
  const requested = process.env.CELL_BALANCING_DIAGNOSTICS === 'true';
  const haveCellData = process.env.POLL_CELL_DATA === 'true';
  if (requested && !haveCellData && !warnedAboutCellData) {
    warnedAboutCellData = true;
    logger.warn(
      'Cell balancing diagnostics are enabled but cell data polling is not. ' +
        'Set POLL_CELL_DATA=true (add-on: "Enable Cell Data") — without it there ' +
        'are no cell readings to analyse, so no diagnostic entities are created.',
    );
  }
  return requested && haveCellData;
}

/** Test seam; production never needs to forget a device. */
export function resetCellBalancingState(): void {
  states.clear();
  lastCellTimestamps.clear();
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
  //
  // The latched values are restored, though. They are the whole reason the file
  // exists — leaving them out would send the very sensors that are gated on
  // durable storage to unknown on every restart, until the next full charge.
  const stored = loadRecord(deviceType, deviceId);
  if (stored != null) {
    state.cycles = stored.cycles;
    state.msAboveThreshold = stored.msAboveThreshold;
    state.msAboveHighThreshold = stored.msAboveHighThreshold;
    state.localDate = stored.localDate;
    state.minSocPct = stored.minSocPct;
    state.crossing = stored.crossing;
    state.rested = stored.rested;
    // A restored crossing belongs to a charge that already finished, so the
    // latch must not fire again for it.
    state.crossingArmed = stored.crossing == null;
    state.restedLatched = stored.rested != null;
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
      // Both flags are required. The diagnostics are computed from the cell
      // message, so with POLL_CELL_DATA off nothing is ever polled to feed them
      // and every entity would sit at unknown forever.
      enabled: cellBalancingEnabled(),
      derive: ({ stateByPath, deviceType, deviceId, at, monotonicAt }) => {
        const key = `${deviceType}:${deviceId}`;

        // One new cell reading is one sample. Without this the derivation would
        // run for every inbound message and republish unchanged values.
        const timestamp = stateByPath[source.cellPath]?.timestamp;
        if (timestamp == null || lastCellTimestamps.get(key) === timestamp) {
          return undefined;
        }

        const sample = source.extract(stateByPath, { at, monotonicAt });
        if (sample == null) {
          return undefined;
        }
        const stats = computeCellStats(sample.cellsMv);
        if (stats == null) {
          return undefined;
        }
        // Only now, once the reading turned out to be usable. Marking it
        // consumed any earlier would discard a sample whose other inputs are
        // still on their way, rather than reconsidering it on the next update.
        lastCellTimestamps.set(key, timestamp);

        const previousState = stateFor(key, deviceType, deviceId);
        const { state, cycle, conditionsMet } = advanceBalancingState(
          previousState,
          sample,
          localDateOf(at),
        );
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
            crossing: state.crossing,
            rested: state.rested,
            savedAt: new Date(at).toISOString(),
          },
          // A completed cycle is the thing worth keeping; the running counters
          // can wait for the throttle.
          { immediate: cycle != null },
        );

        const lastCycle = state.cycles[state.cycles.length - 1];
        // The full vector goes in the payload, but a graph needs a scalar: the
        // share owned by the highest cell is the one a passive balancer acts on.
        const highestShare = Math.max(...stats.normalisedDeviations);
        // Map back through `indices`: a dropped reading mid-pack shifts every
        // later position, so the array offset is not the cell number.
        const highestIndex = stats.indices[stats.normalisedDeviations.indexOf(highestShare)];

        return {
          cellBalancing: {
            spreadMv: stats.spreadMv,
            sigmaMv: stats.sigmaMv,
            meanMv: stats.meanMv,
            normalisedDeviations: stats.normalisedDeviations,
            highestCellSharePct: highestShare * 100,
            highestCell: highestIndex + 1,
            driftMvPerHour: computeDrift(state.driftPoints),
            balanceConditionsMet: conditionsMet,
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
      // The sharpest of the lot. The slide artifact leaves every cell's share of
      // the spread untouched while the spread itself collapses, so a falling
      // share is the one thing that cannot be explained by the pack drifting
      // down the curve.
      advertise(
        ['cellBalancing', 'highestCellSharePct'],
        sensorComponent<number>({
          id: 'highest_cell_share',
          name: 'Highest Cell Share of Spread',
          unit_of_measurement: '%',
          state_class: 'measurement',
          icon: 'mdi:chart-donut',
        }),
      );
      advertise(
        ['cellBalancing', 'highestCell'],
        sensorComponent<number>({
          id: 'highest_cell',
          name: 'Highest Cell',
          state_class: 'measurement',
          icon: 'mdi:battery-high',
          enabled_by_default: false,
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
