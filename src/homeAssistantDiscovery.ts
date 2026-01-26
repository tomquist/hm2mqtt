import { AdvertiseBuilderArgs, HaStatefulAdvertiseBuilder, FieldInfo } from './deviceDefinition';
import { HaNonStatefulComponentAdvertiseBuilder } from './controlHandler';
import {
  Transform,
  MultiKeyTransform,
  isMultiKeyTransform,
  transformToJinja2,
  multiKeyTransformToJinja2,
  number as numberTransform,
} from './transforms';

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
  icon?: string;
  device: {
    ids: string[];
    name: string;
    model: string;
    model_id: string;
    manufacturer: string;
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

/**
 * Generate a Jinja2 preamble that parses a raw MQTT message (comma-separated key=value pairs)
 * into a dictionary. The result is stored in `d` (short for data).
 *
 * Example input: "pe=95,kn=5120,do=20"
 * After preamble: d = {'pe': '95', 'kn': '5120', 'do': '20'}
 */
function getJinjaParsingPreamble(): string {
  // Use namespace to allow reassignment inside loop
  // Split by comma, then by = (with limit 1 to handle values containing =)
  return `{% set ns = namespace(d={}) %}{% for pair in value.split(',') %}{% set kv = pair.split('=', 1) %}{% if kv | length == 2 %}{% set ns.d = dict(ns.d, **{kv[0]: kv[1]}) %}{% endif %}{% endfor %}`;
}

/**
 * Generate a Jinja2 value template that parses raw MQTT messages.
 * First decomposes the message into key-value pairs, then extracts the
 * relevant value(s) and applies the transform.
 */
function jinjaValueTemplate(fieldInfo: FieldInfo): string {
  const preamble = getJinjaParsingPreamble();
  const { key, transform } = fieldInfo;

  if (Array.isArray(key)) {
    // Multi-key transform
    if (transform && isMultiKeyTransform(transform)) {
      // Use the multi-key transform Jinja generator
      // The multiKeyTransformToJinja2 expects valuePrefix like 'value_json'
      // but we have 'ns.d', so we need to adapt it
      const transformTemplate = multiKeyTransformToJinja2(transform, key as string[], 'ns.d');
      return `${preamble}${transformTemplate}`;
    }
    // Multi-key without valid transform - just return first key's value
    return `${preamble}{{ ns.d.${key[0]} | default('') }}`;
  }

  // Single key
  const valueExpr = `ns.d.${key}`;

  if (!transform) {
    // Default to number transform if no transform specified
    return `${preamble}${transformToJinja2(numberTransform(), valueExpr)}`;
  }

  if (isMultiKeyTransform(transform)) {
    // Single key with multi-key transform is invalid, fall back to identity
    return `${preamble}{{ ${valueExpr} | default('') }}`;
  }

  // Apply the single-value transform
  return `${preamble}${transformToJinja2(transform, valueExpr)}`;
}

function valueTemplate(
  args: AdvertiseBuilderArgs & {
    valueMappings?: Record<string | number, string>;
    defaultValue?: string;
  },
) {
  // If fieldInfo is present, generate Jinja template that parses raw messages
  if (args.fieldInfo) {
    const jinjaTemplate = jinjaValueTemplate(args.fieldInfo);

    // If there are valueMappings (for display), we need to wrap the result
    // to map the transform output to the display value
    if (args.valueMappings) {
      // Capture the transform result in a temp variable, then apply mapping
      // The jinjaTemplate already outputs the value, so we capture it
      return `{% set __raw %}${jinjaTemplate}{% endset %}${mappingValueTemplate({ value: '__raw | trim', valueMappings: args.valueMappings })}`;
    }

    return jinjaTemplate;
  }

  // Standard mode: read from parsed JSON
  let value = getJinjaPath(args.keyPath);
  if (args.valueMappings) {
    return mappingValueTemplate({ value, valueMappings: args.valueMappings });
  }
  return `{{ ${value}${args.defaultValue ? ` | default('${args.defaultValue}')` : ''} }}`;
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
  return `{% set mapping = ${map} %}{% set stringifiedValue = ${value} | string %}{% if stringifiedValue in mapping %}{{ mapping[stringifiedValue] }}{% else %}{{ stringifiedValue }}{% endif %}`;
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
  args => {
    let selectValueTemplate: string;

    if (args.fieldInfo) {
      // Jinja mode: parse raw message, then apply mapping
      const jinjaTemplate = jinjaValueTemplate(args.fieldInfo);
      selectValueTemplate = `{% set __raw %}${jinjaTemplate}{% endset %}${mappingValueTemplate({
        value: '__raw | trim',
        valueMappings: definition.valueMappings,
      })}`;
    } else {
      // Standard mode: read from parsed JSON
      selectValueTemplate = mappingValueTemplate({
        value: getJinjaPath(args.keyPath),
        valueMappings: definition.valueMappings,
      });
    }

    return {
      ...baseStateSensor(definition)(args),
      type: 'select',
      value_template: selectValueTemplate,
      command_template: mappingValueTemplate({
        value: 'value',
        valueMappings: reverseMappings(definition.valueMappings),
      }),
      command_topic: commandTopic({ ...args, ...definition }),
      options: Object.values(definition.valueMappings),
      defaultValue: definition.defaultValue,
    };
  };
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
