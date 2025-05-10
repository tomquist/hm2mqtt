import { calculateNewVersionTopicId, decryptNewVersionTopicId } from './crypt';

describe('crypt', () => {
  it.each`
    input             | output
    ${'badbeefbadbe'} | ${'e6a1f1765cdd26ff05e2afcc5df17a9b'}
    ${'feeba7123456'} | ${'757a6deefc6ab2b3764d61e64fb2a931'}
  `('should encrypt "$input" to the expected hex string', ({ input, output }) => {
    const result = calculateNewVersionTopicId(input);
    expect(result).toBe(output);

    const decrypted = decryptNewVersionTopicId(result);
    expect(decrypted).toBe(input);
  });
});
