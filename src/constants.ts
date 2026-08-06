/**
 * Default base topic used for publishing and subscribing to hm2mqtt specific
 * messages. This value is used when `MQTT_TOPIC_PREFIX` is not provided.
 */
export const DEFAULT_TOPIC_PREFIX = 'hm2mqtt';

/**
 * Default Home Assistant MQTT discovery topic prefix used for publishing
 * auto-discovery config payloads. This value is used when
 * `AUTODISCOVERY_TOPIC_PREFIX` is not provided.
 */
export const DEFAULT_AUTODISCOVERY_TOPIC_PREFIX = 'homeassistant';

/**
 * Lower bound for how often the CT002 per-phase charge/discharge counters are
 * polled. They are cumulative and move slowly, so there is no point requesting
 * them at the runtime polling interval. A shorter `MQTT_POLLING_INTERVAL` does
 * not lower this floor; a longer one wins.
 */
export const MIN_PHASE_ENERGY_POLL_INTERVAL_MS = 300000;

/**
 * How long a single shutdown step may take before it is abandoned. Docker's
 * default grace period before SIGKILL is 10s, so both steps together have to
 * finish well inside it for the clean shutdown to be worth anything.
 */
export const SHUTDOWN_STEP_TIMEOUT_MS = 3000;

/**
 * Cell voltage above which a passive balancer is assumed to be able to do
 * something. Typical LFP balance-start thresholds sit at 3.40-3.45 V, well up
 * the steep part of the curve; these packs charge to roughly 3.55 V/cell.
 */
export const CELL_BALANCE_THRESHOLD_MV = 3400;

/**
 * Second, higher threshold. At 3.40 V the OCV-SoC slope is only ~10 mV per
 * percent, so an hour of bleed moves a cell barely half a millivolt; at 3.50 V
 * the same charge moves it several times further. Time spent above the two
 * thresholds is reported separately because an hour at each is not equivalent.
 */
export const CELL_BALANCE_HIGH_THRESHOLD_MV = 3500;

/**
 * Mean cell voltage at which the comparable end-of-charge spread is sampled.
 * Latching at a fixed voltage rather than at charge termination gives an
 * iso-SoC point on the steep part of the curve: it does not move with when
 * charging happens to stop, nor with the poll phase.
 */
export const CELL_KNEE_CROSSING_MV = 3450;

/** Re-arm the crossing latch once the pack has fallen this far back below it. */
export const CELL_KNEE_REARM_HYSTERESIS_MV = 50;

/** Readings outside this range are rejected before entering any statistic. */
export const CELL_PLAUSIBLE_MIN_MV = 2000;
export const CELL_PLAUSIBLE_MAX_MV = 4000;

/**
 * Window for the mean-cell-voltage drift regression. Widening the window beats
 * shortening the poll interval: at 60 s sampling the slope error is ~0.26 mV/h
 * over 15 minutes but ~0.09 mV/h over 30, which matches 5 s sampling over 15
 * minutes at a twelfth of the traffic.
 */
export const DRIFT_WINDOW_MS = 1800000;

/** Minimum samples before a slope is reported at all. */
export const DRIFT_MIN_SAMPLES = 5;

/**
 * Drift is suppressed when the pack current moved beyond this. A step from
 * 0.4 A to 6 A shifts every cell about 3 mV by IR alone — around 12 mV/h of
 * slope, several times the real signal. In the situation this feature is for
 * (full, MPPT disconnected, no export) the pack is at rest, so the gate is
 * satisfied exactly when it matters.
 */
export const DRIFT_CURRENT_GATE_A = 1;

/**
 * Largest RMS residual a drift window may have. Above this the mean is not
 * moving linearly — typically the post-charge relaxation transient — and a
 * single slope would misrepresent it.
 */
export const DRIFT_MAX_RESIDUAL_MV = 1.5;

/** Below this magnitude a drift reading is indistinguishable from zero. */
export const DRIFT_NOISE_FLOOR_MV_PER_H = 2;

/**
 * A gap longer than this between two cell samples is treated as an observation
 * gap rather than elapsed time. Without it a device that drops off the network
 * mid-session comes back and books the entire outage as balancing.
 */
export const CELL_SAMPLE_MAX_GAP_MS = 240000;

/** Conditions must stay unmet this long before a balancing session is closed. */
export const BALANCE_SESSION_END_GRACE_MS = 600000;

/** How long the pack must have been resting before the rested spread is taken. */
export const REST_LATCH_DELAY_MS = 3600000;

/** Pack current below which the pack counts as resting. */
export const REST_CURRENT_MAX_A = 0.5;

/** Samples used for the median at a latch, so one bad reading cannot be recorded. */
export const LATCH_MEDIAN_SAMPLES = 5;

/** Charge cycles kept in the persisted history. */
export const CYCLE_HISTORY_LENGTH = 20;

/**
 * Least often the running counters are written to disk. Completed charge cycles
 * bypass this and are written straight away; the counters change on every poll,
 * and most add-on installs run from an SD card.
 */
export const PERSIST_THROTTLE_MS = 900000;

/** Bumped whenever the stored record's shape changes incompatibly. */
export const PERSIST_SCHEMA_VERSION = 1;
