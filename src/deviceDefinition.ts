import { HaComponentConfig } from './homeAssistantDiscovery.js';
import { ControlHandlerDefinition } from './controlHandler.js';
import { HaAdvertisement } from './generateDiscoveryConfigs.js';
import { Transform, MultiKeyTransform } from './transforms.js';
import { levenshteinDistance } from './utils/stringDistance.js';
import logger from './logger.js';

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

/**
 * A function-based transform.
 *
 * @deprecated Function-based transforms cannot be introspected (e.g. to generate
 * Home Assistant Jinja2 value templates) or serialized. Use a declarative
 * {@link Transform} (composed with `chain`, `map`, `inRange`, …) instead. This
 * form is retained only for backward compatibility and must not be used for new
 * fields.
 */
export type TransformFn<Args, R> = (args: Args) => R;

/**
 * Transform specification for a field.
 * Can be either:
 * - A declarative Transform object (preferred for introspection/serialization)
 * - A function (deprecated, see {@link TransformFn})
 */
export type TransformSpec<K extends string | readonly string[], R> = K extends string
  ? Exclude<Transform, MultiKeyTransform> | TransformFn<string, R>
  : MultiKeyTransform | TransformFn<{ [P in K[number]]: string }, R>;

/**
 * Interface for field definition.
 * Supports both declarative transforms and function-based transforms.
 */
export type FieldDefinition<
  T extends BaseDeviceData,
  KP extends KeyPath<T>,
  K extends string | readonly string[] = string | readonly string[],
> = {
  key: K;
  path: KP;
  transform?: TransformSpec<K, TypeAtPath<T, KP>>;
  /**
   * Marks a never-decreasing cumulative counter. When set, a reading lower than
   * the last good value is rejected unless a subsequent reading confirms the
   * drop (see the monotonic guard in DeviceManager.updateDeviceState). Protects
   * Home Assistant `total_increasing` sensors from transient corrupt readings.
   */
  monotonic?: boolean;
  /**
   * Only meaningful for multi-key (aggregate) fields. When set, the field is
   * computed from whichever keys are present instead of requiring all of them:
   * if none of the keys are present the field is skipped silently, and a partial
   * set no longer logs a "Some values are missing" warning. Use for optional
   * aggregates such as total PV power on devices that report a variable number
   * of PV strings.
   */
  allowPartial?: boolean;
} & (TypeAtPath<T, KP> extends number | undefined
  ? {}
  : {
      transform: TransformSpec<K, TypeAtPath<T, KP>>;
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
  controlsDeviceAvailability: boolean;
  enabled?: boolean;
  /**
   * Whether this message is requested from the device at all. Defaults to true.
   *
   * Derived messages compute their state locally from other messages' state, so
   * they are never requested and never parsed. They must not contribute to the
   * polling interval GCD (their `pollInterval` is meaningless) and must not have
   * their `refreshDataPayload` sent.
   */
  polled?: boolean;
  /**
   * Optional state-aware poll predicate. When provided, the message is only
   * polled if this returns true for the current (merged) device state. Used to
   * dynamically poll per-pack BMS details only for packs that are present.
   */
  shouldPoll?: (state: BaseDeviceData) => boolean;
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
  options?: { enabled?: (state: T) => boolean | undefined },
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
    controlsDeviceAvailability: boolean;
    enabled?: boolean;
    polled?: boolean;
    shouldPoll?: (state: BaseDeviceData) => boolean;
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
    const advertise: AdvertiseComponentFn<any> = (keyPath, advertise, options = {}) => {
      // If the message is disabled, override enabled to always return false
      const enabled = messageOptions.enabled === false ? () => false : options.enabled;

      advertisements.push({
        keyPath,
        advertise,
        enabled,
      });
    };

    buildMessage({ field: registerField, command, advertise });
    let messageDefinition = {
      fields,
      advertisements,
      commands,
      ...messageOptions,
      enabled: messageOptions.enabled !== false,
      polled: messageOptions.polled !== false,
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

export function extractBaseType(deviceType: string): string {
  const regex = /(.*)-[\d\w]+/;
  const match = regex.exec(deviceType);
  return match != null ? match[1] : deviceType;
}

export function getDeviceDefinition(
  deviceType: string,
): DeviceDefinition<BaseDeviceData> | undefined {
  const baseType = extractBaseType(deviceType);

  // Exact match
  const exact = deviceDefinitionRegistry.get(baseType);
  if (exact) {
    return exact;
  }

  // Case-insensitive match
  const upperBase = baseType.toUpperCase();
  for (const [key, definition] of deviceDefinitionRegistry) {
    if (key.toUpperCase() === upperBase) {
      logger.info(`Device type "${deviceType}" matched as "${key}" (case-insensitive)`);
      return definition;
    }
  }

  return undefined;
}

export function getRegisteredDeviceTypes(): string[] {
  return [...deviceDefinitionRegistry.keys()];
}

export function getSuggestedDeviceType(baseType: string): string | undefined {
  const threshold = Math.max(1, Math.floor(baseType.length / 2));
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const key of deviceDefinitionRegistry.keys()) {
    const distance = levenshteinDistance(baseType.toUpperCase(), key.toUpperCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = key;
    }
  }

  return bestDistance <= threshold ? bestMatch : undefined;
}
