import { redactDeep, redactSecrets, redactUrlCredentials } from './redact.js';

describe('redactUrlCredentials', () => {
  it.each`
    input                                                       | expected
    ${'mqtt://user:secret@broker:1883'}                         | ${'mqtt://user:***@broker:1883'}
    ${'mqtts://user:secret@broker:8883/path'}                   | ${'mqtts://user:***@broker:8883/path'}
    ${'ws://user:secret@broker:9001'}                           | ${'ws://user:***@broker:9001'}
    ${'mqtt://user:se@cr:et@broker:1883'}                       | ${'mqtt://user:***@broker:1883'}
    ${'mqtt://:secret@broker:1883'}                             | ${'mqtt://:***@broker:1883'}
    ${'Connecting to mqtt://user:secret@broker:1883 with id x'} | ${'Connecting to mqtt://user:***@broker:1883 with id x'}
    ${'MQTT_BROKER_URL=mqtt://user:secret@broker:1883'}         | ${'MQTT_BROKER_URL=mqtt://user:***@broker:1883'}
    ${'a mqtt://a:1@h and mqtt://b:2@h'}                        | ${'a mqtt://a:***@h and mqtt://b:***@h'}
  `('masks the password in "$input"', ({ input, expected }) => {
    expect(redactUrlCredentials(input)).toBe(expected);
  });

  it.each`
    input                               | reason
    ${'mqtt://broker:1883'}             | ${'no credentials'}
    ${'mqtt://user@broker:1883'}        | ${'username only'}
    ${'mqtt://user:@broker:1883'}       | ${'empty password'}
    ${'homeassistant/HMA-1/device/abc'} | ${'not a URL'}
    ${''}                               | ${'empty string'}
  `('leaves "$input" untouched ($reason)', ({ input }) => {
    expect(redactUrlCredentials(input)).toBe(input);
  });

  it('is idempotent', () => {
    const once = redactUrlCredentials('mqtt://user:secret@broker:1883');

    expect(redactUrlCredentials(once)).toBe(once);
  });
});

describe('redactDeep', () => {
  it('masks credentials in nested strings without touching the input', () => {
    const input = {
      brokerUrl: 'mqtt://user:secret@broker:1883',
      nested: { proxy: { mainBrokerUrl: 'mqtt://user:secret@broker:1883' } },
      urls: ['mqtt://user:secret@broker:1883', 'mqtt://broker:1883'],
      port: 1883,
      enabled: true,
      missing: null,
    };

    expect(redactDeep(input)).toEqual({
      brokerUrl: 'mqtt://user:***@broker:1883',
      nested: { proxy: { mainBrokerUrl: 'mqtt://user:***@broker:1883' } },
      urls: ['mqtt://user:***@broker:1883', 'mqtt://broker:1883'],
      port: 1883,
      enabled: true,
      missing: null,
    });
    expect(input.brokerUrl).toBe('mqtt://user:secret@broker:1883');
  });

  it('passes non-plain objects through untouched', () => {
    const error = new Error('connect failed for mqtt://user:secret@broker:1883');

    expect(redactDeep(error)).toBe(error);
  });

  it('masks password fields, at the top level and nested', () => {
    expect(redactDeep({ password: 'secret', nested: { mainBrokerPassword: 'secret' } })).toEqual({
      password: '***',
      nested: { mainBrokerPassword: '***' },
    });
  });

  it('leaves an empty or absent password alone', () => {
    expect(redactDeep({ password: '', otherPassword: null })).toEqual({
      password: '',
      otherPassword: null,
    });
  });

  it('replaces a cycle with a marker instead of passing it through', () => {
    const cyclic: Record<string, unknown> = { brokerUrl: 'mqtt://user:secret@broker:1883' };
    cyclic.self = cyclic;

    const redacted = redactDeep(cyclic) as Record<string, unknown>;

    expect(redacted.brokerUrl).toBe('mqtt://user:***@broker:1883');
    expect(redacted.self).toBe('[circular]');
  });

  it('keeps redacting the same object in two places of the same tree', () => {
    const shared = { brokerUrl: 'mqtt://user:secret@broker:1883' };

    expect(redactDeep({ first: shared, second: shared })).toEqual({
      first: { brokerUrl: 'mqtt://user:***@broker:1883' },
      second: { brokerUrl: 'mqtt://user:***@broker:1883' },
    });
  });

  it('never lets a value deeper than it walks through unredacted', () => {
    let deep: Record<string, unknown> = { brokerUrl: 'mqtt://user:secret@broker:1883' };
    for (let i = 0; i < 40; i++) {
      deep = { nested: deep };
    }

    expect(JSON.stringify(redactDeep(deep))).not.toContain('secret');
  });
});

describe('redactSecrets', () => {
  it('masks passwords and credentials embedded in URLs', () => {
    const config = {
      brokerUrl: 'mqtt://user:secret@broker:1883',
      username: 'user',
      password: 'secret',
      mainBrokerPassword: 'secret',
      topicPrefix: 'hm2mqtt',
    };

    expect(JSON.parse(JSON.stringify(config, redactSecrets))).toEqual({
      brokerUrl: 'mqtt://user:***@broker:1883',
      username: 'user',
      password: '***',
      mainBrokerPassword: '***',
      topicPrefix: 'hm2mqtt',
    });
  });

  it('leaves an empty password alone', () => {
    expect(redactSecrets('password', '')).toBe('');
  });
});
