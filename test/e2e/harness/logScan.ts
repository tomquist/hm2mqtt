/**
 * What counts as Home Assistant complaining about hm2mqtt.
 *
 * The scan is deliberately narrow: only the patterns below, each of which means
 * Home Assistant rejected or could not use something hm2mqtt published — a
 * template rendered against a payload without the value, an entity that cannot
 * process its messages, a discovery payload that was not accepted, or two
 * entities claiming one unique id. Everything else Home Assistant logs in a bare
 * test install (a missing optional dependency, an unavailable cloud component)
 * is none of hm2mqtt's business and must not make the suite flaky.
 */
const PROBLEM_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /Template variable warning:/,
    why: 'a value template was rendered against a payload without the value (issue #346)',
  },
  {
    pattern: /ERROR .*\[homeassistant\.components\.mqtt/,
    why: 'the MQTT integration rejected something hm2mqtt published',
  },
  {
    pattern: /Exception in _message_received/,
    why: 'an entity received a message it could not process (issue #418)',
  },
  {
    pattern: /Invalid config for|Invalid discovery payload/,
    why: 'a discovery payload was not accepted',
  },
  {
    pattern: /does not generate unique IDs/,
    why: 'two entities claimed the same unique id, so one of them was dropped',
  },
];

export interface LogProblem {
  line: string;
  why: string;
}

export function findLogProblems(log: string, allowlist: RegExp[] = []): LogProblem[] {
  const problems: LogProblem[] = [];
  for (const line of log.split('\n')) {
    if (allowlist.some(allowed => allowed.test(line))) {
      continue;
    }
    const match = PROBLEM_PATTERNS.find(({ pattern }) => pattern.test(line));
    if (match) {
      problems.push({ line: line.trim(), why: match.why });
    }
  }
  return problems;
}

export function describeLogProblems(problems: LogProblem[]): string {
  return problems.map(problem => `- ${problem.why}\n  ${problem.line.slice(0, 400)}`).join('\n');
}
