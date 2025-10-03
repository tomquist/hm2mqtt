import { Device } from './types';
import { DeviceManager } from './deviceManager';
import { parseMessage } from './parser';

import logger from './logger';
/**
 * Data Handler class
 */
export class DataHandler {
  /**
   * Create a new DataHandler
   *
   * @param deviceManager - Device manager instance
   * @param publishCallback - Callback to publish messages
   */
  constructor(private deviceManager: DeviceManager) {}

  /**
   * Handle device data
   *
   * @param device - The device configuration
   * @param message - The raw message
   * @returns Array of message paths that were updated
   */
  handleDeviceData(device: Device, message: string): string[] {
    logger.debug(`Received new device data for device ${device.deviceType}:${device.deviceId}`);
    logger.trace(`Raw message: ${message}`);

    try {
      const parsedData = parseMessage(message, device.deviceType, device.deviceId);
      const updatedPaths: string[] = [];
      for (const [path, data] of Object.entries(parsedData)) {
        this.deviceManager.updateDeviceState(device, path, () => data);
        updatedPaths.push(path);
      }
      return updatedPaths;
    } catch (error) {
      logger.error(`Error handling device data for ${device.deviceId}:`, error);
      return [];
    }
  }
}
