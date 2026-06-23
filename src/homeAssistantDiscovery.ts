import { AdvertiseBuilderArgs, HaStatefulAdvertiseBuilder } from './deviceDefinition.js';
import { HaNonStatefulComponentAdvertiseBuilder } from './controlHandler.js';

export interface HaBaseComponent {
  name: string;
  id: string;
  device_class?: string;
  icon?: string;
  enabled_by_default?: boolean;
}

export interface HaBaseStateComponent extends HaBaseComponent {
  state_topic: string;
  value_template: string;
}

export interface HaBinarySensorComponent extends HaBaseStateComponent {
  type: 'binary_sensor';
  payload_on: string | number | boolean;
  payload_off: string | number | boolean;
}

export interface HaSensorComponent extends HaBaseStateComponent {
  type: 'sensor';
  unit_of_measurement?: string;
  state_class?: string;
}

export interface HaSwitchComponent extends HaBaseStateComponent {
  type: 'switch';
  command_topic: string;
  payload_on: string | number | boolean;
  payload_off: string | number | boolean;
  state_on: string | number | boolean;
  state_off: string | number | boolean;
  retain?: boolean;
}

export interface HaNumberComponent extends Omit<HaSensorComponent, 'type'> {
  type: 'number';
  command_topic: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface HaTextComponent extends HaBaseStateComponent {
  type: 'text';
  command_topic: string;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface HaSelectComponent extends HaBaseStateComponent {
  type: 'select';
  command_topic: string;
  options: string[];
  value_template: string;
  command_template: string;
}

export interface HaButtonComponent extends HaBaseComponent {
  type: 'button';
  command_topic: string;
  payload_press: string | number | boolean;
}

export type HaComponentConfig =
  | HaBinarySensorComponent
  | HaSensorComponent
  | HaSwitchComponent
  | HaNumberComponent
  | HaTextComponent
  | HaSelectComponent
  | HaButtonComponent;

/**
 * Interface for Home Assistant discovery configuration
 */
export interface HaDiscoveryConfig {
  name: string;
  unique_id?: string;
  state_topic?: string;
  command_topic?: string;
  command_template?: string;
  device_class?: string;
  unit_of_measurement?: string;
  value_template?: string;
  payload_on?: string | number | boolean;
  payload_off?: string | number | boolean;
  state_on?: string | number | boolean;
  state_off?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  payload_press?: string | number | boolean;
  pattern?: string;
  retain?: boolean;
  icon?: string;
  device: {
    ids: string[];
    name: string;
    model: string;
    model_id: string;
    manufacturer: string;
    sw_version?: string;
    connections?: [string, string][];
  };
  origin: {
    name: string;
    url: string;
  };
  mode?: string;
  availability?: {
    topic: string;
    payload_available: string | number | boolean;
    payload_not_available: string | number | boolean;
  }[];
}

function commandTopic(args: Pick<AdvertiseBuilderArgs, 'commandTopic'> & { command: string }) {
  return `${args.commandTopic}/${args.command}`;
}

function getJinjaPath(keyPath: ReadonlyArray<string | number>) {
  return `value_json${keyPath.map(key => (typeof key === 'string' ? `.${key}` : `[${key}]`)).join('')}`;
}

function valueTemplate(
  args: AdvertiseBuilderArgs & {
    valueMappings?: Record<string | number, string>;
    defaultValue?: string;
  },
) {
  let value = getJinjaPath(args.keyPath);
  if (args.valueMappings) {
    return mappingValueTemplate({ value, valueMappings: args.valueMappings });
  }
  if (args.defaultValue) {
    return `{{ ${value} | default('${args.defaultValue}') }}`;
  }
  // Guard against keys that are not (yet) present in the payload. Some entities
  // (e.g. command-only controls) only appear in the published state once they
  // have been set, so accessing them unconditionally would make Home Assistant
  // log a "dict object has no attribute ..." template warning on every update.
  return `{{ ${value} if ${value} is defined else '' }}`;
}

function mappingValueTemplate({
  value,
  valueMappings,
}: {
  value: string;
  valueMappings: Record<string | number, string | number>;
}) {
  let map = JSON.stringify(
    Object.fromEntries(
      Object.entries(valueMappings).map(([key, value]) => [String(key), String(value)]),
    ),
  );
  // Only access the value when it is present and non-null. A missing key (e.g. a
  // command-only control that has not been set yet) would otherwise trigger a
  // "dict object has no attribute ..." template warning in Home Assistant on
  // every state update. When absent, render nothing so HA ignores the update.
  return `{% set mapping = ${map} %}{% if ${value} is defined and ${value} is not none %}{% set stringifiedValue = ${value} | string %}{% if stringifiedValue in mapping %}{{ mapping[stringifiedValue] }}{% else %}{{ stringifiedValue }}{% endif %}{% endif %}`;
}

export interface HaBaseComponentArgs {
  name: string;
  id: string;
  device_class?: string;
  icon?: string;
  enabled_by_default?: boolean;
}

export interface HaBaseStateComponentArgs extends HaBaseComponentArgs {
  defaultValue?: string;
}

const baseSensor =
  (definitions: HaBaseComponentArgs) =>
  (args: Omit<AdvertiseBuilderArgs, 'keyPath'>): HaBaseComponent => ({
    id: definitions.id,
    name: definitions.name,
    device_class: definitions.device_class,
    icon: definitions.icon,
    enabled_by_default: definitions.enabled_by_default,
  });
const baseStateSensor =
  (definitions: HaBaseStateComponentArgs) =>
  (args: AdvertiseBuilderArgs): HaBaseStateComponent => ({
    ...baseSensor(definitions)(args),
    state_topic: args.stateTopic,
    value_template: valueTemplate({ ...args, ...definitions }),
  });
export const binarySensorComponent =
  (definition: HaBaseStateComponentArgs): HaStatefulAdvertiseBuilder<boolean> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'binary_sensor',
    payload_on: true,
    payload_off: false,
  });
export const sensorComponent =
  <T extends number | string>(
    definition: HaBaseStateComponentArgs & {
      unit_of_measurement?: string;
      valueMappings?: Record<T, string>;
      state_class?: string;
    },
  ): HaStatefulAdvertiseBuilder<T, HaSensorComponent> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'sensor',
    value_template: valueTemplate({ ...args, ...definition }),
    unit_of_measurement: definition.unit_of_measurement,
    state_class: definition.state_class,
  });

function reverseMappings(
  valueMappings: Record<string | number, string>,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(valueMappings)) {
    result[value] = key;
  }
  return result;
}

export const numberComponent =
  (
    definition: HaBaseStateComponentArgs & {
      unit_of_measurement?: string;
      command: string;
      min?: number;
      max?: number;
      step?: number;
      mode?: string;
    },
  ): HaStatefulAdvertiseBuilder<number> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'number',
    command_topic: commandTopic({ ...args, ...definition }),
    unit_of_measurement: definition.unit_of_measurement,
    min: definition.min,
    max: definition.max,
    step: definition.step,
  });
export const switchComponent =
  (
    definition: HaBaseStateComponentArgs & {
      command: string;
      retain?: boolean;
    },
  ): HaStatefulAdvertiseBuilder<boolean> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'switch',
    command_topic: commandTopic({ ...args, ...definition }),
    value_template: valueTemplate(args),
    payload_on: 'true',
    payload_off: 'false',
    state_on: true,
    state_off: false,
    ...(definition.retain != null ? { retain: definition.retain } : {}),
  });
export const textComponent =
  <T extends string = string>(
    definition: HaBaseStateComponentArgs & {
      command: string;
      max?: number;
      min?: number;
      pattern?: string;
    },
  ): HaStatefulAdvertiseBuilder<T> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'text',
    state_topic: args.stateTopic,
    command_topic: commandTopic({ ...args, ...definition }),
    value_template: valueTemplate(args),
    max: definition.max,
    min: definition.min,
    pattern: definition.pattern,
  });
export const selectComponent =
  <T extends string | number>(
    definition: HaBaseStateComponentArgs & {
      command: string;
      valueMappings: Record<T, string>;
      defaultValue?: T;
    },
  ): HaStatefulAdvertiseBuilder<T, HaSelectComponent> =>
  args => ({
    ...baseStateSensor(definition)(args),
    type: 'select',
    value_template: mappingValueTemplate({
      value: getJinjaPath(args.keyPath),
      valueMappings: definition.valueMappings,
    }),
    command_template: mappingValueTemplate({
      value: 'value',
      valueMappings: reverseMappings(definition.valueMappings),
    }),
    command_topic: commandTopic({ ...args, ...definition }),
    options: Object.values(definition.valueMappings),
    defaultValue: definition.defaultValue,
  });
export const buttonComponent =
  (
    definition: HaBaseComponentArgs & {
      command: string;
      payload_press: string | number | boolean;
    },
  ): HaNonStatefulComponentAdvertiseBuilder =>
  (args): HaButtonComponent => ({
    ...baseSensor(definition)(args),
    type: 'button',
    command_topic: commandTopic({ ...args, ...definition }),
    payload_press: definition.payload_press,
  });
