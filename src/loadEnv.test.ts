import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * This asserts on the *source order* of two imports rather than on behaviour,
 * which is unusual but is the only thing that actually guards the invariant.
 *
 * `.env` is loaded by importing `./loadEnv.js`, and the device definitions read
 * `process.env` while they are being imported (the `POLL_*` flags, and
 * `globalPollInterval` in deviceDefinition.ts). ESM evaluates imports in source
 * order, so if `./device/registry.js` is ever moved above `./loadEnv.js` — or if
 * someone "tidies up" by moving the dotenv call back into the body of index.ts —
 * every value in `.env` is silently ignored again. No runtime assertion catches
 * that, because the flags simply fall back to their defaults.
 */
describe('environment loading order', () => {
  const indexSource = fs.readFileSync(path.join(srcDir, 'index.ts'), 'utf8');

  test('loadEnv is imported before the device registry', () => {
    const loadEnvIndex = indexSource.indexOf("import './loadEnv.js'");
    const registryIndex = indexSource.indexOf("import './device/registry.js'");

    expect(loadEnvIndex).toBeGreaterThanOrEqual(0);
    expect(registryIndex).toBeGreaterThanOrEqual(0);
    expect(loadEnvIndex).toBeLessThan(registryIndex);
  });

  test('dotenv is not invoked from the body of index.ts', () => {
    expect(indexSource).not.toContain('dotenv.config()');
  });
});
