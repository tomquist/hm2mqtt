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
