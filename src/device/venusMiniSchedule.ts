import type {
  ControlPublishOptions,
  DeviceControlSession,
  DeviceControlSessionContext,
} from '../controlHandler.js';
import { globalPollInterval } from '../deviceDefinition.js';
import logger from '../logger.js';
import { parseMessage } from '../parser.js';
import type {
  VenusMiniDeviceData,
  VenusMiniScheduleData,
  VenusMiniTimePeriod,
  WeekdaySet,
} from '../types.js';

export const MINI_SCHEDULE_POWER_MAX = 1500;
export const MINI_SCHEDULE_ACK_TIMEOUT = 15000;
export const MINI_SCHEDULE_TELEMETRY_TIMEOUT = 150000;
export const MINI_SCHEDULE_FRESH_AGE = Math.max(globalPollInterval + 15000, 90000);
export const MINI_SCHEDULE_MAX_AGE = Math.max(
  2 * globalPollInterval + 30000,
  MINI_SCHEDULE_TELEMETRY_TIMEOUT,
);
export const MINI_SCHEDULE_COOLDOWN = 10000;
const HEALTH_SAMPLES = 3;
const directions = { charge: 1, discharge: 2, selfConsumption: 3 } as const;

function formatTime(time: string | undefined): string | undefined {
  const match = time && /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}

function minutes(time: string | undefined): number | undefined {
  const formatted = formatTime(time);
  if (!formatted) {
    return undefined;
  }
  const [hour, minute] = formatted.split(':').map(Number);
  return hour * 60 + minute;
}

export function buildMiniScheduleCommand(
  slot: number,
  period: VenusMiniTimePeriod,
): string | undefined {
  const start = minutes(period.startTime);
  const end = minutes(period.endTime);
  if (
    typeof period.enabled !== 'boolean' ||
    period.power == null ||
    !Number.isInteger(period.power) ||
    period.power < 0 ||
    period.power > MINI_SCHEDULE_POWER_MAX ||
    !period.direction ||
    !Object.prototype.hasOwnProperty.call(directions, period.direction) ||
    start == null ||
    end == null ||
    start >= end ||
    period.repeatRaw == null ||
    !Number.isInteger(period.repeatRaw) ||
    period.repeatRaw < 1 ||
    period.repeatRaw > 127
  ) {
    return undefined;
  }
  const direction = directions[period.direction as keyof typeof directions];
  return `cd=${46 + slot},m${slot}=${period.enabled ? 1 : 0},mp${slot}=${period.power},ms${slot}=${direction},st${slot}=${formatTime(period.startTime)},et${slot}=${formatTime(period.endTime)},re${slot}=${period.repeatRaw}`;
}

export function miniSchedulesOverlap(
  first: VenusMiniTimePeriod,
  second: VenusMiniTimePeriod,
): boolean {
  const firstStart = minutes(first.startTime);
  const firstEnd = minutes(first.endTime);
  const secondStart = minutes(second.startTime);
  const secondEnd = minutes(second.endTime);
  return (
    firstStart != null &&
    firstEnd != null &&
    secondStart != null &&
    secondEnd != null &&
    ((first.repeatRaw ?? 0) & (second.repeatRaw ?? 0)) !== 0 &&
    firstStart < secondEnd &&
    secondStart < firstEnd
  );
}

function fingerprint(period: VenusMiniTimePeriod): string {
  return JSON.stringify([
    period.enabled,
    period.power,
    period.direction,
    formatTime(period.startTime),
    formatTime(period.endTime),
    period.repeatRaw,
  ]);
}

interface PendingWrite {
  slot: number;
  period: VenusMiniTimePeriod;
  baseline: string[];
  phase: 'preflight' | 'acknowledgement' | 'verification';
  namespace: ControlPublishOptions['namespace'];
  clock: number;
}

export class VenusMiniScheduleSession implements DeviceControlSession {
  private state: Omit<VenusMiniScheduleData, 'deviceType' | 'deviceId' | 'timestamp' | 'values'> = {
    drafts: Array.from({ length: 6 }, () => ({
      enabled: false,
      power: 0,
      direction: 'charge',
      startTime: '00:00',
      endTime: '00:00',
      repeatRaw: 0,
      weekday: '',
    })),
    controlsEnabled: false,
    status: 'Waiting for healthy telemetry',
    lastError: '',
  };
  private dirty = new Set<number>();
  private draftBaseline = new Map<number, string>();
  private runtime?: VenusMiniDeviceData;
  private namespace?: ControlPublishOptions['namespace'];
  private lastReceivedAt = 0;
  private lastAdvancedAt = 0;
  private lastClock?: number;
  private samples = 0;
  private pending?: PendingWrite;
  private timeout?: NodeJS.Timeout;
  private watchdog?: NodeJS.Timeout;
  private cooldownUntil = 0;
  private locked = false;

  constructor(private context: DeviceControlSessionContext) {}

  private emit(): void {
    const update: Partial<VenusMiniScheduleData> = {
      ...this.state,
      drafts: this.state.drafts.map(period => ({ ...period })),
    };
    this.context.updateState('schedule', update);
  }

  private warn(message: string): void {
    logger.warn(`Venus E Mini ${this.context.device.deviceId}: ${message}`);
    this.state.lastError = message;
    this.emit();
  }

  private fail(message: string): void {
    clearTimeout(this.timeout);
    clearTimeout(this.watchdog);
    this.pending = undefined;
    this.locked = true;
    this.samples = 0;
    this.state.controlsEnabled = false;
    this.state.status = 'Locked: refresh telemetry and explicitly re-enable';
    this.warn(message);
  }

  private healthy(): boolean {
    return (
      this.samples >= HEALTH_SAMPLES &&
      Date.now() - this.lastReceivedAt < MINI_SCHEDULE_FRESH_AGE &&
      Date.now() - this.lastAdvancedAt < MINI_SCHEDULE_FRESH_AGE
    );
  }

  private armWatchdog(): void {
    clearTimeout(this.watchdog);
    if (!this.state.controlsEnabled) {
      return;
    }
    const now = Date.now();
    const age = Math.max(now - this.lastReceivedAt, now - this.lastAdvancedAt);
    if (age >= MINI_SCHEDULE_MAX_AGE) {
      logger.warn(
        {
          deviceId: this.context.device.deviceId,
          telemetryAgeMs: now - this.lastReceivedAt,
          clockProgressAgeMs: now - this.lastAdvancedAt,
          deviceTime: this.runtime?.deviceTime,
        },
        'Schedule telemetry watchdog expired',
      );
      this.fail('Telemetry or device clock stopped advancing; schedule writes blocked');
      return;
    }
    if (age >= MINI_SCHEDULE_FRESH_AGE) {
      this.state.status = this.pending
        ? `Waiting for fresh telemetry (${this.pending.phase}, slot ${this.pending.slot})`
        : 'Waiting for fresh telemetry';
      this.emit();
    }
    const nextDeadline =
      age < MINI_SCHEDULE_FRESH_AGE ? MINI_SCHEDULE_FRESH_AGE : MINI_SCHEDULE_MAX_AGE;
    this.watchdog = setTimeout(() => this.armWatchdog(), Math.max(1, nextDeadline - age));
    this.watchdog.unref();
  }

  private publish(payload: string, namespace: ControlPublishOptions['namespace']): Promise<void> {
    return this.context.publish(payload, { namespace, automaticRefresh: false });
  }

  receive(message: string, namespace: ControlPublishOptions['namespace'], retained: boolean): void {
    if (retained) {
      return;
    }
    const acknowledgement = /^cd(4[7-9]|5[0-2])=([^,]+)$/.exec(message.trim());
    if (acknowledgement) {
      const pending = this.pending;
      if (
        !pending ||
        pending.phase !== 'acknowledgement' ||
        namespace !== pending.namespace ||
        Number(acknowledgement[1]) !== 46 + pending.slot
      ) {
        return;
      }
      if (acknowledgement[2] !== 'ok') {
        this.fail(`Schedule slot ${pending.slot} was rejected: ${acknowledgement[2]}`);
        return;
      }
      clearTimeout(this.timeout);
      pending.phase = 'verification';
      this.state.status = `Verifying slot ${pending.slot}`;
      this.emit();
      this.timeout = setTimeout(() => {
        if (this.pending === pending) {
          this.fail(`Schedule slot ${pending.slot} read-back timed out`);
        }
      }, MINI_SCHEDULE_TELEMETRY_TIMEOUT);
      this.timeout.unref();
      void this.publish('cd=01', namespace).catch(error => {
        if (this.pending === pending) {
          this.fail(`Schedule refresh failed: ${String(error)}`);
        }
      });
      return;
    }

    const data = parseMessage(message, this.context.device.deviceType, this.context.device.deviceId)
      .data as VenusMiniDeviceData | undefined;
    if (!data) {
      if (/(^|,)(gp|soc|m1|time)=/.test(message)) {
        this.fail('Incomplete or invalid runtime telemetry');
      }
      return;
    }
    if (this.pending && namespace !== this.pending.namespace) {
      // The other namespace can carry a duplicate or delayed copy of the same response.
      return;
    }
    const values = data.values;
    const completeSlots = Array.from({ length: 6 }, (_, index) => index + 1).every(slot =>
      ['m', 'mp', 'ms', 'st', 'et', 're'].every(key => values[`${key}${slot}`] != null),
    );
    const clock = data.deviceTime && Date.parse(data.deviceTime);
    if (
      data.deviceTime?.endsWith('Z') &&
      typeof clock === 'number' &&
      Number.isFinite(clock) &&
      this.lastClock != null &&
      clock < this.lastClock
    ) {
      logger.debug(
        {
          deviceId: this.context.device.deviceId,
          deviceTime: data.deviceTime,
          lastAcceptedClock: this.lastClock,
        },
        'Ignoring older schedule telemetry snapshot',
      );
      this.armWatchdog();
      return;
    }
    if (
      !completeSlots ||
      !data.deviceTime?.endsWith('Z') ||
      typeof clock !== 'number' ||
      !Number.isFinite(clock) ||
      data.batterySoc == null ||
      !Number.isFinite(data.batterySoc) ||
      data.batterySoc < 0 ||
      data.batterySoc > 100 ||
      data.batteryPower == null ||
      !Number.isFinite(data.batteryPower) ||
      !['soc', 'dpt', 'gp'].every(key => /^-?\d+(?:\.\d+)?$/.test(values[key] ?? '')) ||
      values.wif_s !== '1' ||
      values.mq_s !== '1' ||
      data.deviceState === 'fault' ||
      !['0', '2', '3'].includes(values.cm) ||
      !data.timePeriods?.every(
        (period, index) =>
          ['0', '1'].includes(values[`m${index + 1}`]) &&
          /^\d+$/.test(values[`mp${index + 1}`]) &&
          Number.isInteger(period.power) &&
          period.power! >= 0 &&
          period.power! <= MINI_SCHEDULE_POWER_MAX &&
          formatTime(period.startTime) != null &&
          formatTime(period.endTime) != null &&
          Number.isInteger(period.repeatRaw) &&
          /^\d+$/.test(values[`re${index + 1}`]) &&
          period.repeatRaw! >= 0 &&
          period.repeatRaw! <= 127 &&
          ['0', '1', '2', '3'].includes(values[`ms${index + 1}`]) &&
          (!period.enabled || buildMiniScheduleCommand(index + 1, period) != null),
      )
    ) {
      this.fail('Incomplete or invalid runtime telemetry');
      return;
    }

    const now = Date.now();
    const recovering = this.state.controlsEnabled && !this.healthy();
    if (clock === this.lastClock) {
      this.lastReceivedAt = now;
      logger.debug(
        { deviceId: this.context.device.deviceId, deviceTime: data.deviceTime },
        'Ignoring cached schedule telemetry snapshot',
      );
      this.armWatchdog();
      return;
    }
    if (
      this.lastClock != null &&
      (clock - this.lastClock > now - this.lastAdvancedAt + MINI_SCHEDULE_TELEMETRY_TIMEOUT ||
        (!this.locked && now - this.lastAdvancedAt >= MINI_SCHEDULE_MAX_AGE))
    ) {
      logger.warn(
        {
          deviceId: this.context.device.deviceId,
          telemetryAgeMs: now - this.lastReceivedAt,
          clockProgressAgeMs: now - this.lastAdvancedAt,
          deviceClockAdvanceMs: clock - this.lastClock,
          deviceTime: data.deviceTime,
        },
        'Schedule telemetry continuity check failed',
      );
      this.fail('Stale telemetry or discontinuous device clock');
      this.lastClock = undefined;
    }
    const clockAdvanced = this.lastClock == null || clock > this.lastClock;
    if (clockAdvanced) {
      this.samples++;
      this.lastAdvancedAt = now;
    }
    this.lastClock = clock;
    this.lastReceivedAt = now;
    this.runtime = data;
    this.namespace = namespace;

    const periods = data.timePeriods!;
    for (let index = 0; index < 6; index++) {
      if (this.dirty.has(index)) {
        if (!this.draftBaseline.has(index)) {
          this.draftBaseline.set(index, fingerprint(periods[index]));
        }
      } else if (this.pending?.slot !== index + 1) {
        const period = periods[index];
        this.state.drafts[index] = {
          ...period,
          direction: period.direction === 'unknown' ? 'charge' : period.direction,
        };
      }
    }

    const pending = this.pending;
    if (pending) {
      const changedOtherSlot = periods.some(
        (period, index) =>
          index !== pending.slot - 1 && fingerprint(period) !== pending.baseline[index],
      );
      if (changedOtherSlot || data.workingMode !== 'manual') {
        this.fail('Device configuration changed during Apply; use only one schedule editor');
        return;
      }
      if (pending.phase === 'preflight') {
        if (fingerprint(periods[pending.slot - 1]) !== pending.baseline[pending.slot - 1]) {
          this.fail('Slot changed during preflight; reset the draft before editing again');
          return;
        }
        if (clockAdvanced && this.healthy()) {
          pending.clock = clock;
          this.sendWrite(pending);
        }
      }
      if (
        pending.phase === 'acknowledgement' &&
        fingerprint(periods[pending.slot - 1]) !== pending.baseline[pending.slot - 1] &&
        fingerprint(periods[pending.slot - 1]) !== fingerprint(pending.period)
      ) {
        this.fail('Target slot changed unexpectedly while waiting for acknowledgement');
        return;
      }
      if (pending.phase === 'verification') {
        if (clock <= pending.clock) {
          this.armWatchdog();
          this.emit();
          return;
        }
        if (fingerprint(periods[pending.slot - 1]) !== fingerprint(pending.period)) {
          logger.debug(
            { deviceId: this.context.device.deviceId, slot: pending.slot },
            'Schedule read-back is not confirmed yet; waiting without retry',
          );
          this.state.status = `Waiting for slot ${pending.slot} read-back`;
          this.armWatchdog();
          this.emit();
          return;
        }
        clearTimeout(this.timeout);
        this.pending = undefined;
        this.cooldownUntil = now + MINI_SCHEDULE_COOLDOWN;
        this.dirty.delete(pending.slot - 1);
        this.draftBaseline.delete(pending.slot - 1);
        this.state.drafts[pending.slot - 1] = { ...periods[pending.slot - 1] };
        this.state.status = `Slot ${pending.slot} verified; cooldown`;
        this.state.lastError = '';
        this.timeout = setTimeout(() => {
          if (!this.pending && this.state.controlsEnabled && this.healthy()) {
            this.state.status = 'Ready';
            this.emit();
          }
        }, MINI_SCHEDULE_COOLDOWN);
        this.timeout.unref();
      }
    } else if (!this.locked) {
      this.state.status = this.healthy()
        ? this.state.controlsEnabled
          ? now < this.cooldownUntil
            ? 'Cooldown'
            : 'Ready'
          : 'Healthy; controls disabled'
        : this.state.controlsEnabled
          ? 'Waiting for fresh telemetry'
          : 'Waiting for healthy telemetry';
      if (recovering && this.healthy()) {
        this.state.lastError = '';
      }
    }
    this.armWatchdog();
    this.emit();
  }

  handleCommand(command: string, message: string, retained: boolean): boolean {
    if (!command.startsWith('schedule/')) {
      if (command === 'restart') {
        if (retained) {
          this.warn('Retained restart commands are ignored');
          return true;
        }
        if (!['true', '1', 'press'].includes(message.toLowerCase())) {
          return false;
        }

        const namespace = this.namespace;
        this.fail('Battery restart requested; schedule controls disabled');
        this.lastClock = undefined;
        if (!namespace) {
          this.warn('Restart not sent: no live device MQTT namespace has been observed');
          return true;
        }
        void this.publish('cd=61,rst=1', namespace).catch(error => {
          this.warn(`Restart publish failed: ${String(error)}`);
        });
        return true;
      }
      if (this.pending && !['refresh', 'get-ct-power', 'restart'].includes(command)) {
        this.warn('Apply is pending; other device writes are blocked');
        return true;
      }
      return false;
    }
    if (retained) {
      this.warn('Retained schedule commands are ignored');
      return true;
    }
    if (command === 'schedule/controls-enabled') {
      if (!['true', 'false'].includes(message)) {
        this.warn('Invalid schedule controls enabled value');
      } else if (message === 'false') {
        if (this.pending) {
          this.fail(
            'Controls disabled during Apply; the command may already have reached the device',
          );
        } else {
          this.state.controlsEnabled = false;
          this.state.status = 'Controls disabled';
          clearTimeout(this.watchdog);
          this.emit();
        }
      } else if (this.pending || !this.healthy()) {
        this.warn(
          'Three fresh, advancing runtime samples are required before enabling controls. With a 60-second relay, this can take about 3 minutes.',
        );
      } else {
        this.locked = false;
        this.state.controlsEnabled = true;
        this.state.status = 'Ready';
        this.state.lastError = '';
        this.armWatchdog();
        this.emit();
      }
      return true;
    }
    const match =
      /^schedule\/([1-6])\/(enabled|power|direction|start-time|end-time|weekday|apply|reset)$/.exec(
        command,
      );
    if (!match) {
      this.warn(`Unknown schedule command: ${command}`);
      return true;
    }
    const slot = Number(match[1]);
    const index = slot - 1;
    const field = match[2];
    if (this.pending) {
      this.warn('An Apply is already pending; commands are not queued');
      return true;
    }
    if (field === 'reset') {
      if (message !== 'PRESS' || !this.runtime) {
        this.warn('Reset requires PRESS and current runtime telemetry');
        return true;
      }
      this.dirty.delete(index);
      this.draftBaseline.delete(index);
      const period = this.runtime.timePeriods![index];
      this.state.drafts[index] = {
        ...period,
        direction: period.direction === 'unknown' ? 'charge' : period.direction,
      };
      this.state.lastError = '';
      this.emit();
      return true;
    }
    if (field === 'apply') {
      if (message !== 'PRESS') {
        this.warn('Apply requires PRESS');
      } else {
        this.apply(slot);
      }
      return true;
    }

    let update: Partial<VenusMiniTimePeriod>;
    if (
      field === 'enabled' &&
      ['true', 'false', 'on', 'off', '1', '0'].includes(message.toLowerCase())
    ) {
      update = { enabled: ['true', 'on', '1'].includes(message.toLowerCase()) };
    } else if (
      field === 'power' &&
      /^\d+$/.test(message) &&
      Number.isInteger(Number(message)) &&
      Number(message) <= MINI_SCHEDULE_POWER_MAX
    ) {
      update = { power: Number(message) };
    } else if (field === 'direction' && Object.prototype.hasOwnProperty.call(directions, message)) {
      update = { direction: message as keyof typeof directions };
    } else if ((field === 'start-time' || field === 'end-time') && formatTime(message)) {
      update =
        field === 'start-time'
          ? { startTime: formatTime(message) }
          : { endTime: formatTime(message) };
    } else if (field === 'weekday' && /^0?1?2?3?4?5?6?$/.test(message)) {
      update = {
        weekday: message as WeekdaySet,
        repeatRaw: message.split('').reduce((mask, day) => mask | (1 << Number(day)), 0),
      };
    } else {
      this.warn(`Invalid schedule ${field} value: ${message}`);
      return true;
    }
    if (!this.dirty.has(index) && this.runtime) {
      this.draftBaseline.set(index, fingerprint(this.runtime.timePeriods![index]));
    }
    this.dirty.add(index);
    this.state.drafts[index] = { ...this.state.drafts[index], ...update };
    this.state.lastError = '';
    this.emit();
    return true;
  }

  private apply(slot: number): void {
    if (this.locked || !this.state.controlsEnabled) {
      this.warn('Schedule controls are disabled or locked');
      return;
    }
    if (!this.healthy() || !this.runtime || !this.namespace) {
      this.state.status = 'Waiting for fresh telemetry';
      this.warn('Fresh advancing telemetry is required for Apply; try again when Ready');
      this.armWatchdog();
      return;
    }
    if (Date.now() < this.cooldownUntil) {
      this.warn('Schedule cooldown is active; Apply again after ten seconds');
      return;
    }
    if (this.runtime.workingMode !== 'manual') {
      this.warn('Apply requires the battery to be in Manual mode');
      return;
    }
    const index = slot - 1;
    const periods = this.runtime.timePeriods!;
    const baseline = this.draftBaseline.get(index);
    if (baseline != null && baseline !== fingerprint(periods[index])) {
      this.warn(`Slot ${slot} changed on the device; reset the draft before editing again`);
      return;
    }
    const period = { ...this.state.drafts[index] };
    const payload = buildMiniScheduleCommand(slot, period);
    if (!payload) {
      this.warn(`Slot ${slot} requires complete fields, weekdays and a same-day time range`);
      return;
    }
    const missing = periods
      .slice(0, index)
      .findIndex((previous, i) => !buildMiniScheduleCommand(i + 1, previous));
    if (missing >= 0) {
      this.warn(`Schedule slot ${slot} cannot be configured before slot ${missing + 1}`);
      return;
    }
    const overlap = periods.findIndex(
      (other, i) =>
        i !== index &&
        buildMiniScheduleCommand(i + 1, other) != null &&
        miniSchedulesOverlap(period, other),
    );
    if (overlap >= 0) {
      this.warn(`Schedule slot ${slot} overlaps with slot ${overlap + 1}`);
      return;
    }
    const invalidOtherSlot = periods.findIndex(
      (other, i) =>
        i !== index &&
        (other.enabled || other.modeRaw !== 0 || other.repeatRaw !== 0) &&
        !buildMiniScheduleCommand(i + 1, other),
    );
    if (invalidOtherSlot >= 0) {
      this.warn(
        `Slot ${invalidOtherSlot + 1} has an unsupported configuration; resolve it before Apply`,
      );
      return;
    }
    const pending: PendingWrite = {
      slot,
      period,
      baseline: periods.map(fingerprint),
      phase: 'preflight',
      namespace: this.namespace,
      clock: this.lastClock!,
    };
    this.pending = pending;
    this.state.status = `Refreshing telemetry before slot ${slot} Apply`;
    this.state.lastError = '';
    this.emit();
    this.timeout = setTimeout(() => {
      if (this.pending === pending) {
        this.fail(`Schedule slot ${slot} preflight timed out; no automatic retry`);
      }
    }, MINI_SCHEDULE_TELEMETRY_TIMEOUT);
    this.timeout.unref();
    void this.publish('cd=01', pending.namespace).catch(error => {
      if (this.pending === pending) {
        this.fail(`Schedule preflight refresh failed: ${String(error)}`);
      }
    });
  }

  private sendWrite(pending: PendingWrite): void {
    const payload = buildMiniScheduleCommand(pending.slot, pending.period);
    if (!payload) {
      this.fail('Schedule draft became invalid before publishing');
      return;
    }
    clearTimeout(this.timeout);
    pending.phase = 'acknowledgement';
    this.state.status = `Waiting for slot ${pending.slot} acknowledgement`;
    this.emit();
    this.timeout = setTimeout(() => {
      if (this.pending === pending) {
        this.fail(`Schedule slot ${pending.slot} acknowledgement timed out; no automatic retry`);
      }
    }, MINI_SCHEDULE_ACK_TIMEOUT);
    this.timeout.unref();
    void this.publish(payload, pending.namespace).catch(error => {
      if (this.pending === pending) {
        this.fail(`Schedule publish failed: ${String(error)}`);
      }
    });
  }

  disconnect(): void {
    clearTimeout(this.timeout);
    clearTimeout(this.watchdog);
    this.fail('MQTT connection lost; controls disabled');
    this.runtime = undefined;
    this.namespace = undefined;
    this.lastClock = undefined;
    this.lastReceivedAt = 0;
    this.lastAdvancedAt = 0;
  }
}
