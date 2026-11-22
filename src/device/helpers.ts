/**
 * Legacy transform functions.
 *
 * These functions are kept for backward compatibility with existing device definitions.
 * New code should prefer using declarative transforms from '../transforms.js' which can be
 * introspected and converted to Jinja2 templates for Home Assistant discovery.
 *
 * @see ../transforms.ts for the declarative transform library
 */

import {
  executeTransform,
  number,
  bitBoolean as bitBooleanTransform,
  temperature,
  timeString,
} from '../transforms.js';

/**
 * Transform a time string (e.g., "0:0" to "00:00")
 * @deprecated Use `timeString()` from '../transforms.js' for declarative transforms
 */
export const transformTimeString = (value: string): string => {
  return executeTransform(timeString(), value) as string;
};

/**
 * Extract a specific bit as a boolean
 * @deprecated Use `bitBoolean(bit)` from '../transforms.js' for declarative transforms
 */
export const transformBitBoolean = (bit: number) => (value: string) =>
  executeTransform(bitBooleanTransform(bit), value) as boolean;

/**
 * Extract bit 0 as a boolean
 * @deprecated Use `boolean()` from '../transforms.js' for declarative transforms
 */
export const transformBoolean = transformBitBoolean(0);

/**
 * Parse string to number with NaN fallback to 0
 * @deprecated Use `number()` from '../transforms.js' for declarative transforms
 */
export const transformNumber = (value: string) => {
  return executeTransform(number(), value) as number;
};

/**
 * Converts the value exposed through MQTT to a temperature. It looks like the
 * device sends a signed temperature as an unsigned 8-bit integer (`uint8`).
 * This function converts that value back.
 *
 * @param value - The temperature coming from MQTT
 * @returns The temperature in degrees Celsius
 * @deprecated Use `temperature()` from '../transforms.js' for declarative transforms
 */
export const transformTemperature = (value: string) => {
  return executeTransform(temperature(), value) as number;
};

/** The Venus models that share the gen-1 Venus device definitions. */
export type VenusModel = 'HMG' | 'VNSE3' | 'VNSA' | 'VNSD';

/**
 * Normalise a Venus control firmware build reported as `dev_n`.
 *
 * Most builds report three digits (`156`), but point builds report four, with
 * the last digit after the point: firmware 158.1 reports `dev_n=1581`.
 *
 * @returns The build as a number (`156`, `158.1`), or `undefined` when unknown
 */
export function venusBuild(deviceVersion: number | undefined): number | undefined {
  if (deviceVersion == null || !Number.isFinite(deviceVersion) || deviceVersion <= 0) {
    return undefined;
  }
  return deviceVersion >= 1000 ? deviceVersion / 10 : deviceVersion;
}

/**
 * Whether a Venus model and build support a feature.
 *
 * `thresholds` gives the first build of each model with the feature. A model
 * missing from it never has the feature (`false`), and a threshold of `0` means
 * every build has it (`true`), so neither needs any device data. Otherwise the
 * build decides, and an unknown build gives `undefined`. Every threshold is
 * open-ended: newer builds keep the feature.
 */
export function venusSupports(
  model: VenusModel,
  deviceVersion: number | undefined,
  thresholds: Partial<Record<VenusModel, number>>,
): boolean | undefined {
  const threshold = thresholds[model];
  if (threshold === undefined) return false;
  if (threshold === 0) return true;
  const build = venusBuild(deviceVersion);
  return build === undefined ? undefined : build >= threshold;
}
