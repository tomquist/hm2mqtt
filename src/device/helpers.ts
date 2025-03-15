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
