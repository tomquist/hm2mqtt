import {
  DEFAULT_CELL_DATA_POLLING_INTERVAL_SECONDS,
  parseCellDataPollingInterval,
} from './constants.js';

describe('parseCellDataPollingInterval', () => {
  it('uses the 15 second default when no value is configured', () => {
    expect(parseCellDataPollingInterval(undefined)).toBe(
      DEFAULT_CELL_DATA_POLLING_INTERVAL_SECONDS * 1000,
    );
  });

  it('uses a configured interval in seconds', () => {
    expect(parseCellDataPollingInterval('7')).toBe(7000);
  });

  it('enforces the one second minimum', () => {
    expect(parseCellDataPollingInterval('0')).toBe(1000);
    expect(parseCellDataPollingInterval('-5')).toBe(1000);
  });

  it('falls back to the default for invalid values', () => {
    expect(parseCellDataPollingInterval('invalid')).toBe(15000);
  });
});
