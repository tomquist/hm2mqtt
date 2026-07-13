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

/** Default interval for polling detailed cell data, in seconds. */
export const DEFAULT_CELL_DATA_POLLING_INTERVAL_SECONDS = 15;

/** Smallest supported interval for polling detailed cell data, in seconds. */
export const MIN_CELL_DATA_POLLING_INTERVAL_SECONDS = 1;

/** Parse the cell-data polling interval from its seconds-based environment value. */
export function parseCellDataPollingInterval(value: string | undefined): number {
  const configuredSeconds = Number.parseInt(
    value || `${DEFAULT_CELL_DATA_POLLING_INTERVAL_SECONDS}`,
    10,
  );
  const seconds = Number.isNaN(configuredSeconds)
    ? DEFAULT_CELL_DATA_POLLING_INTERVAL_SECONDS
    : Math.max(configuredSeconds, MIN_CELL_DATA_POLLING_INTERVAL_SECONDS);
  return seconds * 1000;
}
