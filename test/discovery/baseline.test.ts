import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DiscoveryBaseline,
  baselineFileName,
  generateAllBaselines,
  serializeBaseline,
} from './baseline.js';
import { CURRENT_BASELINE_DIR, RELEASED_BASELINE_DIR, latestReleasedVersion } from './paths.js';
import { describeStateTopicRemovals, findStateTopicRemovals } from './rules.js';

/**
 * The baseline is what a Home Assistant user actually ends up with. Reviewing
 * its diff is the cheapest way to notice that a change to a device definition
 * moved, renamed or unbacked an entity.
 *
 * Run `npm run baseline:update` after an intentional change.
 */
const UPDATE = process.env.UPDATE_DISCOVERY_BASELINE === '1';

const baselines = generateAllBaselines();

describe('discovery baseline', () => {
  if (UPDATE) {
    test('writes the current baseline', () => {
      mkdirSync(CURRENT_BASELINE_DIR, { recursive: true });
      const expected = new Set<string>();
      for (const baseline of baselines) {
        const name = baselineFileName(baseline.deviceType);
        expected.add(name);
        writeFileSync(join(CURRENT_BASELINE_DIR, name), serializeBaseline(baseline));
      }
      for (const name of readdirSync(CURRENT_BASELINE_DIR)) {
        if (name.endsWith('.json') && !expected.has(name)) {
          throw new Error(`Stale baseline file ${name}; delete it if the device type is gone`);
        }
      }
      expect(baselines.length).toBeGreaterThan(0);
    });
    return;
  }

  test.each(baselines.map(baseline => [baseline.deviceType, baseline] as const))(
    '%s matches the committed baseline',
    (deviceType, baseline: DiscoveryBaseline) => {
      const file = join(CURRENT_BASELINE_DIR, baselineFileName(deviceType));
      if (!existsSync(file)) {
        throw new Error(
          `No committed baseline for ${deviceType}. Run \`npm run baseline:update\` and review the diff.`,
        );
      }
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(baseline);
    },
  );

  test('every committed baseline still has a device type', () => {
    const generated = new Set(baselines.map(baseline => baselineFileName(baseline.deviceType)));
    const committed = readdirSync(CURRENT_BASELINE_DIR).filter(name => name.endsWith('.json'));
    expect(committed.filter(name => !generated.has(name))).toEqual([]);
  });
});

describe('upgrade safety', () => {
  const version = latestReleasedVersion();
  const releasedDir = join(RELEASED_BASELINE_DIR, version);
  const released: DiscoveryBaseline[] = readdirSync(releasedDir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(releasedDir, name), 'utf8')));

  test(`no entity loses the state topic it had in ${version}`, () => {
    const removals = findStateTopicRemovals(released, baselines);
    expect(
      removals.length === 0
        ? ''
        : `These entities keep existing but no longer read a state topic, which breaks every\n` +
            `installation that already has them (see issue #418). Advertise the value again — a\n` +
            `template guarded with \`is defined\` renders nothing until the value exists — or\n` +
            `remove the entity outright.\n\n${describeStateTopicRemovals(removals)}`,
    ).toBe('');
  });
});
