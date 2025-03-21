import { HaComponentConfig } from './homeAssistantDiscovery';
import { ControlHandlerDefinition } from './controlHandler';
import { HaAdvertisement } from './generateDiscoveryConfigs';

export const globalPollInterval = parseInt(process.env.MQTT_POLLING_INTERVAL || '60', 10) * 1000;

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
type TransformParams<K extends string | readonly string[]> = K extends string
  ? [K: string]
  : [{ [P in K[number]]: string }];
/**
 * Interface for field definition
 */
export type FieldDefinition<
  T extends BaseDeviceData,
  KP extends KeyPath<T>,
  K extends string | readonly string[] = string | readonly string[],
> = {
  key: K;
  path: KP;
  transform?: (...value: TransformParams<K>) => TypeAtPath<T, KP>;
} & (TypeAtPath<T, KP> extends number | undefined
  ? {}
  : {
      transform: (value: string) => TypeAtPath<T, KP>;
    });

/**
 * Interface for message definition
 */
export interface DeviceDefinition<T extends BaseDeviceData> {
  messages: MessageDefinition<T>[];
}

export interface MessageDefinition<T extends BaseDeviceData> {
  commands: ControlHandlerDefinition<T>[];
  advertisements: HaAdvertisement<T, KeyPath<T> | []>[];
  defaultState: T;
  refreshDataPayload: string;
  getAdditionalDeviceInfo: (state: T) => AdditionalDeviceInfo;
  isMessage: (values: Record<string, string>) => boolean;
  fields: FieldDefinition<T, KeyPath<T>>[];
  publishPath: string;
  pollInterval: number;
}

export type BaseDeviceData = {
  deviceType: string;
  deviceId: string;
  timestamp: string;
  values: Record<string, string>;
};

export type RegisterFieldDefinitionFn<T extends BaseDeviceData> = <
  KP extends KeyPath<T>,
  K extends string | readonly string[],
>(
  fd: FieldDefinition<T, KP, K>,
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

export type BuildMessageFn = <T extends BaseDeviceData>(
  options: {
    refreshDataPayload: string;
    isMessage: (values: Record<string, string>) => boolean;
    publishPath: string;
    defaultState: Omit<T, keyof BaseDeviceData>;
    getAdditionalDeviceInfo: (state: T) => AdditionalDeviceInfo;
    pollInterval: number;
  },
  args: BuildMessageDefinitionFn<T>,
) => void;

export type RegisterDeviceBuildArgs = {
  message: BuildMessageFn;
};

export function registerDeviceDefinition(
  {
    deviceTypes,
  }: {
    deviceTypes: string[];
  },
  build: ({ message }: RegisterDeviceBuildArgs) => void,
): void {
  const messages: MessageDefinition<any>[] = [];
  const message: BuildMessageFn = (messageOptions, buildMessage) => {
    const fields: FieldDefinition<any, KeyPath<any>>[] = [];
    const registerField = <KP extends KeyPath<any>, K extends string | readonly string[]>(
      fd: FieldDefinition<any, KP, K>,
    ) => {
      fields.push(fd as FieldDefinition<any, KeyPath<any>>);
    };

    const commands: ControlHandlerDefinition<any>[] = [];
    const command: RegisterCommandDefinitionFn<any> = <V extends any | void>(
      name: string,
      command: Omit<ControlHandlerDefinition<V>, 'command'>,
    ) => {
      commands.push({ ...command, command: name } as ControlHandlerDefinition<any>);
    };
    const advertisements: HaAdvertisement<any, KeyPath<any> | []>[] = [];
    const advertise: AdvertiseComponentFn<any> = (keyPath, advertise) => {
      advertisements.push({
        keyPath,
        advertise,
      });
    };

    buildMessage({ field: registerField, command, advertise });
    let messageDefinition = {
      fields,
      advertisements,
      commands,
      ...messageOptions,
    } satisfies MessageDefinition<any>;
    messages.push(messageDefinition);
  };
  build({ message });

  for (const deviceType of deviceTypes) {
    deviceDefinitionRegistry.set(deviceType, {
      messages,
    });
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
