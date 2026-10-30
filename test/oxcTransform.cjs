/**
 * Jest transform that strips TypeScript with oxc-transform.
 *
 * The compiler (tsrs) is a native binary with no in-process transpile API,
 * so tests are transpiled file by file instead. That is all ts-jest did here
 * too: `isolatedModules` meant it never type-checked the tests.
 */
const { createHash } = require('node:crypto');
const { transformSync } = require('oxc-transform');
const { version } = require('oxc-transform/package.json');

module.exports = {
  process(sourceText, sourcePath) {
    const { code, map, errors } = transformSync(sourcePath, sourceText, { sourcemap: true });
    if (errors.length > 0) {
      throw new Error(
        `${sourcePath}\n${errors.map(error => error.codeframe ?? error.message).join('\n')}`,
      );
    }
    return { code, map };
  },

  getCacheKey(sourceText, sourcePath) {
    return createHash('sha256')
      .update(version)
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  },
};
