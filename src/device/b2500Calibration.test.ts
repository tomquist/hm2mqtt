import { jest } from '@jest/globals';
import type { B2500CalibrationData } from '../types.js';

// The calibration message is only registered when polling it is enabled, which
// is read while the device modules are imported.
async function loadParser() {
  jest.resetModules();
  process.env.POLL_CALIBRATION_DATA = 'true';
  await import('./registry.js');
  return (await import('../parser.js')).parseMessage;
}

describe('B2500 calibration data (cd=21)', () => {
  const previous = process.env.POLL_CALIBRATION_DATA;
  afterAll(() => {
    if (previous === undefined) delete process.env.POLL_CALIBRATION_DATA;
    else process.env.POLL_CALIBRATION_DATA = previous;
  });

  test('converts the mA·s capacity to mAh', async () => {
    const parseMessage = await loadParser();
    const parsed = parseMessage('cf=160000000,df=150000000', 'HMA-1', 'e88da6f35def');
    const data = parsed['calibration'] as B2500CalibrationData;
    expect(data).toBeDefined();
    expect(data.charge).toBe(44444);
    expect(data.discharge).toBe(41667);
  });
});
