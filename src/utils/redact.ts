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
  // An empty password is left alone: masking it would suggest a password is
  // configured when none is.
  if (key.toLowerCase().includes('password') && value !== '') {
    return '***';
  }
  return typeof value === 'string' ? redactUrlCredentials(value) : value;
}

/**
 * How deep `redactDeep` walks into an object before giving up. Also what keeps
 * a cyclic object from recursing forever.
 */
const MAX_DEPTH = 6;

/**
 * Returns a copy of `value` with the URL credentials masked in every string it
 * contains.
 *
 * Plain objects and arrays are walked; anything else - an Error, a Buffer, a
 * class instance - is passed through untouched so whatever serializes it later
 * still sees the object it expects. The input is never mutated.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactUrlCredentials(value);
  }
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(entry => redactDeep(entry, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactDeep(entry, depth + 1)]),
  );
}
