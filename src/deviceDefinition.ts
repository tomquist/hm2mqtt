import { HaComponentConfig } from './homeAssistantDiscovery';
import { ControlHandlerDefinition } from './controlHandler';

type FixArr<T> = T extends readonly any[] ? Omit<T, Exclude<keyof any[], number>> : T;

/**
 * Type utility to get all possible paths in an object type
 */
export type KeyPath<T> = NonNullable<_KeyPath<T>>;
type _KeyPath<T> = T extends object
  ? {
      [K in keyof T]: readonly [
        ...([K] | ([K] extends [number] ? [number] : never)),
        ...(readonly [] | _KeyPath<FixArr<T[K]>>),
      ];
    }[keyof T]
  : never;

/**
 * Helper type to get the type at a given path in an object type
 */
export type TypeAtPath<T, P extends KeyPath<T>> = P extends readonly [infer First, ...infer Rest]
  ? First extends keyof T
    ? Rest extends KeyPath<FixArr<T[First]>>
      ? TypeAtPath<FixArr<NonNullable<T[First]>>, Rest>
      : T[First]
    : never
  : T;

export type AdvertiseBuilderArgs = {
  commandTopic: string;
  stateTopic: string;
  keyPath: ReadonlyArray<string | number>;
};

type Flavored<T, FlavorT> = T & { __flavor?: FlavorT };
export type HaStatefulAdvertiseBuilder<
  T,
  R extends HaComponentConfig = HaComponentConfig,
> = Flavored<(args: AdvertiseBuilderArgs) => R, T>;
/**
 * Interface for field definition
 */
export type FieldDefinition<T extends BaseDeviceData, KP extends KeyPath<T>> = {
  key: string;
  path: KP;
  transform?: (value: string) => TypeAtPath<T, KP>;
} & (TypeAtPath<T, KP> extends number | undefined
  ? {}
  : {
      transform: (value: string) => TypeAtPath<T, KP>;
    });

/**
 * Interface for message definition
 */
export interface DeviceDefinition<T extends BaseDeviceData> {
  fields: FieldDefinition<T, KeyPath<T>>[];
  commands: ControlHandlerDefinition<T>[];
  advertisements: HaAdvertisement<T, KeyPath<T> | []>[];
  defaultState: T;
  refreshDataPayload: string;
  getAdditionalDeviceInfo: (state: T) => AdditionalDeviceInfo;
}

export type BaseDeviceData = {
  deviceType: string;
  deviceId: string;
  timestamp: string;
  values: Record<string, string>;
};

export type RegisterFieldDefinitionFn<T extends BaseDeviceData> = <KP extends KeyPath<T>>(
  fd: FieldDefinition<T, KP>,
) => void;
export type RegisterCommandDefinitionFn<T extends BaseDeviceData> = (
  name: string,
  command: Omit<ControlHandlerDefinition<T>, 'command'>,
) => void;
export type AdvertiseComponentFn<T extends BaseDeviceData> = <KP extends KeyPath<T> | []>(
  keyPath: KP,
  component: HaStatefulAdvertiseBuilder<KP extends KeyPath<T> ? TypeAtPath<T, KP> : void>,
) => void;

export type BuildMessageDefinitionArgs<T extends BaseDeviceData> = {
  field: RegisterFieldDefinitionFn<T>;
  advertise: AdvertiseComponentFn<T>;
  command: RegisterCommandDefinitionFn<T>;
};
export type BuildMessageDefinitionFn<T extends BaseDeviceData> = (
  args: BuildMessageDefinitionArgs<T>,
) => void;

export interface AdditionalDeviceInfo {
  firmwareVersion?: string;
}

const deviceDefinitionRegistry: Map<string, DeviceDefinition<any>> = new Map();
export function registerDeviceDefinition<T extends BaseDeviceData>(
  options: {
    deviceTypes: string[];
    defaultState: Omit<T, keyof BaseDeviceData>;
    refreshDataPayload: string;
    getAdditionalDeviceInfo: (state: T) => AdditionalDeviceInfo;
  },
  build: BuildMessageDefinitionFn<T>,
) {
  const fields: FieldDefinition<T, KeyPath<T>>[] = [];
  const registerField = <KP extends KeyPath<T>>(fd: FieldDefinition<T, KP>) => {
    fields.push(fd as FieldDefinition<T, KeyPath<T>>);
  };
  const commands: ControlHandlerDefinition<any>[] = [];
  const registerCommand: RegisterCommandDefinitionFn<T> = <V extends T | void>(
    name: string,
    command: Omit<ControlHandlerDefinition<V>, 'command'>,
  ) => {
    commands.push({ ...command, command: name } as ControlHandlerDefinition<any>);
  };
  const advertisedComponents: HaAdvertisement<T, KeyPath<T> | []>[] = [];
  const advertiseComponent: AdvertiseComponentFn<T> = (keyPath, advertise) => {
    advertisedComponents.push({
      keyPath,
      advertise,
    });
  };

  build({ field: registerField, command: registerCommand, advertise: advertiseComponent });
  let deviceDefinition = {
    fields,
    commands,
    advertisements: advertisedComponents,
    defaultState: options.defaultState,
    refreshDataPayload: options.refreshDataPayload,
    getAdditionalDeviceInfo: options.getAdditionalDeviceInfo,
  } satisfies DeviceDefinition<any>;
  for (const deviceType of options.deviceTypes) {
    deviceDefinitionRegistry.set(deviceType, deviceDefinition);
  }
}

export function getDeviceDefinition(
  deviceType: string,
): DeviceDefinition<BaseDeviceData> | undefined {
  const regex = /(.*)-\d+/;
  const match = regex.exec(deviceType);
  if (match == null) {
    return;
  }
  const baseType = match[1];
  return deviceDefinitionRegistry.get(baseType);
}

import './device/registry';
import { HaAdvertisement } from './generateDiscoveryConfigs';
