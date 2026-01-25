/**
 * Declarative Transform Library
 *
 * This module provides a declarative way to define value transforms that can be:
 * 1. Executed at runtime to transform MQTT values
 * 2. Introspected to generate Home Assistant Jinja2 templates
 *
 * Each transform is defined with:
 * - A unique type identifier
 * - Optional parameters
 * - A runtime execution function
 * - A Jinja2 template generator
 */

// =============================================================================
// Transform Type Definitions
// =============================================================================

/**
 * Base interface for all declarative transforms.
 * Each transform type extends this with its specific parameters.
 */
export type Transform =
  | NumberTransform
  | DivideTransform
  | MultiplyTransform
  | BooleanTransform
  | BitBooleanTransform
  | EqualsBooleanTransform
  | NotEqualsBooleanTransform
  | TemperatureTransform
  | TimeStringTransform
  | NegateTransform
  | ParseIntTransform
  | IdentityTransform
  | MapTransform
  | SumTransform
  | MinTransform
  | MaxTransform
  | DiffTransform
  | AverageTransform
  | RoundTransform
  | TimePeriodFieldTransform
  | MPPTPVFieldTransform
  | BitMaskToWeekdayTransform
  | ChainTransform;

/**
 * Multi-key transforms that operate on multiple input values
 */
export type MultiKeyTransform =
  | SumTransform
  | MinTransform
  | MaxTransform
  | DiffTransform
  | AverageTransform;

// =============================================================================
// Single-Value Transforms
// =============================================================================

/** Parse string to number with NaN fallback to 0 */
export interface NumberTransform {
  type: 'number';
}

/** Divide value by a constant */
export interface DivideTransform {
  type: 'divide';
  divisor: number;
}

/** Multiply value by a constant */
export interface MultiplyTransform {
  type: 'multiply';
  multiplier: number;
}

/** Parse as boolean (checks if bit 0 is set) */
export interface BooleanTransform {
  type: 'boolean';
}

/** Extract a specific bit as boolean */
export interface BitBooleanTransform {
  type: 'bitBoolean';
  bit: number;
}

/** Compare value equals a specific string */
export interface EqualsBooleanTransform {
  type: 'equalsBoolean';
  compareValue: string;
}

/** Compare value not equals a specific string */
export interface NotEqualsBooleanTransform {
  type: 'notEqualsBoolean';
  compareValue: string;
}

/** Convert uint8 temperature to signed int8 */
export interface TemperatureTransform {
  type: 'temperature';
}

/** Format time string "H:M" to "HH:MM" */
export interface TimeStringTransform {
  type: 'timeString';
}

/** Negate the numeric value */
export interface NegateTransform {
  type: 'negate';
}

/** Parse as integer */
export interface ParseIntTransform {
  type: 'parseInt';
}

/** Pass through value unchanged (for strings) */
export interface IdentityTransform {
  type: 'identity';
}

/** Map string values to specific outputs */
export interface MapTransform {
  type: 'map';
  mappings: Record<string, string | number | boolean | undefined>;
  defaultValue?: string | number | boolean;
}

/** Round to specified decimal places */
export interface RoundTransform {
  type: 'round';
  decimals?: number;
}

/** Chain multiple transforms together */
export interface ChainTransform {
  type: 'chain';
  transforms: Exclude<Transform, ChainTransform | MultiKeyTransform>[];
}

// =============================================================================
// Complex Parsing Transforms
// =============================================================================

/** Extract a field from a time period string (format: "HH|MM|HH|MM|WEEKDAY|POWER|ENABLED") */
export interface TimePeriodFieldTransform {
  type: 'timePeriodField';
  field: 'startTime' | 'endTime' | 'weekday' | 'power' | 'enabled';
}

/** Extract a field from MPPT PV info string (format: "VOLTAGE|CURRENT|POWER") */
export interface MPPTPVFieldTransform {
  type: 'mpptPvField';
  field: 'voltage' | 'current' | 'power';
}

/** Convert weekday bitmask to weekday set string */
export interface BitMaskToWeekdayTransform {
  type: 'bitMaskToWeekday';
}

// =============================================================================
// Multi-Value Aggregation Transforms
// =============================================================================

/** Sum multiple values */
export interface SumTransform {
  type: 'sum';
}

/** Get minimum value */
export interface MinTransform {
  type: 'min';
  scale?: number;
}

/** Get maximum value */
export interface MaxTransform {
  type: 'max';
  scale?: number;
}

/** Get difference between max and min */
export interface DiffTransform {
  type: 'diff';
  scale?: number;
}

/** Get average of all values */
export interface AverageTransform {
  type: 'average';
  scale?: number;
  round?: boolean;
}

// =============================================================================
// Transform Factory Functions
// =============================================================================

/** Create a number transform */
export const number = (): NumberTransform => ({ type: 'number' });

/** Create a divide transform */
export const divide = (divisor: number): DivideTransform => ({ type: 'divide', divisor });

/** Create a multiply transform */
export const multiply = (multiplier: number): MultiplyTransform => ({
  type: 'multiply',
  multiplier,
});

/** Create a boolean transform */
export const boolean = (): BooleanTransform => ({ type: 'boolean' });

/** Create a bit boolean transform */
export const bitBoolean = (bit: number): BitBooleanTransform => ({ type: 'bitBoolean', bit });

/** Create an equals boolean transform */
export const equalsBoolean = (compareValue: string): EqualsBooleanTransform => ({
  type: 'equalsBoolean',
  compareValue,
});

/** Create a not equals boolean transform */
export const notEqualsBoolean = (compareValue: string): NotEqualsBooleanTransform => ({
  type: 'notEqualsBoolean',
  compareValue,
});

/** Create a temperature transform */
export const temperature = (): TemperatureTransform => ({ type: 'temperature' });

/** Create a time string transform */
export const timeString = (): TimeStringTransform => ({ type: 'timeString' });

/** Create a negate transform */
export const negate = (): NegateTransform => ({ type: 'negate' });

/** Create a parseInt transform */
export const parseIntTransform = (): ParseIntTransform => ({ type: 'parseInt' });

/** Create an identity transform */
export const identity = (): IdentityTransform => ({ type: 'identity' });

/** Create a map transform */
export const map = (
  mappings: Record<string, string | number | boolean | undefined>,
  defaultValue?: string | number | boolean,
): MapTransform => ({
  type: 'map',
  mappings,
  defaultValue,
});

/** Create a round transform */
export const round = (decimals?: number): RoundTransform => ({ type: 'round', decimals });

/** Create a chain transform */
export const chain = (
  ...transforms: Exclude<Transform, ChainTransform | MultiKeyTransform>[]
): ChainTransform => ({
  type: 'chain',
  transforms,
});

/** Create a time period field transform */
export const timePeriodField = (
  field: TimePeriodFieldTransform['field'],
): TimePeriodFieldTransform => ({
  type: 'timePeriodField',
  field,
});

/** Create an MPPT PV field transform */
export const mpptPvField = (field: MPPTPVFieldTransform['field']): MPPTPVFieldTransform => ({
  type: 'mpptPvField',
  field,
});

/** Create a bitmask to weekday transform */
export const bitMaskToWeekday = (): BitMaskToWeekdayTransform => ({ type: 'bitMaskToWeekday' });

/** Create a sum transform */
export const sum = (): SumTransform => ({ type: 'sum' });

/** Create a min transform */
export const min = (scale?: number): MinTransform => ({ type: 'min', scale });

/** Create a max transform */
export const max = (scale?: number): MaxTransform => ({ type: 'max', scale });

/** Create a diff transform */
export const diff = (scale?: number): DiffTransform => ({ type: 'diff', scale });

/** Create an average transform */
export const average = (scale?: number, roundResult?: boolean): AverageTransform => ({
  type: 'average',
  scale,
  round: roundResult,
});

// =============================================================================
// Runtime Execution
// =============================================================================

/**
 * Execute a single-value transform at runtime
 */
export function executeTransform(
  transform: Exclude<Transform, MultiKeyTransform>,
  value: string,
): unknown {
  switch (transform.type) {
    case 'number': {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }

    case 'divide': {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num / transform.divisor;
    }

    case 'multiply': {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num * transform.multiplier;
    }

    case 'boolean':
      return Boolean(Number(value) & 1);

    case 'bitBoolean':
      return Boolean(Number(value) & (1 << transform.bit));

    case 'equalsBoolean':
      return value === transform.compareValue;

    case 'notEqualsBoolean':
      return value !== transform.compareValue;

    case 'temperature': {
      const num = parseFloat(value);
      if (isNaN(num)) return 0;
      // Out of uint8 bounds - return as is
      if (num < 0 || num > 255) return num;
      // Convert uint8 to int8
      return num > 127 ? num - 256 : num;
    }

    case 'timeString': {
      const parts = value.split(':');
      if (parts.length !== 2) return '00:00';
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    case 'negate': {
      const num = parseInt(value, 10);
      return isNaN(num) ? 0 : -num;
    }

    case 'parseInt': {
      const num = parseInt(value, 10);
      return isNaN(num) ? 0 : num;
    }

    case 'identity':
      return value;

    case 'map':
      return transform.mappings[value] ?? transform.defaultValue;

    case 'round': {
      const num = parseFloat(value);
      if (isNaN(num)) return 0;
      if (transform.decimals === undefined) return Math.round(num);
      const factor = Math.pow(10, transform.decimals);
      return Math.round(num * factor) / factor;
    }

    case 'chain': {
      let result: unknown = value;
      for (const t of transform.transforms) {
        result = executeTransform(t, String(result));
      }
      return result;
    }

    case 'timePeriodField':
      return executeTimePeriodField(value, transform.field);

    case 'mpptPvField':
      return executeMPPTPVField(value, transform.field);

    case 'bitMaskToWeekday': {
      const bitmask = parseInt(value, 10);
      return '0123456'
        .split('')
        .filter((_, index) => bitmask & (1 << index))
        .join('');
    }
  }
}

/**
 * Execute a multi-key transform at runtime
 */
export function executeMultiKeyTransform(
  transform: MultiKeyTransform,
  values: Record<string, string>,
): unknown {
  const numericValues = Object.values(values).map(v => parseFloat(v));

  switch (transform.type) {
    case 'sum':
      return numericValues.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);

    case 'min': {
      const validValues = numericValues.filter(v => !isNaN(v));
      if (validValues.length === 0) return 0;
      const result = Math.min(...validValues);
      return transform.scale ? result / transform.scale : result;
    }

    case 'max': {
      const validValues = numericValues.filter(v => !isNaN(v));
      if (validValues.length === 0) return 0;
      const result = Math.max(...validValues);
      return transform.scale ? result / transform.scale : result;
    }

    case 'diff': {
      const validValues = numericValues.filter(v => !isNaN(v));
      if (validValues.length === 0) return 0;
      const result = Math.max(...validValues) - Math.min(...validValues);
      return transform.scale ? result / transform.scale : result;
    }

    case 'average': {
      const validValues = numericValues.filter(v => !isNaN(v));
      if (validValues.length === 0) return 0;
      let result = validValues.reduce((acc, v) => acc + v, 0) / validValues.length;
      if (transform.round) result = Math.round(result);
      return transform.scale ? result / transform.scale : result;
    }
  }
}

// Helper functions for complex parsing
function executeTimePeriodField(
  value: string,
  field: TimePeriodFieldTransform['field'],
): string | number | boolean {
  const parts = value.split('|');
  if (parts.length < 7) {
    switch (field) {
      case 'startTime':
      case 'endTime':
        return '00:00';
      case 'weekday':
        return '0123456';
      case 'power':
        return 0;
      case 'enabled':
        return false;
    }
  }

  switch (field) {
    case 'startTime':
      return `${parseInt(parts[0], 10)}:${parseInt(parts[1], 10).toString().padStart(2, '0')}`;
    case 'endTime':
      return `${parseInt(parts[2], 10)}:${parseInt(parts[3], 10).toString().padStart(2, '0')}`;
    case 'weekday': {
      const bitmask = parseInt(parts[4], 10);
      return '0123456'
        .split('')
        .filter((_, index) => bitmask & (1 << index))
        .join('');
    }
    case 'power':
      return parseInt(parts[5], 10);
    case 'enabled':
      return parts[6] === '1';
  }
}

function executeMPPTPVField(value: string, field: MPPTPVFieldTransform['field']): number {
  const parts = value.split('|');
  if (parts.length < 3) return 0;

  switch (field) {
    case 'voltage':
      return parseInt(parts[0], 10) / 10;
    case 'current':
      return parseInt(parts[1], 10) / 10;
    case 'power':
      return parseInt(parts[2], 10) / 10;
  }
}

// =============================================================================
// Jinja2 Template Generation
// =============================================================================

/**
 * Generate a Jinja2 template for a single-value transform.
 * The template assumes the value is available as `value_json.<key>` or `value`.
 *
 * @param transform - The transform to generate a template for
 * @param valueExpr - The Jinja2 expression for the input value (e.g., "value_json.key")
 * @returns A Jinja2 template string
 */
export function transformToJinja2(
  transform: Exclude<Transform, MultiKeyTransform>,
  valueExpr: string = 'value',
): string {
  switch (transform.type) {
    case 'number':
      return `{{ ${valueExpr} | float(0) }}`;

    case 'divide':
      return `{{ (${valueExpr} | float(0)) / ${transform.divisor} }}`;

    case 'multiply':
      return `{{ (${valueExpr} | float(0)) * ${transform.multiplier} }}`;

    case 'boolean':
      return `{{ (${valueExpr} | int(0)) | bitwise_and(1) > 0 }}`;

    case 'bitBoolean':
      return `{{ (${valueExpr} | int(0)) | bitwise_and(${1 << transform.bit}) > 0 }}`;

    case 'equalsBoolean':
      return `{{ ${valueExpr} == '${transform.compareValue}' }}`;

    case 'notEqualsBoolean':
      return `{{ ${valueExpr} != '${transform.compareValue}' }}`;

    case 'temperature':
      // Jinja2 implementation of uint8 to int8 conversion
      return `{% set n = ${valueExpr} | float(0) %}{% if n < 0 or n > 255 %}{{ n }}{% elif n > 127 %}{{ n - 256 }}{% else %}{{ n }}{% endif %}`;

    case 'timeString':
      return `{% set parts = ${valueExpr}.split(':') %}{% if parts | length == 2 %}{{ '%02d' | format(parts[0] | int) }}:{{ '%02d' | format(parts[1] | int) }}{% else %}00:00{% endif %}`;

    case 'negate':
      return `{{ -(${valueExpr} | int(0)) }}`;

    case 'parseInt':
      return `{{ ${valueExpr} | int(0) }}`;

    case 'identity':
      return `{{ ${valueExpr} }}`;

    case 'map': {
      const entries = Object.entries(transform.mappings).filter(([, v]) => v !== undefined);
      const conditions = entries
        .map(([k, v], index) => {
          const valueStr = typeof v === 'string' ? `'${v}'` : v;
          const keyword = index === 0 ? 'if' : 'elif';
          return `{% ${keyword} ${valueExpr} == '${k}' %}${valueStr}`;
        })
        .join('');
      const defaultStr =
        transform.defaultValue !== undefined
          ? typeof transform.defaultValue === 'string'
            ? `'${transform.defaultValue}'`
            : transform.defaultValue
          : 'none';
      return `${conditions}{% else %}${defaultStr}{% endif %}`;
    }

    case 'round':
      if (transform.decimals === undefined) {
        return `{{ (${valueExpr} | float(0)) | round }}`;
      }
      return `{{ (${valueExpr} | float(0)) | round(${transform.decimals}) }}`;

    case 'chain': {
      let expr = valueExpr;
      let blockStatements = '';
      let tempCounter = 0;

      for (const t of transform.transforms) {
        const innerTemplate = transformToJinja2(t, expr);

        if (innerTemplate.startsWith('{%')) {
          // Block template - need to capture result in a temp variable
          const tempVar = `__chain${tempCounter++}`;
          // Wrap the block template to capture its output in a temp variable
          // The block template outputs a value, so we need to capture it
          blockStatements += `{% set ${tempVar} %}${innerTemplate}{% endset %}`;
          expr = tempVar;
        } else {
          // Expression template - strip outer {{ }} and use as inner expression
          expr = innerTemplate.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
        }
      }

      return blockStatements ? `${blockStatements}{{ ${expr} }}` : `{{ ${expr} }}`;
    }

    case 'timePeriodField':
      return generateTimePeriodFieldJinja2(valueExpr, transform.field);

    case 'mpptPvField':
      return generateMPPTPVFieldJinja2(valueExpr, transform.field);

    case 'bitMaskToWeekday':
      // Convert bitmask to weekday set string - only mutate inside loop, output once at end
      return `{% set bm = ${valueExpr} | int(0) %}{% set days = '' %}{% for i in range(7) %}{% if bm | bitwise_and(2**i) %}{% set days = days ~ i %}{% endif %}{% endfor %}{{ days }}`;
  }
}

/**
 * Generate a Jinja2 template for a multi-key transform.
 *
 * @param transform - The transform to generate a template for
 * @param keys - The keys to aggregate
 * @param valuePrefix - Prefix for accessing values (e.g., "value_json")
 * @returns A Jinja2 template string
 */
export function multiKeyTransformToJinja2(
  transform: MultiKeyTransform,
  keys: string[],
  valuePrefix: string = 'value_json',
): string {
  // Use float(none) so invalid values become None instead of 0
  const values = keys.map(k => `${valuePrefix}.${k} | float(none)`);
  const rawListExpr = `[${values.join(', ')}]`;
  // Filter out None values
  const filteredListExpr = `${rawListExpr} | reject('equalto', none) | list`;

  switch (transform.type) {
    case 'sum':
      // For sum, we can use default 0 since adding 0 doesn't affect the result
      return `{{ [${keys.map(k => `${valuePrefix}.${k} | float(0)`).join(', ')}] | sum }}`;

    case 'min': {
      const scaleExpr = transform.scale ? ` / ${transform.scale}` : '';
      return `{% set vals = ${filteredListExpr} %}{% if vals | length > 0 %}{{ (vals | min)${scaleExpr} }}{% else %}0{% endif %}`;
    }

    case 'max': {
      const scaleExpr = transform.scale ? ` / ${transform.scale}` : '';
      return `{% set vals = ${filteredListExpr} %}{% if vals | length > 0 %}{{ (vals | max)${scaleExpr} }}{% else %}0{% endif %}`;
    }

    case 'diff': {
      const scaleExpr = transform.scale ? ` / ${transform.scale}` : '';
      return `{% set vals = ${filteredListExpr} %}{% if vals | length > 0 %}{{ ((vals | max) - (vals | min))${scaleExpr} }}{% else %}0{% endif %}`;
    }

    case 'average': {
      const scaleExpr = transform.scale ? ` / ${transform.scale}` : '';
      const roundExpr = transform.round ? ' | round' : '';
      return `{% set vals = ${filteredListExpr} %}{% if vals | length > 0 %}{{ ((vals | sum) / (vals | length)${roundExpr})${scaleExpr} }}{% else %}0{% endif %}`;
    }
  }
}

// Helper functions for complex Jinja2 generation
function generateTimePeriodFieldJinja2(
  valueExpr: string,
  field: TimePeriodFieldTransform['field'],
): string {
  const partsExpr = `${valueExpr}.split('|')`;

  switch (field) {
    case 'startTime':
      return `{% set p = ${partsExpr} %}{% if p | length >= 7 %}{{ p[0] | int }}:{{ '%02d' | format(p[1] | int) }}{% else %}00:00{% endif %}`;
    case 'endTime':
      return `{% set p = ${partsExpr} %}{% if p | length >= 7 %}{{ p[2] | int }}:{{ '%02d' | format(p[3] | int) }}{% else %}00:00{% endif %}`;
    case 'weekday':
      // Convert bitmask to weekday set string (e.g., bitmask 127 -> "0123456")
      return `{% set p = ${partsExpr} %}{% if p | length >= 7 %}{% set bm = p[4] | int(0) %}{% set days = '' %}{% for i in range(7) %}{% if bm | bitwise_and(2**i) %}{% set days = days ~ i %}{% endif %}{% endfor %}{{ days }}{% else %}0123456{% endif %}`;
    case 'power':
      return `{% set p = ${partsExpr} %}{% if p | length >= 7 %}{{ p[5] | int }}{% else %}0{% endif %}`;
    case 'enabled':
      return `{% set p = ${partsExpr} %}{% if p | length >= 7 %}{{ p[6] == '1' }}{% else %}false{% endif %}`;
  }
}

function generateMPPTPVFieldJinja2(
  valueExpr: string,
  field: MPPTPVFieldTransform['field'],
): string {
  const partsExpr = `${valueExpr}.split('|')`;
  const index = field === 'voltage' ? 0 : field === 'current' ? 1 : 2;

  return `{% set p = ${partsExpr} %}{% if p | length >= 3 %}{{ (p[${index}] | int) / 10 }}{% else %}0{% endif %}`;
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if a transform is a multi-key transform */
export function isMultiKeyTransform(transform: Transform): transform is MultiKeyTransform {
  return ['sum', 'min', 'max', 'diff', 'average'].includes(transform.type);
}

// =============================================================================
// Conversion utilities for backward compatibility
// =============================================================================

/**
 * Convert a declarative transform to a runtime function.
 * This allows gradual migration from inline functions to declarative transforms.
 */
export function toTransformFunction(
  transform: Exclude<Transform, MultiKeyTransform>,
): (value: string) => unknown {
  return (value: string) => executeTransform(transform, value);
}

/**
 * Convert a multi-key declarative transform to a runtime function.
 */
export function toMultiKeyTransformFunction(
  transform: MultiKeyTransform,
): (values: Record<string, string>) => unknown {
  return (values: Record<string, string>) => executeMultiKeyTransform(transform, values);
}
