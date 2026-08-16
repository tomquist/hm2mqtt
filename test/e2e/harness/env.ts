import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const E2E_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(E2E_ROOT, '../..');

/** Scratch space for generated Home Assistant configuration and logs. */
export const TMP_ROOT = resolve(E2E_ROOT, '.tmp');

/** Python virtual environment created by `npm run e2e:setup`. */
export const VENV_DIR = resolve(E2E_ROOT, '.venv-ha');
export const HASS_BIN = resolve(VENV_DIR, 'bin/hass');

export interface PinnedVersions {
  homeassistant: string;
  'home-assistant-frontend': string;
  numpy: string;
}

export function pinnedVersions(): PinnedVersions {
  return JSON.parse(readFileSync(resolve(E2E_ROOT, 'versions.json'), 'utf8'));
}

export function homeAssistantInstalled(): boolean {
  return existsSync(HASS_BIN);
}

/**
 * The suite needs a Home Assistant install, which is too heavy to make a
 * precondition of `npm test`. Scenarios skip with this message when it is
 * missing so a contributor who never ran the setup sees an instruction rather
 * than a wall of failures.
 */
export const MISSING_HOME_ASSISTANT = `Home Assistant is not installed for the e2e suite. Run \`npm run e2e:setup\`.`;

/**
 * Whether the scenarios can run, warning once when they cannot.
 *
 * Skipping is only ever right on a developer's machine. In CI a skipped
 * scenario looks exactly like a passing one, so a missing install has to fail
 * the job instead of quietly proving nothing.
 */
export function canRunScenarios(): boolean {
  if (homeAssistantInstalled()) {
    return true;
  }
  if (process.env.CI) {
    throw new Error(`${MISSING_HOME_ASSISTANT} Refusing to skip the scenarios in CI.`);
  }
  console.warn(MISSING_HOME_ASSISTANT);
  return false;
}
