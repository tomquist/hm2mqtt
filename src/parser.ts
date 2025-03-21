import { B2500V2DeviceData } from './types';
import {
  KeyPath,
  BaseDeviceData,
  getDeviceDefinition,
  FieldDefinition,
  TypeAtPath,
} from './deviceDefinition';
import { transformNumber } from './device/helpers';

/**
 * Parse the incoming MQTT message and transform it into the required format
 *
 * @param message - The raw message payload as a string (comma-separated key-value pairs)
 * @param deviceType - The device type extracted from the topic
 * @param deviceId - The device ID extracted from the topic
 * @returns The parsed data object
 */
export function parseMessage(
  message: string,
  deviceType: string,
  deviceId: string,
): Record<string, BaseDeviceData> {
  const deviceDefinition = getDeviceDefinition(deviceType);
  try {
    // Parse the comma-separated key-value pairs
    const pairs = message.split(',');
    const values: Record<string, string> = {};

    // Process each key-value pair
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      values[key] = value;
    }

    let result: Record<string, BaseDeviceData> = {};
    for (const messageDefinition of deviceDefinition?.messages ?? []) {
      if (messageDefinition.isMessage(values)) {
        // Create the base parsed data object
        const parsedData: BaseDeviceData = {
          deviceType,
          deviceId,
          timestamp: new Date().toISOString(),
          values,
        };

        // Apply the device status message definition
        applyMessageDefinition(parsedData, values, messageDefinition?.fields ?? []);
        result[messageDefinition.publishPath] = parsedData;
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing message:', error);
    throw new Error(
      `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function applyMessageDefinition<T extends BaseDeviceData>(
  parsedData: T,
  values: Record<string, string>,
  fields: FieldDefinition<T, KeyPath<T>>[],
): void {
  for (const field of fields) {
    let key = field.key;
    if (typeof key === 'string') {
      let transform = field.transform ?? transformNumber;
      let value = values[key];
      if (value != null) {
        const transformedValue = transform(value);
        setValueAtPath(parsedData, field.path, transformedValue);
      }
    } else if (field.transform != null) {
      let entries = key.map(key => [key, values[key]] as const);
      if (entries.every(([, value]) => value !== undefined)) {
        const transformedValue = field.transform(Object.fromEntries(entries));
        setValueAtPath(parsedData, field.path, transformedValue);
      } else {
        console.warn(`Some values are missing for field ${field.path.join('.')}`);
      }
    } else {
      console.warn(`No transform function provided for field ${field.path.join('.')}`);
    }
  }
}

/**
 * Set a value at a specific path in an object
 *
 * @param obj - The object to modify
 * @param path - The path to set the value at
 * @param value - The value to set
 */
function setValueAtPath<T>(obj: T, path: KeyPath<T>, value: any): void {
  let current = obj as any;

  // Navigate to the second-to-last element in the path
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    // Create the object if it doesn't exist
    if (current[key] === undefined) {
      // If the next key is a number or can be parsed as a number, create an array
      const nextKey = path[i + 1];
      const isNextKeyNumeric =
        typeof nextKey === 'number' ||
        (typeof nextKey === 'string' && !isNaN(parseInt(nextKey, 10)));
      current[key] = isNextKeyNumeric ? [] : {};
    }

    current = current[key];
  }

  // Set the value at the last path element
  const lastKey = path[path.length - 1];
  current[lastKey] = value;
}
