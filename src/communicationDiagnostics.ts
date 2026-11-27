import type { Device } from './types.js';

export interface CommunicationStats {
  totalTimeouts: number;
  consecutiveTimeouts: number;
  receivedMessages: number;
  lastMessageAt: string | null;
  lastTimeoutAt: string | null;
}

export class CommunicationDiagnostics {
  private readonly stats = new Map<string, CommunicationStats>();

  private getDeviceKey(device: Device): string {
    return `${device.deviceType}:${device.deviceId}`;
  }

  private getOrCreate(device: Device): CommunicationStats {
    const key = this.getDeviceKey(device);
    let stats = this.stats.get(key);

    if (!stats) {
      stats = {
        totalTimeouts: 0,
        consecutiveTimeouts: 0,
        receivedMessages: 0,
        lastMessageAt: null,
        lastTimeoutAt: null,
      };

      this.stats.set(key, stats);
    }

    return stats;
  }

  recordTimeout(device: Device, timestamp = Date.now()): CommunicationStats {
    const stats = this.getOrCreate(device);
    stats.totalTimeouts++;
    stats.consecutiveTimeouts++;
    stats.lastTimeoutAt = new Date(timestamp).toISOString();

    return { ...stats };
  }

  recordMessage(device: Device, timestamp = Date.now()): CommunicationStats {
    const stats = this.getOrCreate(device);
    stats.receivedMessages++;
    stats.consecutiveTimeouts = 0;
    stats.lastMessageAt = new Date(timestamp).toISOString();

    return { ...stats };
  }

  getSnapshot(device: Device): CommunicationStats {
    return { ...this.getOrCreate(device) };
  }
}
