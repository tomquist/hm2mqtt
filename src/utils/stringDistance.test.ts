import { levenshteinDistance } from './stringDistance';

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('HMA', 'HMA')).toBe(0);
  });

  it('should return the length of the other string when one is empty', () => {
    expect(levenshteinDistance('', 'HMA')).toBe(3);
    expect(levenshteinDistance('HMA', '')).toBe(3);
  });

  it('should return 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should return 1 for single substitution', () => {
    expect(levenshteinDistance('HWJ', 'HMJ')).toBe(1);
  });

  it('should return 1 for single insertion', () => {
    expect(levenshteinDistance('HM', 'HMA')).toBe(1);
  });

  it('should return 1 for single deletion', () => {
    expect(levenshteinDistance('HMAJ', 'HMA')).toBe(1);
  });

  it('should handle completely different strings', () => {
    expect(levenshteinDistance('ABC', 'XYZ')).toBe(3);
  });
});
