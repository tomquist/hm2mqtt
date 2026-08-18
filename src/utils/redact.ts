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
  if (key.toLowerCase().includes('password')) {
    return '***';
  }
  return typeof value === 'string' ? redactUrlCredentials(value) : value;
}
