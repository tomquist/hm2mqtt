import {
  communicationStateTopic,
  generateCommunicationDiscovery,
} from './communicationDiscovery.js';

describe('Communication discovery', () => {
  const device = {
    deviceType: 'HMJ-2',
    deviceId: 'test-device',
  };

  const publishTopic = 'hm2mqtt/device/test-device';

  function generate(enabled = true) {
    return generateCommunicationDiscovery(
      device,
      publishTopic,
      'hm2mqtt',
      'homeassistant',
      enabled,
    );
  }

  test('generates five diagnostic entities', () => {
    expect(generate()).toHaveLength(5);
  });

  test('uses a dedicated communication state topic', () => {
    expect(communicationStateTopic(publishTopic)).toBe(`${publishTopic}/communication`);

    for (const entry of generate()) {
      expect(entry.config?.state_topic).toBe(`${publishTopic}/communication`);
    }
  });

  test('classifies all entities as diagnostics', () => {
    for (const entry of generate()) {
      expect(entry.config?.entity_category).toBe('diagnostic');
      expect(entry.config?.enabled_by_default).toBe(false);
    }
  });

  test('uses only the bridge availability topic', () => {
    for (const entry of generate()) {
      expect(entry.config?.availability).toEqual([
        {
          topic: 'hm2mqtt/availability',
          payload_available: 'online',
          payload_not_available: 'offline',
        },
      ]);
    }
  });

  test('uses unique entity identifiers', () => {
    const ids = generate().map(entry => entry.config?.unique_id);

    expect(new Set(ids).size).toBe(5);
  });

  test('associates diagnostics with the existing device', () => {
    for (const entry of generate()) {
      expect(entry.config?.device.ids).toEqual(['hame_energy_test-device']);
    }
  });

  test('uses the timestamp device class for time sensors', () => {
    const timestamps = generate().filter(
      entry =>
        entry.config && 'device_class' in entry.config && entry.config.device_class === 'timestamp',
    );

    expect(timestamps).toHaveLength(2);
  });

  test('creates read-only entities', () => {
    for (const entry of generate()) {
      expect(entry.config).not.toHaveProperty('command_topic');
    }
  });

  test('generates discovery removal messages when disabled', () => {
    const enabled = generate(true);
    const disabled = generate(false);

    expect(disabled.map(entry => entry.topic)).toEqual(enabled.map(entry => entry.topic));

    expect(disabled.every(entry => entry.config === null)).toBe(true);
  });

  test('respects custom topic prefixes', () => {
    const entries = generateCommunicationDiscovery(
      device,
      'custom/state',
      'custom',
      'custom-discovery',
      true,
    );

    for (const entry of entries) {
      expect(entry.topic).toMatch(/^custom-discovery\/sensor\//);
      expect(entry.config?.state_topic).toBe('custom/state/communication');
      expect(entry.config?.availability[0].topic).toBe('custom/availability');
    }
  });
});
