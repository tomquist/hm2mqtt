/**
 * Matches the credentials part of a URL: the scheme, everything up to the last
 * `@` (a raw `@` inside a password is not encoded by every user) and that `@`.
 */
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^\s/?#]*)@/gi;

/**
 * Masks the password of every URL credential found in a string.
 *
 * Broker URLs may carry their credentials inline (`mqtt://user:pass@host:1883`),
 * so anything logging one would otherwise write the broker password to the log
 * in plaintext (issue #424). The username is kept: it helps when reading logs
 * and is not a secret.
 */
export function redactUrlCredentials(value: string): string {
  return value.replace(URL_CREDENTIALS, (match, scheme: string, userInfo: string) => {
    const separator = userInfo.indexOf(':');
    // Nothing to hide: either a bare `user@host` or an empty password.
    if (separator < 0 || separator === userInfo.length - 1) {
      return match;
    }
    return `${scheme}${userInfo.slice(0, separator)}:***@`;
  });
}

/**
 * `JSON.stringify` replacer that keeps secrets out of logged configuration:
 * password fields are masked and credentials embedded in URLs are redacted.
 */
export function redactSecrets(key: string, value: unknown): unknown {
  if (isSecret(key, value)) {
    return '***';
  }
  return typeof value === 'string' ? redactUrlCredentials(value) : value;
}

/** Guards against a pathological object blowing the stack. */
const MAX_DEPTH = 32;

const TOO_DEEP = '[redacted: too deep]';
const CIRCULAR = '[circular]';

/**
 * Whether a value under a password-named key is worth masking. An empty or
 * absent password is left alone: masking it would suggest a password is
 * configured when none is.
 */
function isSecret(key: string, value: unknown): boolean {
  return (
    key.toLowerCase().includes('password') && value !== '' && value !== null && value !== undefined
  );
}

/**
 * Returns a copy of `value` with the secrets masked in every string it
 * contains: URL credentials anywhere, and the value of any password-named key.
 *
 * Plain objects and arrays are walked; anything else - an Error, a Buffer, a
 * class instance - is passed through untouched so whatever serializes it later
 * still sees the object it expects. Errors reach the log through the message
 * string, which is redacted in full.
 *
 * The input is never mutated. A cycle or an object too deep to walk is replaced
 * by a marker rather than passed through, so nothing escapes unredacted.
 */
export function redactDeep(value: unknown, depth = 0, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return redactUrlCredentials(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  if (ancestors.has(value)) {
    return CIRCULAR;
  }
  if (depth >= MAX_DEPTH) {
    return TOO_DEEP;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(entry => redactDeep(entry, depth + 1, ancestors));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSecret(key, entry) ? '***' : redactDeep(entry, depth + 1, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}
