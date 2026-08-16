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
