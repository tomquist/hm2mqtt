import { transformTemperature, venusBuild, venusSupports } from './helpers.js';

describe('transformTemperature()', () => {
  it('should convert positive temperatures correctly', () => {
    expect(transformTemperature('42')).toBe(42);
    expect(transformTemperature('0')).toBe(0);
    expect(transformTemperature('127')).toBe(127);
  });

  it('should convert negative temperatures correctly', () => {
    expect(transformTemperature('214')).toBe(-42);
    expect(transformTemperature('128')).toBe(-128);
    expect(transformTemperature('255')).toBe(-1);
  });

  it('should return 0 for invalid number strings', () => {
    expect(transformTemperature('invalid')).toBe(0);
    expect(transformTemperature('')).toBe(0);
    expect(transformTemperature('NaN')).toBe(0);
  });

  it('should return values outside `uint8` bounds without conversion', () => {
    expect(transformTemperature('-100')).toBe(-100);
    expect(transformTemperature('1000')).toBe(1000);
    expect(transformTemperature('-1')).toBe(-1);
    expect(transformTemperature('256')).toBe(256);
  });

  // Although returned temperatures seem to always be integers, the function can
  // still convert decimals
  it('should handle decimal values correctly', () => {
    expect(transformTemperature('25.5')).toBe(25.5);
    expect(transformTemperature('0.5')).toBe(0.5);
    expect(transformTemperature('200.75')).toBe(-55.25);
  });
});

describe('venusBuild()', () => {
  it('keeps three-digit builds', () => {
    expect(venusBuild(156)).toBe(156);
  });

  it('reads four-digit builds as point builds', () => {
    expect(venusBuild(1581)).toBe(158.1);
    expect(venusBuild(1492)).toBe(149.2);
  });

  it('treats missing or invalid builds as unknown', () => {
    expect(venusBuild(undefined)).toBeUndefined();
    expect(venusBuild(0)).toBeUndefined();
    expect(venusBuild(-1)).toBeUndefined();
    expect(venusBuild(NaN)).toBeUndefined();
  });
});

describe('venusSupports()', () => {
  it('compares the normalised build with an open-ended threshold', () => {
    expect(venusSupports('HMG', 1581, { HMG: 156 })).toBe(true);
    expect(venusSupports('HMG', 156, { HMG: 156 })).toBe(true);
    expect(venusSupports('HMG', 155, { HMG: 156 })).toBe(false);
  });

  it('is false for a model without the feature, even with no build', () => {
    expect(venusSupports('VNSA', undefined, { HMG: 156 })).toBe(false);
  });

  it('is true for a threshold of 0, even with no build', () => {
    expect(venusSupports('VNSA', undefined, { VNSA: 0 })).toBe(true);
  });

  it('is undefined while the build is unknown', () => {
    expect(venusSupports('HMG', undefined, { HMG: 156 })).toBeUndefined();
  });
});
