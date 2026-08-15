import './device/registry.js';
import {
  BaseDeviceData,
  getDeviceDefinition,
  getRegisteredDeviceTypes,
  MessageDefinition,
} from './deviceDefinition.js';

const COMMAND_TOPIC = 'hame_energy/HMA-1/control/test123/control';
const STATE_TOPIC = 'hame_energy/HMA-1/device/test123/data';

/** Keys every published payload carries, independent of the message definition. */
const BASE_KEYS: ReadonlyArray<keyof BaseDeviceData> = [
  'deviceType',
  'deviceId',
  'timestamp',
  'values',
];

function joinPath(keyPath: ReadonlyArray<string | number>): string {
  return keyPath.join('.');
}

/**
 * The paths a message can actually publish: the base keys, the message's default
 * state and every field the parser fills in.
 *
 * A derived message has no fields — its values come from `derive()` — so its
 * default state is what declares the shape it publishes. The paths themselves
 * are already type-checked against the message's state type at registration.
 */
function publishablePaths(message: MessageDefinition<BaseDeviceData>): string[] {
  return [
    ...BASE_KEYS,
    ...Object.keys(message.defaultState ?? {}),
    ...message.fields.map(field => joinPath(field.path as ReadonlyArray<string | number>)),
  ];
}

function isPublished(keyPath: string, publishable: string[]): boolean {
  return publishable.some(
    path => path === keyPath || keyPath.startsWith(`${path}.`) || path.startsWith(`${keyPath}.`),
  );
}

function statefulAdvertisements() {
  const result: Array<{
    deviceType: string;
    publishPath: string;
    keyPath: string;
    id: string;
    hasStateTopic: boolean;
  }> = [];
  for (const deviceType of getRegisteredDeviceTypes()) {
    const definition = getDeviceDefinition(deviceType);
    for (const message of definition?.messages ?? []) {
      for (const advertisement of message.advertisements) {
        const keyPath = advertisement.keyPath as ReadonlyArray<string | number>;
        if (keyPath.length === 0) {
          // Non-stateful component (e.g. a button)
          continue;
        }
        const config = advertisement.advertise({
          commandTopic: COMMAND_TOPIC,
          stateTopic: STATE_TOPIC,
          keyPath,
        });
        result.push({
          deviceType,
          publishPath: message.publishPath,
          keyPath: joinPath(keyPath),
          id: config.id,
          hasStateTopic: 'state_topic' in config && config.state_topic != null,
        });
      }
    }
  }
  return result;
}

describe('discovery state topics', () => {
  /**
   * Advertising a state topic for a value the device never reports makes Home
   * Assistant render the value template against every published payload and log
   * a `'dict object' has no attribute …` warning each time (see issue #346).
   * Such write-only controls have to be advertised without a state topic, which
   * puts the entity into optimistic mode.
   */
  test('every advertised state topic points at a value that is actually published', () => {
    const unbacked = statefulAdvertisements()
      .filter(advertisement => advertisement.hasStateTopic)
      .filter(advertisement => {
        const definition = getDeviceDefinition(advertisement.deviceType);
        const message = definition!.messages.find(m => m.publishPath === advertisement.publishPath);
        return !isPublished(advertisement.keyPath, publishablePaths(message!));
      })
      .map(a => `${a.deviceType}/${a.publishPath}: ${a.id} reads value_json.${a.keyPath}`);

    expect(unbacked).toEqual([]);
  });

  test.each(['HMA', 'HMF', 'HMJ', 'HMK', 'HMG', 'VNSA', 'VNSD', 'VNSE3', 'HMN', 'HMM', 'JPLS'])(
    '%s advertises the write-only meter controls without a state topic',
    deviceType => {
      const meterControls = statefulAdvertisements().filter(
        advertisement =>
          advertisement.deviceType === deviceType &&
          ['meter_type', 'meter_mac'].includes(advertisement.id),
      );

      expect(meterControls).toHaveLength(2);
      for (const control of meterControls) {
        expect(control.hasStateTopic).toBe(false);
      }
    },
  );
});
