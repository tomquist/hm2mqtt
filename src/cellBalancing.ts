import {
  BALANCE_SESSION_END_GRACE_MS,
  CELL_BALANCE_HIGH_THRESHOLD_MV,
  CELL_BALANCE_THRESHOLD_MV,
  CELL_KNEE_CROSSING_MV,
  CELL_KNEE_REARM_HYSTERESIS_MV,
  CELL_PLAUSIBLE_MAX_MV,
  CELL_PLAUSIBLE_MIN_MV,
  CELL_SAMPLE_MAX_GAP_MS,
  CYCLE_HISTORY_LENGTH,
  DRIFT_CURRENT_GATE_A,
  DRIFT_MAX_RESIDUAL_MV,
  DRIFT_MIN_SAMPLES,
  DRIFT_WINDOW_MS,
  LATCH_MEDIAN_SAMPLES,
  REST_CURRENT_MAX_A,
  REST_LATCH_DELAY_MS,
} from './constants.js';

/**
 * Cell balancing diagnostics.
 *
 * The problem this addresses: at 100% state of charge with no export the MPPT
 * disconnects and the unit's own electronics drain the pack. Every cell slides
 * equally out of the steep top of the LFP curve into the flat plateau, so the
 * max-minus-min spread collapses from tens of millivolts to one or two — with no
 * change whatsoever in the cells' relative state of charge. It looks exactly
 * like successful balancing and is nothing of the sort.
 *
 * Everything here is inference from voltage and current. No device in this
 * project reports whether its balancer is actually switched on.
 */

/**
 * One observation of a pack, normalised across device families: cell voltages
 * always in millivolts, current always in amps and signed positive for charge.
 */
export interface CellSample {
  cellsMv: number[];
  /** Undefined when the family gives us nothing to infer it from. */
  chargingIn?: boolean;
  socPct?: number;
  packCurrentA?: number;
  tempC?: number;
  /** Wall clock, for stamping records only. */
  at: number;
  /**
   * Monotonic clock, for measuring durations. A Pi without a real-time clock
   * jumps when NTP first syncs, which would otherwise produce negative or
   * absurd session lengths.
   */
  monotonicAt: number;
  /**
   * Age of the oldest cross-message input in this sample. On B2500 the current
   * and charging flag come from a different message than the cell voltages, so
   * they can be a poll interval old — worst exactly at the top of charge, where
   * current is collapsing fastest.
   */
  staleMs: number;
}

/** Per-publishPath device state, as held by DeviceManager. */
export type StateByPath = Record<string, any>;

export interface SampleClock {
  /** Wall clock, for stamps. */
  at: number;
  /** Monotonic clock, for durations. */
  monotonicAt: number;
}

function timestampMs(state: any): number | undefined {
  const parsed = state?.timestamp != null ? Date.parse(state.timestamp) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * How far behind the cell reading the supporting inputs are. Anything sourced
 * from another message can be a whole poll interval old, which matters most at
 * the top of charge where the current is collapsing fastest.
 */
function stalenessMs(cellState: any, supporting: any[]): number {
  const cellTs = timestampMs(cellState);
  if (cellTs == null) {
    return 0;
  }
  return supporting.reduce((worst, state) => {
    const ts = timestampMs(state);
    return ts == null ? worst : Math.max(worst, Math.abs(cellTs - ts));
  }, 0);
}

/**
 * B2500. The worst case of the two: cell voltages, charging state and pack
 * current live in three different messages, and only the V2 reports a current
 * at all.
 */
export function extractB2500Sample(
  stateByPath: StateByPath,
  clock: SampleClock,
): CellSample | undefined {
  const cellState = stateByPath['cells'];
  const cells = cellState?.cellVoltage?.host?.cells;
  if (!Array.isArray(cells)) {
    return undefined;
  }

  const data = stateByPath['data'];
  const extra = stateByPath['extraBatteryData'];

  // Prefer the per-pack status flag; fall back to the solar input state on
  // firmware older than 212.17, which does not report l0/l1 at all.
  const packCharging = data?.packStatus?.host?.charging;
  const solarCharging =
    data?.solarInputStatus?.input1Charging === true ||
    data?.solarInputStatus?.input2Charging === true;
  const chargingIn =
    packCharging != null
      ? packCharging
      : data?.solarInputStatus != null
        ? solarCharging
        : undefined;

  return {
    // State is in volts here, unlike Venus.
    cellsMv: cells.map((v: unknown) => (typeof v === 'number' ? v * 1000 : NaN)),
    chargingIn,
    socPct: data?.batteryPercentage,
    packCurrentA: extra?.batteryData?.host?.current,
    tempC: data?.temperature?.max,
    at: clock.at,
    monotonicAt: clock.monotonicAt,
    staleMs: stalenessMs(cellState, [data, extra]),
  };
}

/**
 * Venus. Cell voltages, pack current, temperature and state of charge all
 * arrive in the same cd=14 payload, so the sample is internally consistent and
 * carries no staleness at all.
 */
export function extractVenusSample(
  stateByPath: StateByPath,
  clock: SampleClock,
): CellSample | undefined {
  // The `bms` publishPath nests its scalar fields under a further `bms` key,
  // alongside the `cells` block.
  const bmsState = stateByPath['bms'];
  const bms = bmsState?.bms;
  const cellsMv = bmsState?.cells?.voltages;
  if (!Array.isArray(cellsMv)) {
    return undefined;
  }

  // `b_cur` is published as milliamps by the BMS sensor, but that label is
  // almost certainly wrong: -72 while discharging at night would be 3.7 W on a
  // 51 V pack. Read as deci-amps it is -7.2 A, an ordinary night discharge, and
  // Jupiter's identical key already uses that scale. Correcting the shipped
  // sensor is a user-visible change and is handled separately; the diagnostics
  // use the scale that makes physical sense.
  const packCurrentA = typeof bms?.current === 'number' ? bms.current / 10 : undefined;

  const temperatures = Array.isArray(bmsState?.cells?.temperatures)
    ? bmsState.cells.temperatures.filter((t: unknown): t is number => typeof t === 'number')
    : [];

  return {
    cellsMv,
    // Same message as the cells, so this cannot lag them — unlike the working
    // status in the runtime message, which can be a poll interval behind.
    chargingIn: packCurrentA != null ? packCurrentA > 0.2 : undefined,
    socPct: bms?.soc,
    packCurrentA,
    tempC: temperatures.length > 0 ? Math.max(...temperatures) : undefined,
    at: clock.at,
    monotonicAt: clock.monotonicAt,
    staleMs: 0,
  };
}

export interface CellStats {
  count: number;
  minMv: number;
  maxMv: number;
  meanMv: number;
  spreadMv: number;
  sigmaMv: number;
  deviationsMv: number[];
  /**
   * Each cell's deviation as a fraction of the spread. This is the direct test
   * for the artifact described above: a pack sliding down the curve keeps these
   * constant while the spread collapses, whereas balancing moves the outlier's
   * share toward zero.
   */
  normalisedDeviations: number[];
}

export interface CycleRecord {
  endedAt: string;
  /** Spread at the fixed mean-voltage crossing during the preceding charge. */
  crossingSpreadMv?: number;
  crossingSigmaMv?: number;
  crossingCurrentA?: number;
  crossingTempC?: number;
  crossingNormalisedDeviations?: number[];
  /** Spread after an hour at rest — no IR contamination at all. */
  restedSpreadMv?: number;
  restedSigmaMv?: number;
  restedTempC?: number;
  restedNormalisedDeviations?: number[];
  minutesAboveThreshold: number;
  minutesAboveHighThreshold: number;
  minSocPct?: number;
}

interface DriftPoint {
  t: number;
  meanMv: number;
  currentA?: number;
  cellCount: number;
}

interface LatchCandidate {
  spreadMv: number;
  sigmaMv: number;
  meanMv: number;
  tempC?: number;
  currentA?: number;
  normalisedDeviations: number[];
}

export interface BalancingState {
  driftPoints: DriftPoint[];
  restCandidates: LatchCandidate[];

  lastMonotonicAt?: number;
  lastMeanMv?: number;
  lastCandidate?: LatchCandidate;

  msAboveThreshold: number;
  msAboveHighThreshold: number;
  localDate?: string;

  sessionMs: number;
  sessionActive: boolean;
  conditionsUnmetSinceMonotonic?: number;

  crossingArmed: boolean;
  pendingCrossing?: LatchCandidate;
  crossing?: LatchCandidate;

  restingSinceMonotonic?: number;
  restedLatched: boolean;
  rested?: LatchCandidate;

  minSocPct?: number;
  cycles: CycleRecord[];
}

export function initialBalancingState(): BalancingState {
  return {
    driftPoints: [],
    restCandidates: [],
    msAboveThreshold: 0,
    msAboveHighThreshold: 0,
    sessionMs: 0,
    sessionActive: false,
    crossingArmed: true,
    restedLatched: false,
    cycles: [],
  };
}

/**
 * Reject readings that cannot be a real cell. Empty slots on short packs read
 * exactly 0, and this project has a long history of devices emitting nonsense
 * values under load; one of those landing at a latch instant would be recorded
 * permanently.
 */
export function plausibleCells(cellsMv: number[]): number[] {
  return cellsMv.filter(
    mv => Number.isFinite(mv) && mv >= CELL_PLAUSIBLE_MIN_MV && mv <= CELL_PLAUSIBLE_MAX_MV,
  );
}

export function computeCellStats(rawCellsMv: number[]): CellStats | undefined {
  const cellsMv = plausibleCells(rawCellsMv);
  if (cellsMv.length < 2) {
    return undefined;
  }

  const count = cellsMv.length;
  const minMv = Math.min(...cellsMv);
  const maxMv = Math.max(...cellsMv);
  const meanMv = cellsMv.reduce((a, b) => a + b, 0) / count;
  const spreadMv = maxMv - minMv;
  const variance = cellsMv.reduce((acc, mv) => acc + (mv - meanMv) ** 2, 0) / count;
  const deviationsMv = cellsMv.map(mv => mv - meanMv);

  return {
    count,
    minMv,
    maxMv,
    meanMv,
    spreadMv,
    sigmaMv: Math.sqrt(variance),
    deviationsMv,
    // A dead-flat pack has no meaningful shape to normalise; report zeroes
    // rather than dividing by zero.
    normalisedDeviations: deviationsMv.map(d => (spreadMv > 0 ? d / spreadMv : 0)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function leastSquaresSlope(points: DriftPoint[]): { slope: number; residualRms: number } {
  const n = points.length;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanY = points.reduce((a, p) => a + p.meanMv, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.t - meanT) ** 2;
    sxy += (p.t - meanT) * (p.meanMv - meanY);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanT;
  const residualRms = Math.sqrt(
    points.reduce((a, p) => a + (p.meanMv - (slope * p.t + intercept)) ** 2, 0) / n,
  );
  return { slope, residualRms };
}

/**
 * Rate of change of the mean cell voltage, in mV/h.
 *
 * Negative while the electronics are eating the pack, flat while it is genuinely
 * being held at the top of charge — which is the whole point. Returns undefined
 * rather than a contaminated number whenever the window cannot support a slope.
 */
export function computeDrift(points: DriftPoint[]): number | undefined {
  if (points.length < DRIFT_MIN_SAMPLES) {
    return undefined;
  }

  // A changing cell count moves the mean by (mean - v_i)/(n-1) on its own — up
  // to a few mV, which dwarfs the signal. Discard rather than explain it away.
  if (points.some(p => p.cellCount !== points[0].cellCount)) {
    return undefined;
  }

  const span = points[points.length - 1].t - points[0].t;
  if (span < DRIFT_WINDOW_MS / 2) {
    return undefined;
  }

  // Only points that actually carry a current can be gated. Where no family
  // reports one at all (B2500 V1) this is vacuously true and the slope is
  // published ungated — still better than nothing there.
  if (points.some(p => p.currentA != null && Math.abs(p.currentA) > DRIFT_CURRENT_GATE_A)) {
    return undefined;
  }

  let fit = leastSquaresSlope(points);

  // A brief load step between two samples is invisible to the current gate but
  // obvious in the residuals, and it barely moves a fit this size once dropped.
  if (fit.residualRms > 0) {
    const meanT = points.reduce((a, p) => a + p.t, 0) / points.length;
    const meanY = points.reduce((a, p) => a + p.meanMv, 0) / points.length;
    const intercept = meanY - fit.slope * meanT;
    const worst = points.reduce(
      (acc, p) => {
        const residual = Math.abs(p.meanMv - (fit.slope * p.t + intercept));
        return residual > acc.residual ? { p, residual } : acc;
      },
      { p: points[0], residual: 0 },
    );

    if (worst.residual > 3 * fit.residualRms && points.length - 1 >= DRIFT_MIN_SAMPLES) {
      fit = leastSquaresSlope(points.filter(p => p !== worst.p));
    }
  }

  // Not moving linearly — usually the post-charge relaxation transient, where a
  // single slope would be meaningless.
  if (fit.residualRms > DRIFT_MAX_RESIDUAL_MV) {
    return undefined;
  }

  return fit.slope * 3600000;
}

function toCandidate(stats: CellStats, sample: CellSample): LatchCandidate {
  return {
    spreadMv: stats.spreadMv,
    sigmaMv: stats.sigmaMv,
    meanMv: stats.meanMv,
    tempC: sample.tempC,
    currentA: sample.packCurrentA,
    normalisedDeviations: stats.normalisedDeviations,
  };
}

/**
 * Interpolate between the two samples bracketing the crossing, so the latched
 * spread is the one at exactly `CELL_KNEE_CROSSING_MV` rather than at whichever
 * side of it the poll happened to land on. This is what makes the sampling rate
 * affect only interpolation error and never which point is measured.
 */
function interpolateCandidate(
  below: LatchCandidate,
  above: LatchCandidate,
  targetMv: number,
): LatchCandidate {
  const span = above.meanMv - below.meanMv;
  const f = span === 0 ? 0 : (targetMv - below.meanMv) / span;
  const lerp = (a: number, b: number) => a + f * (b - a);
  return {
    meanMv: targetMv,
    spreadMv: lerp(below.spreadMv, above.spreadMv),
    sigmaMv: lerp(below.sigmaMv, above.sigmaMv),
    tempC: above.tempC ?? below.tempC,
    currentA: above.currentA ?? below.currentA,
    // The shape is taken from the sample above the crossing rather than blended:
    // averaging two normalised vectors of possibly different length is not
    // meaningful, and the upper sample is the one at the higher voltage.
    normalisedDeviations: above.normalisedDeviations,
  };
}

function medianCandidate(candidates: LatchCandidate[]): LatchCandidate {
  const last = candidates[candidates.length - 1];
  return {
    ...last,
    spreadMv: median(candidates.map(c => c.spreadMv)),
    sigmaMv: median(candidates.map(c => c.sigmaMv)),
    meanMv: median(candidates.map(c => c.meanMv)),
  };
}

/**
 * Fold one sample into the running state, returning the new state and a
 * completed charge cycle if this sample finished one.
 *
 * Pure: all clock values arrive on the sample, so the whole state machine is
 * testable without faking timers.
 */
export function advanceBalancingState(
  state: BalancingState,
  sample: CellSample,
  localDate: string,
): { state: BalancingState; cycle?: CycleRecord } {
  const stats = computeCellStats(sample.cellsMv);
  if (!stats) {
    return { state };
  }

  const next: BalancingState = {
    ...state,
    driftPoints: [...state.driftPoints],
    restCandidates: [...state.restCandidates],
    cycles: state.cycles,
  };

  // Time only accrues between two samples we actually saw. A longer gap means
  // the device was unreachable, and we have no idea what it did meanwhile.
  const rawDelta =
    state.lastMonotonicAt != null ? sample.monotonicAt - state.lastMonotonicAt : undefined;
  const observedGap = rawDelta != null && rawDelta >= 0 && rawDelta <= CELL_SAMPLE_MAX_GAP_MS;
  const deltaMs = observedGap ? (rawDelta as number) : 0;

  if (!observedGap && state.lastMonotonicAt != null) {
    // Unobserved gap: drop everything whose meaning depends on continuity.
    next.driftPoints = [];
    next.restCandidates = [];
    next.sessionActive = false;
    next.sessionMs = 0;
    next.restingSinceMonotonic = undefined;
    next.pendingCrossing = undefined;
  }

  if (state.localDate !== localDate) {
    next.localDate = localDate;
    next.msAboveThreshold = 0;
    next.msAboveHighThreshold = 0;
  }

  const charging = sample.chargingIn === true;
  const conditionsMet = charging && stats.maxMv >= CELL_BALANCE_THRESHOLD_MV;

  // The interval between two samples is credited according to the state at the
  // end of it. Either end is defensible; the error is bounded by one poll
  // interval, which is negligible against sessions measured in hours.

  if (conditionsMet) {
    next.msAboveThreshold += deltaMs;
    if (stats.maxMv >= CELL_BALANCE_HIGH_THRESHOLD_MV) {
      next.msAboveHighThreshold += deltaMs;
    }
    next.sessionMs = next.sessionActive ? next.sessionMs + deltaMs : 0;
    next.sessionActive = true;
    next.conditionsUnmetSinceMonotonic = undefined;
  } else if (next.sessionActive) {
    next.conditionsUnmetSinceMonotonic ??= sample.monotonicAt;
    if (sample.monotonicAt - next.conditionsUnmetSinceMonotonic >= BALANCE_SESSION_END_GRACE_MS) {
      next.sessionActive = false;
      next.conditionsUnmetSinceMonotonic = undefined;
    }
  }

  next.driftPoints.push({
    t: sample.monotonicAt,
    meanMv: stats.meanMv,
    currentA: sample.packCurrentA,
    cellCount: stats.count,
  });
  next.driftPoints = next.driftPoints.filter(p => sample.monotonicAt - p.t <= DRIFT_WINDOW_MS);

  if (sample.socPct != null) {
    next.minSocPct =
      next.minSocPct == null ? sample.socPct : Math.min(next.minSocPct, sample.socPct);
  }

  // Crossing latch: interpolate the spread at a fixed mean voltage on the way
  // up. Confirmed by the following sample so a single spike cannot latch.
  const previousMean = state.lastMeanMv;
  const candidate = toCandidate(stats, sample);
  if (
    next.crossingArmed &&
    charging &&
    previousMean != null &&
    state.lastCandidate != null &&
    previousMean < CELL_KNEE_CROSSING_MV &&
    stats.meanMv >= CELL_KNEE_CROSSING_MV &&
    observedGap &&
    sample.staleMs <= CELL_SAMPLE_MAX_GAP_MS
  ) {
    next.pendingCrossing = interpolateCandidate(
      state.lastCandidate,
      candidate,
      CELL_KNEE_CROSSING_MV,
    );
  } else if (next.pendingCrossing && stats.meanMv >= CELL_KNEE_CROSSING_MV) {
    next.crossing = next.pendingCrossing;
    next.pendingCrossing = undefined;
    next.crossingArmed = false;
  } else if (next.pendingCrossing) {
    next.pendingCrossing = undefined;
  }

  if (stats.meanMv < CELL_KNEE_CROSSING_MV - CELL_KNEE_REARM_HYSTERESIS_MV) {
    next.crossingArmed = true;
  }

  // Rested latch: an hour after charging stopped, with the pack actually idle.
  const resting =
    !charging &&
    (sample.packCurrentA == null || Math.abs(sample.packCurrentA) <= REST_CURRENT_MAX_A);
  if (resting) {
    next.restingSinceMonotonic ??= sample.monotonicAt;
    next.restCandidates.push(candidate);
    if (next.restCandidates.length > LATCH_MEDIAN_SAMPLES) {
      next.restCandidates.shift();
    }
  } else {
    next.restingSinceMonotonic = undefined;
    next.restCandidates = [];
    if (charging) {
      next.restedLatched = false;
    }
  }

  let cycle: CycleRecord | undefined;
  if (
    !next.restedLatched &&
    next.restingSinceMonotonic != null &&
    sample.monotonicAt - next.restingSinceMonotonic >= REST_LATCH_DELAY_MS &&
    next.restCandidates.length >= LATCH_MEDIAN_SAMPLES
  ) {
    next.rested = medianCandidate(next.restCandidates);
    next.restedLatched = true;

    cycle = {
      endedAt: new Date(sample.at).toISOString(),
      crossingSpreadMv: next.crossing?.spreadMv,
      crossingSigmaMv: next.crossing?.sigmaMv,
      crossingCurrentA: next.crossing?.currentA,
      crossingTempC: next.crossing?.tempC,
      crossingNormalisedDeviations: next.crossing?.normalisedDeviations,
      restedSpreadMv: next.rested.spreadMv,
      restedSigmaMv: next.rested.sigmaMv,
      restedTempC: next.rested.tempC,
      restedNormalisedDeviations: next.rested.normalisedDeviations,
      minutesAboveThreshold: next.msAboveThreshold / 60000,
      minutesAboveHighThreshold: next.msAboveHighThreshold / 60000,
      minSocPct: next.minSocPct,
    };

    next.cycles = [...next.cycles, cycle].slice(-CYCLE_HISTORY_LENGTH);
    next.minSocPct = undefined;
  }

  next.lastMonotonicAt = sample.monotonicAt;
  next.lastMeanMv = stats.meanMv;
  next.lastCandidate = candidate;

  return { state: next, cycle };
}
