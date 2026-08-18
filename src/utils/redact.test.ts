import { redactSecrets, redactUrlCredentials } from './redact.js';

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
});
