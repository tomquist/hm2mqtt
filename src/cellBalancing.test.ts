import './device/registry.js';
import {
  advanceBalancingState,
  BalancingState,
  CellSample,
  computeCellStats,
  computeDrift,
  extractB2500Sample,
  extractVenusSample,
  initialBalancingState,
  plausibleCells,
} from './cellBalancing.js';
import { parseMessage } from './parser.js';
import {
  CELL_KNEE_CROSSING_MV,
  CELL_SAMPLE_MAX_GAP_MS,
  DRIFT_WINDOW_MS,
  LATCH_MEDIAN_SAMPLES,
  REST_LATCH_DELAY_MS,
} from './constants.js';

const MINUTE = 60000;

function sample(overrides: Partial<CellSample> & { cellsMv: number[] }): CellSample {
  return {
    at: 1_700_000_000_000,
    monotonicAt: 0,
    staleMs: 0,
    ...overrides,
  };
}

describe('computeCellStats', () => {
  it('reports spread, sigma and deviations', () => {
    const stats = computeCellStats([3300, 3310, 3290, 3300])!;
    expect(stats.count).toBe(4);
    expect(stats.meanMv).toBe(3300);
    expect(stats.spreadMv).toBe(20);
    expect(stats.sigmaMv).toBeCloseTo(Math.sqrt(50), 6);
    expect(stats.deviationsMv).toEqual([0, 10, -10, 0]);
  });

  it('drops empty slots and implausible readings', () => {
    // Unused slots on a short pack read exactly 0.
    expect(plausibleCells([3300, 0, 3310, 65535])).toEqual([3300, 3310]);
    const stats = computeCellStats([3300, 0, 3310])!;
    expect(stats.count).toBe(2);
    expect(stats.meanMv).toBe(3305);
  });

  it('returns undefined when fewer than two cells survive', () => {
    expect(computeCellStats([3300, 0, 0])).toBeUndefined();
    expect(computeCellStats([])).toBeUndefined();
  });
});

describe('normalised deviations discriminate the slide from balancing', () => {
  // This is the reason the feature exists. A pack sliding down the flat part of
  // the LFP curve keeps every cell's *share* of the spread identical while the
  // spread itself collapses; balancing changes the share.
  const atKnee = [3450, 3470, 3455, 3445];

  it('is unchanged when the whole stack slides down together', () => {
    const before = computeCellStats(atKnee)!;
    // Same relative positions, spread scaled by a quarter, mean much lower.
    const mean = before.meanMv;
    const slid = atKnee.map(mv => 3300 + (mv - mean) * 0.25);
    const after = computeCellStats(slid)!;

    expect(after.spreadMv).toBeCloseTo(before.spreadMv * 0.25, 6);
    expect(after.meanMv).toBeLessThan(before.meanMv - 100);
    after.normalisedDeviations.forEach((d, i) => {
      expect(d).toBeCloseTo(before.normalisedDeviations[i], 6);
    });
  });

  it('moves the outlier toward zero when the outlier is actually bled down', () => {
    const before = computeCellStats(atKnee)!;
    // Only the high cell comes down; the others stay put.
    const after = computeCellStats([3450, 3458, 3455, 3445])!;

    const outlier = 1;
    expect(Math.abs(after.normalisedDeviations[outlier])).toBeLessThan(
      Math.abs(before.normalisedDeviations[outlier]),
    );
  });
});

describe('computeDrift', () => {
  const window = (
    count: number,
    slopeMvPerHour: number,
    extra: { currentA?: number; cellCount?: number; noise?: number[] } = {},
  ) =>
    Array.from({ length: count }, (_, i) => {
      const t = (i * DRIFT_WINDOW_MS) / (count - 1);
      return {
        t,
        meanMv: 3300 + (slopeMvPerHour * t) / 3600000 + (extra.noise?.[i] ?? 0),
        currentA: extra.currentA,
        cellCount: extra.cellCount ?? 16,
      };
    });

  it('recovers a known slope', () => {
    expect(computeDrift(window(30, -4))).toBeCloseTo(-4, 6);
  });

  it('needs enough samples and enough span', () => {
    expect(computeDrift(window(3, -4))).toBeUndefined();
    const tooShort = window(30, -4).map(p => ({
      t: p.t / 10,
      meanMv: p.meanMv,
      currentA: p.currentA,
      cellCount: p.cellCount,
    }));
    expect(computeDrift(tooShort)).toBeUndefined();
  });

  it('suppresses the reading when the pack was not at rest', () => {
    expect(computeDrift(window(30, -4, { currentA: 6 }))).toBeUndefined();
    expect(computeDrift(window(30, -4, { currentA: 0.2 }))).toBeCloseTo(-4, 6);
  });

  it('still reports when no current is available at all', () => {
    // B2500 V1 reports no pack current; a gated-off metric would be useless
    // there, so an ungated slope is the best available.
    expect(computeDrift(window(30, -4, { currentA: undefined }))).toBeCloseTo(-4, 6);
  });

  it('discards a window whose cell count changed', () => {
    const points = window(30, -4);
    points[10].cellCount = 15;
    expect(computeDrift(points)).toBeUndefined();
  });

  it('rejects a single outlier rather than letting it bend the fit', () => {
    // Near an endpoint, where an outlier has real leverage on the slope. In the
    // middle of the window it sits at the mean and barely moves the fit at all,
    // so a spike placed there would pass with the rejection removed entirely.
    const noise = Array.from({ length: 30 }, () => 0);
    noise[2] = 3;
    const points = window(30, -4, { noise });
    expect(computeDrift(points)).toBeCloseTo(-4, 1);

    // Guard against the test going vacuous again: an independent plain fit of
    // the same window, with no rejection, has to be visibly off. Otherwise
    // deleting the rejection branch would leave the assertion above green.
    const n = points.length;
    const meanT = points.reduce((a, p) => a + p.t, 0) / n;
    const meanY = points.reduce((a, p) => a + p.meanMv, 0) / n;
    const sxy = points.reduce((a, p) => a + (p.t - meanT) * (p.meanMv - meanY), 0);
    const sxx = points.reduce((a, p) => a + (p.t - meanT) ** 2, 0);
    const unrejected = (sxy / sxx) * 3600000;
    expect(Math.abs(unrejected + 4)).toBeGreaterThan(0.3);
  });

  it('refuses a window that is not moving linearly', () => {
    // Post-charge relaxation: fast decay, not a straight line.
    const points = Array.from({ length: 30 }, (_, i) => {
      const t = (i * DRIFT_WINDOW_MS) / 29;
      return { t, meanMv: 3300 + 80 * Math.exp(-t / 300000), cellCount: 16 };
    });
    expect(computeDrift(points)).toBeUndefined();
  });
});

describe('balancing state machine', () => {
  const feed = (
    state: BalancingState,
    samples: CellSample[],
    localDate = '2026-08-06',
  ): { state: BalancingState; cycles: any[] } => {
    const cycles: any[] = [];
    let current = state;
    for (const s of samples) {
      const result = advanceBalancingState(current, s, localDate);
      current = result.state;
      if (result.cycle) cycles.push(result.cycle);
    }
    return { state: current, cycles };
  };

  const charging = (monotonicAt: number, cellsMv: number[]) =>
    sample({ cellsMv, chargingIn: true, monotonicAt, packCurrentA: 5 });

  it('accumulates time above the two thresholds separately', () => {
    const samples = [
      charging(0, [3420, 3420, 3420, 3420]),
      charging(MINUTE, [3420, 3420, 3420, 3420]),
      charging(2 * MINUTE, [3520, 3520, 3520, 3520]),
      charging(3 * MINUTE, [3520, 3520, 3520, 3520]),
    ];
    const { state } = feed(initialBalancingState(), samples);
    // Each interval is credited according to the state at its end, so the two
    // intervals ending on a 3520 sample count toward the high threshold.
    expect(state.msAboveThreshold).toBe(3 * MINUTE);
    expect(state.msAboveHighThreshold).toBe(2 * MINUTE);
  });

  it('books only observed time, not an outage', () => {
    // Device charging at the threshold, then off the network for ten hours.
    const samples = [
      charging(0, [3420, 3420, 3420, 3420]),
      charging(MINUTE, [3420, 3420, 3420, 3420]),
      charging(600 * MINUTE, [3420, 3420, 3420, 3420]),
      charging(601 * MINUTE, [3420, 3420, 3420, 3420]),
    ];
    const { state } = feed(initialBalancingState(), samples);
    // One minute before the gap and one after it — never the gap itself.
    expect(state.msAboveThreshold).toBe(2 * MINUTE);
    expect(state.msAboveThreshold).toBeLessThan(CELL_SAMPLE_MAX_GAP_MS * 2);
  });

  it('resets the daily counters when the local date rolls over', () => {
    let { state } = feed(initialBalancingState(), [
      charging(0, [3420, 3420, 3420, 3420]),
      charging(MINUTE, [3420, 3420, 3420, 3420]),
    ]);
    expect(state.msAboveThreshold).toBe(MINUTE);

    ({ state } = feed(state, [charging(2 * MINUTE, [3420, 3420, 3420, 3420])], '2026-08-07'));
    // Yesterday's minute is gone; only the interval straddling midnight, which
    // is credited to the day it ended in, remains.
    expect(state.msAboveThreshold).toBe(MINUTE);
    expect(state.localDate).toBe('2026-08-07');
  });

  it('latches the spread interpolated at the crossing voltage', () => {
    // Mean steps 3440 -> 3460, so the crossing at 3450 sits exactly halfway;
    // the spread differs between the two samples so interpolation is visible.
    const below = [3430, 3450, 3440, 3440]; // mean 3440, spread 20
    const above = [3440, 3480, 3460, 3460]; // mean 3460, spread 40
    const { state } = feed(initialBalancingState(), [
      charging(0, below),
      charging(MINUTE, above),
      charging(2 * MINUTE, above), // confirmation
    ]);
    expect(state.crossing).toBeDefined();
    expect(state.crossing!.meanMv).toBe(CELL_KNEE_CROSSING_MV);
    expect(state.crossing!.spreadMv).toBeCloseTo(30, 6);
  });

  it('does not latch on a single spike that immediately falls back', () => {
    const below = [3430, 3450, 3440, 3440];
    const spike = [3440, 3480, 3460, 3460];
    const { state } = feed(initialBalancingState(), [
      charging(0, below),
      charging(MINUTE, spike),
      charging(2 * MINUTE, below), // not confirmed
    ]);
    expect(state.crossing).toBeUndefined();
  });

  // A charge that crosses 3450 mV and then stops. The rest clock only starts on
  // that transition, so every rest test needs it.
  const restStart = 3 * MINUTE;
  const chargeThenStop = (): CellSample[] => [
    charging(0, [3430, 3450, 3440, 3440]),
    charging(MINUTE, [3440, 3480, 3460, 3460]),
    charging(2 * MINUTE, [3440, 3480, 3460, 3460]),
  ];
  const restingFor = (durationMs: number): CellSample[] => {
    const out: CellSample[] = [];
    for (let t = restStart; t <= restStart + durationMs; t += MINUTE) {
      out.push(
        sample({
          cellsMv: [3299, 3301, 3300, 3300],
          chargingIn: false,
          packCurrentA: -0.1,
          monotonicAt: t,
          socPct: 100,
        }),
      );
    }
    return out;
  };

  it('latches the rested spread and emits a cycle', () => {
    const { state, cycles } = feed(initialBalancingState(), [
      ...chargeThenStop(),
      ...restingFor(REST_LATCH_DELAY_MS + 5 * MINUTE),
    ]);
    expect(cycles).toHaveLength(1);
    expect(state.rested).toBeDefined();
    expect(cycles[0].restedSpreadMv).toBe(2);
    // The comparable knee number survives into the record.
    expect(cycles[0].crossingSpreadMv).toBeCloseTo(30, 6);
    expect(cycles[0].minSocPct).toBe(100);
  });

  it('takes the median at a latch so one corrupt reading cannot be recorded', () => {
    // The corrupt sample has to land on the latch itself. Placed after it, the
    // latch has already fired and the assertion proves nothing.
    const corruptAt = restStart + REST_LATCH_DELAY_MS;
    const samples = [...chargeThenStop(), ...restingFor(REST_LATCH_DELAY_MS + 5 * MINUTE)].map(s =>
      s.monotonicAt === corruptAt ? sample({ ...s, cellsMv: [3000, 3900, 3300, 3300] }) : s,
    );

    const { cycles } = feed(initialBalancingState(), samples);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].restedSpreadMv).toBe(2);
    // The whole record comes from one clean sample, so the shape stored beside
    // the spread cannot be the corrupt one either.
    expect(cycles[0].restedNormalisedDeviations).toHaveLength(4);
    expect(Math.max(...(cycles[0].restedNormalisedDeviations as number[]))).toBeLessThan(0.6);
    expect(LATCH_MEDIAN_SAMPLES).toBeGreaterThan(2);
  });

  it('does not latch a rested spread without a charge before it', () => {
    // An evening discharge that ends leaves the pack idle at low state of
    // charge. Latching there would record the flat middle of the curve — the
    // exact artifact this feature exists to expose — every single night.
    const idle: CellSample[] = [];
    for (let t = 0; t <= REST_LATCH_DELAY_MS + 10 * MINUTE; t += MINUTE) {
      idle.push(
        sample({
          cellsMv: [3199, 3201, 3200, 3200],
          chargingIn: false,
          packCurrentA: 0,
          monotonicAt: t,
        }),
      );
    }
    const { state, cycles } = feed(initialBalancingState(), idle);
    expect(cycles).toHaveLength(0);
    expect(state.rested).toBeUndefined();
  });

  it('abandons the rest window if the pack starts supplying the house', () => {
    const interrupted = [...chargeThenStop()];
    for (let t = restStart; t <= restStart + REST_LATCH_DELAY_MS + 10 * MINUTE; t += MINUTE) {
      // Twenty minutes in, a 900 W load comes on and never goes away.
      const current = t >= restStart + 20 * MINUTE ? -18 : -0.1;
      interrupted.push(
        sample({
          cellsMv: [3299, 3301, 3300, 3300],
          chargingIn: false,
          packCurrentA: current,
          monotonicAt: t,
        }),
      );
    }
    const { state, cycles } = feed(initialBalancingState(), interrupted);
    expect(cycles).toHaveLength(0);
    expect(state.rested).toBeUndefined();
  });

  it('never latches a rested spread when the family reports no current', () => {
    // B2500 V1 has no pack current at all, so "idle" and "discharging into the
    // house at 800 W" are indistinguishable. Publishing nothing beats
    // publishing a spread measured under load.
    const noCurrent = [...chargeThenStop()].map(s => sample({ ...s, packCurrentA: undefined }));
    for (let t = restStart; t <= restStart + REST_LATCH_DELAY_MS + 10 * MINUTE; t += MINUTE) {
      noCurrent.push(
        sample({ cellsMv: [3299, 3301, 3300, 3300], chargingIn: false, monotonicAt: t }),
      );
    }
    const { state, cycles } = feed(initialBalancingState(), noCurrent);
    expect(cycles).toHaveLength(0);
    expect(state.rested).toBeUndefined();
  });

  it('survives a backwards wall clock without producing negative durations', () => {
    // Monotonic time keeps advancing even as the wall clock jumps back a year.
    const samples = [
      charging(0, [3420, 3420, 3420, 3420]),
      { ...charging(MINUTE, [3420, 3420, 3420, 3420]), at: 1_600_000_000_000 },
    ];
    const { state } = feed(initialBalancingState(), samples);
    expect(state.msAboveThreshold).toBe(MINUTE);
  });

  it('ignores samples with no usable cells', () => {
    const before = initialBalancingState();
    const { state } = feed(before, [sample({ cellsMv: [0, 0, 0], chargingIn: true })]);
    expect(state).toBe(before);
  });
});

describe('family adapters', () => {
  const clock = { at: 1_700_000_000_000, monotonicAt: 0 };

  describe('B2500', () => {
    // cd=13, real shape: a0-af in mV, 14 populated and two empty slots.
    const cellPayload =
      'a0=3301,a1=3302,a2=3300,a3=3303,a4=3299,a5=3301,a6=3302,a7=3300,' +
      'a8=3301,a9=3300,aa=3302,ab=3301,ac=3300,ad=3303,ae=0,af=0';

    const cellState = () => parseMessage(cellPayload, 'HMA-1', 'dev')['cells'];

    it('converts volts back to millivolts and drops the empty slots', () => {
      const sampleOut = extractB2500Sample({ cells: cellState() }, clock)!;
      const stats = computeCellStats(sampleOut.cellsMv)!;
      expect(stats.count).toBe(14);
      expect(stats.minMv).toBeCloseTo(3299, 6);
      expect(stats.maxMv).toBeCloseTo(3303, 6);
    });

    it('prefers the pack status flag for charging state', () => {
      const data = { packStatus: { host: { charging: true } }, solarInputStatus: {} };
      expect(extractB2500Sample({ cells: cellState(), data }, clock)!.chargingIn).toBe(true);
    });

    it('falls back to solar input state on firmware without l0', () => {
      const data = { solarInputStatus: { input1Charging: false, input2Charging: true } };
      expect(extractB2500Sample({ cells: cellState(), data }, clock)!.chargingIn).toBe(true);
    });

    it('leaves charging unknown when neither source is present', () => {
      expect(extractB2500Sample({ cells: cellState() }, clock)!.chargingIn).toBeUndefined();
    });

    it('reports how stale the cross-message inputs are', () => {
      const cells = { ...cellState(), timestamp: '2026-08-06T12:00:00.000Z' };
      const data = { timestamp: '2026-08-05T11:59:00.000Z' } as any;
      const withData = extractB2500Sample(
        { cells, data: { ...data, timestamp: '2026-08-06T11:59:00.000Z' } },
        clock,
      )!;
      expect(withData.staleMs).toBe(60000);
    });

    it('returns nothing when no cell data has arrived', () => {
      expect(extractB2500Sample({}, clock)).toBeUndefined();
    });
  });

  describe('Venus', () => {
    // cd=14 sample straight from the firmware, cells already in mV.
    const bmsPayload =
      'b_ver=212,b_chv=571,b_rci=1000,b_rdi=1000,b_soc=65,b_soh=100,b_cap=5120,b_vol=5223,' +
      'b_cur=-94,b_tem=250,b_chf=192,b_slf=0,b_cpc=332,b_err=0,b_war=0,b_ret=102482070,' +
      'b_ent=0,b_mot=23,b_tp1=18,b_tp2=19,b_tp3=18,b_tp4=19,' +
      'b_vo1=3265,b_vo2=3265,b_vo3=3265,b_vo4=3265,b_vo5=3264,b_vo6=3264,b_vo7=3265,b_vo8=3265,' +
      'b_vo9=3264,b_vo10=3265,b_vo11=3264,b_vo12=3265,b_vo13=3265,b_vo14=3265,b_vo15=3264,b_vo16=3262';

    const bmsState = () => parseMessage(bmsPayload, 'VNSE3-0', 'dev')['bms'];

    it('takes cell voltages as millivolts unchanged', () => {
      const sampleOut = extractVenusSample({ bms: bmsState() }, clock)!;
      const stats = computeCellStats(sampleOut.cellsMv)!;
      expect(stats.count).toBe(16);
      expect(stats.minMv).toBe(3262);
      expect(stats.maxMv).toBe(3265);
      expect(stats.spreadMv).toBe(3);
    });

    it('reads b_cur as deci-amps and infers discharge', () => {
      const sampleOut = extractVenusSample({ bms: bmsState() }, clock)!;
      expect(sampleOut.packCurrentA).toBeCloseTo(-9.4, 6);
      expect(sampleOut.chargingIn).toBe(false);
    });

    it('carries no staleness, because everything is in one message', () => {
      expect(extractVenusSample({ bms: bmsState() }, clock)!.staleMs).toBe(0);
    });

    it('reads current from the payload, not from the sensor field', () => {
      // The parsed `bms.current` field drives a sensor, and its scale is a
      // presentation decision that can be corrected independently. If this read
      // the field instead of the raw value, such a correction would silently
      // rescale the current gate and the charging threshold.
      const state = bmsState() as any;
      state.bms.current = -9.4; // as if the sensor had been rescaled to amps
      expect(extractVenusSample({ bms: state }, clock)!.packCurrentA).toBeCloseTo(-9.4, 6);
    });

    it('leaves current unknown when the payload does not carry it', () => {
      const state = bmsState() as any;
      delete state.values.b_cur;
      const sampleOut = extractVenusSample({ bms: state }, clock)!;
      expect(sampleOut.packCurrentA).toBeUndefined();
      expect(sampleOut.chargingIn).toBeUndefined();
    });

    it('picks up state of charge and the warmest cell temperature', () => {
      const sampleOut = extractVenusSample({ bms: bmsState() }, clock)!;
      expect(sampleOut.socPct).toBe(65); // b_soc
      expect(sampleOut.tempC).toBe(19); // max of b_tp1-b_tp4
    });

    it('returns nothing when no BMS data has arrived', () => {
      expect(extractVenusSample({}, clock)).toBeUndefined();
    });
  });
});
