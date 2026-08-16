import { DiscoveryBaseline } from './baseline.js';
import { findStateTopicRemovals } from './rules.js';

const TOPIC = 'homeassistant/select/HMA-1_0123456789ab/meter_type/config';

function baseline(components: Record<string, unknown>): DiscoveryBaseline[] {
  return [{ deviceType: 'HMA-1', state: 'fixture:HMA-1', components }];
}

const withStateTopic = {
  name: 'Meter Type',
  state_topic: 'hm2mqtt/x/data',
  value_template: '{{ 1 }}',
};
const withoutStateTopic = { name: 'Meter Type' };

describe('findStateTopicRemovals', () => {
  test('flags an entity that keeps existing without its state topic', () => {
    const removals = findStateTopicRemovals(
      baseline({ [TOPIC]: withStateTopic }),
      baseline({ [TOPIC]: withoutStateTopic }),
    );
    expect(removals).toEqual([{ deviceType: 'HMA-1', topic: TOPIC }]);
  });

  test('accepts an unchanged entity', () => {
    expect(
      findStateTopicRemovals(
        baseline({ [TOPIC]: withStateTopic }),
        baseline({ [TOPIC]: withStateTopic }),
      ),
    ).toEqual([]);
  });

  test('accepts a state topic that is newly added', () => {
    expect(
      findStateTopicRemovals(
        baseline({ [TOPIC]: withoutStateTopic }),
        baseline({ [TOPIC]: withStateTopic }),
      ),
    ).toEqual([]);
  });

  test('accepts an entity that is removed outright', () => {
    expect(findStateTopicRemovals(baseline({ [TOPIC]: withStateTopic }), baseline({}))).toEqual([]);
    expect(
      findStateTopicRemovals(baseline({ [TOPIC]: withStateTopic }), baseline({ [TOPIC]: null })),
    ).toEqual([]);
  });

  test('ignores device types that no longer exist', () => {
    expect(findStateTopicRemovals(baseline({ [TOPIC]: withStateTopic }), [])).toEqual([]);
  });
});
