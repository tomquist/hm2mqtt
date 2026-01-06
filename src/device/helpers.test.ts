import { transformTemperature } from './helpers';

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
