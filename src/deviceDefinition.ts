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
 * An entity this device used to advertise and no longer does, identified by the
 * Home Assistant platform and the object id it was published under.
 *
 * Home Assistant keeps a discovery-created entity for as long as its discovery
 * config sits retained on the broker, so renaming or dropping an entity is not
 * enough to make it disappear: the old entity stays behind forever, stuck at
 * unknown, and its value template keeps logging `'dict object' has no attribute
 * ...` on every poll because the field it reads no longer exists. Listing the
 * old identity here clears that retained config, which is what makes Home
 * Assistant delete the entity.
 */
export interface RetiredEntity {
  /** Home Assistant platform, e.g. `sensor` — part of the discovery topic. */
  platform: string;
  /** Object id the entity was advertised under, e.g. `daily_charging_capacity`. */
  id: string;
}

/**
 * Interface for message definition
 */
export interface DeviceDefinition<T extends BaseDeviceData> {
  messages: MessageDefinition<T>[];
  retiredEntities: RetiredEntity[];
}

export type DeriveContext<T extends BaseDeviceData> = {
  /**
   * State keyed by publishPath, *not* the merged view from
   * `DeviceManager.getDeviceState`. That merge is shallow and last-writer-wins,
   * and every path contributes its own `timestamp`, so the merged one is
   * ambiguous — which matters here, since deciding whether a derivation has
   * anything new to do means comparing one specific path's timestamp.
   */
  stateByPath: Record<string, BaseDeviceData>;
  previous: T;
  deviceType: string;
  deviceId: string;
  /** Wall clock, for stamping. */
  at: number;
  /** Monotonic clock, for measuring durations across calls. */
  monotonicAt: number;
};

/**
 * Computes state from other messages' state instead of from a device payload.
 *
 * Returning undefined means "nothing changed": no state is written and nothing
 * is published. That matters because derivations run after every inbound
 * message — on a Venus with cell data enabled that is eight messages per poll
 * cycle, and publishing each time would create a Home Assistant recorder row
 * per sensor for a value that did not move.
 */
export type DeriveFn<T extends BaseDeviceData> = (
  context: DeriveContext<T>,
) => Partial<T> | undefined;

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
   * Marks this as a derived message: its state is computed from other messages
   * rather than parsed from a payload. Such a message should also set
   * `polled: false` and an `isMessage` that never matches.
   */
  derive?: DeriveFn<T>;
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
    derive?: DeriveFn<T>;
    shouldPoll?: (state: BaseDeviceData) => boolean;
  },
  args: BuildMessageDefinitionFn<T>,
) => void;

export type RetireEntityFn = (entity: RetiredEntity) => void;

export type RegisterDeviceBuildArgs = {
  message: BuildMessageFn;
  /**
   * Declares an entity this device no longer advertises, so its retained
   * discovery config is cleared and Home Assistant removes the leftover entity.
   * See {@link RetiredEntity}.
   */
  retire: RetireEntityFn;
};

export function registerDeviceDefinition(
  {
    deviceTypes,
  }: {
    deviceTypes: string[];
  },
  build: ({ message, retire }: RegisterDeviceBuildArgs) => void,
): void {
  const messages: MessageDefinition<any>[] = [];
  const retiredEntities: RetiredEntity[] = [];
  const retire: RetireEntityFn = entity => {
    retiredEntities.push(entity);
  };
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
      // Note the asymmetry: the message-level `enabled` below is collapsed to a
      // boolean here, at registration time, whereas an advertisement's `enabled`
      // predicate is called lazily on every discovery publish. Anything not yet
      // known when the device modules are imported therefore has to be a
      // predicate that reads the value when called — capturing it into a const
      // at import time silently pins it to its starting value, and the two forms
      // look identical in a diff.
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
  build({ message, retire });

  for (const deviceType of deviceTypes) {
    deviceDefinitionRegistry.set(deviceType, {
      messages,
      retiredEntities,
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
