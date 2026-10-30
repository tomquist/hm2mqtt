import '../device/registry.js';
import { parseMessage } from '../parser.js';
import type { VenusMiniDeviceData } from '../types.js';
import { miniRuntimePayload } from './venusMiniSchedule.js';

const time = process.argv[2];
if (!time) {
  throw new Error('A device-local time is required');
}
const receivedAt = process.argv[3] ? Date.parse(process.argv[3]) : Date.now();
if (!Number.isFinite(receivedAt)) {
  throw new Error('A valid reception timestamp is required');
}
Date.now = () => receivedAt;
const data = parseMessage(
  miniRuntimePayload([], new Date(receivedAt), { time }),
  'VNSEMINI-0',
  'timezone-test',
).data as VenusMiniDeviceData;
console.log(JSON.stringify({ deviceTime: data.deviceTime }));
