/**
 * Transform a time string (e.g., "0:0" to "00:00")
 */
export const transformTimeString = (value: string): string => {
  const parts = value.split(':');
  if (parts.length !== 2) return '00:00';

  const hours = parts[0].padStart(2, '0');
  const minutes = parts[1].padStart(2, '0');
  return `${hours}:${minutes}`;
};
export const transformBitBoolean = (bit: number) => (value: string) =>
  Boolean(Number(value) & (1 << bit));
export const transformBoolean = transformBitBoolean(0);

export const transformNumber = (value: string) => {
  const number = parseFloat(value);
  return isNaN(number) ? 0 : number;
};

/**
 * Converts the value exposed through MQTT to a temperature. It looks like the
 * device sends a signed temperature as an unsigned 8-bit integer (`uint8`).
 * This function converts that value back.
 *
 * @param value - The temperature coming from MQTT
 * @returns The temperature in degrees Celsius
 */
export const transformTemperature = (value: string) => {
  const number = transformNumber(value);

  // Out of `uint8` bounds - return as is
  if (number < 0 || number > 255) {
    return number;
  }

  // Convert uint8 to int8
  if (number > 127) {
    return number - 256;
  }
  return number;
};
