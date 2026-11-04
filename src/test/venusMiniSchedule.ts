import type { VenusMiniTimePeriod } from '../types.js';

export function miniRuntimePayload(
  periods: readonly VenusMiniTimePeriod[],
  time = new Date(),
  overrides: Record<string, string> = {},
): string {
  const directionCodes = { charge: 1, discharge: 2, selfConsumption: 3, unknown: 0 };
  const values: Record<string, string> = {
    gp: '0',
    lp: '0',
    soc: '500',
    be: '1000',
    dpt: '0',
    pmu: '300',
    wif_s: '1',
    mq_s: '1',
    cm: '2',
    time: `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`,
  };
  for (let index = 0; index < 6; index++) {
    const period = periods[index] ?? {};
    const slot = index + 1;
    Object.assign(values, {
      [`m${slot}`]: period.enabled ? '1' : '0',
      [`mp${slot}`]: String(period.power ?? 0),
      [`ms${slot}`]: String(directionCodes[period.direction ?? 'unknown']),
      [`st${slot}`]: period.startTime ?? '00:00',
      [`et${slot}`]: period.endTime ?? '00:00',
      [`re${slot}`]: String(period.repeatRaw ?? 0),
    });
  }
  return Object.entries({ ...values, ...overrides })
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}
