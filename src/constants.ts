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
