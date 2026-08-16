import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscoveryBaseline, baselineFileName } from './baseline.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Baselines regenerated from the working tree; reviewed in every pull request. */
export const CURRENT_BASELINE_DIR = resolve(here, '../fixtures/discovery/current');

/** Frozen copies of what each release published; written by the release process. */
export const RELEASED_BASELINE_DIR = resolve(here, '../fixtures/discovery/released');

function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split('.').map(part => parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Released versions that have a frozen baseline, oldest first. */
export function releasedVersions(): string[] {
  return readdirSync(RELEASED_BASELINE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort(compareVersions);
}

export function latestReleasedVersion(): string {
  const versions = releasedVersions();
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(`No released discovery baseline found in ${RELEASED_BASELINE_DIR}`);
  }
  return latest;
}

export function readBaseline(dir: string, deviceType: string): DiscoveryBaseline {
  return JSON.parse(readFileSync(join(dir, baselineFileName(deviceType)), 'utf8'));
}

export function readBaselines(dir: string): DiscoveryBaseline[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')) as DiscoveryBaseline);
}
