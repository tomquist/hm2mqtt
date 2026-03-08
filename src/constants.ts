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
