import {
  // Factory functions
  number,
  divide,
  multiply,
  boolean,
  bitBoolean,
  equalsBoolean,
  notEqualsBoolean,
  temperature,
  timeString,
  negate,
  parseIntTransform,
  identity,
  map,
  round,
  chain,
  timePeriodField,
  mpptPvField,
  bitMaskToWeekday,
  sum,
  min,
  max,
  diff,
  average,
  // Execution functions
  executeTransform,
  executeMultiKeyTransform,
  // Jinja2 generation
  transformToJinja2,
  multiKeyTransformToJinja2,
  // Utilities
  isMultiKeyTransform,
  toTransformFunction,
  toMultiKeyTransformFunction,
} from './transforms';

describe('transforms', () => {
  describe('number transform', () => {
    it('should parse valid numbers', () => {
      expect(executeTransform(number(), '42')).toBe(42);
      expect(executeTransform(number(), '3.14')).toBe(3.14);
      expect(executeTransform(number(), '-10')).toBe(-10);
    });

    it('should return 0 for NaN', () => {
      expect(executeTransform(number(), 'not-a-number')).toBe(0);
      expect(executeTransform(number(), '')).toBe(0);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(number(), 'value')).toBe('{{ value | float(0) }}');
    });
  });

  describe('divide transform', () => {
    it('should divide by the specified divisor', () => {
      expect(executeTransform(divide(10), '100')).toBe(10);
      expect(executeTransform(divide(100), '500')).toBe(5);
      expect(executeTransform(divide(1000), '1234')).toBe(1.234);
    });

    it('should handle NaN values', () => {
      expect(executeTransform(divide(10), 'invalid')).toBe(0);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(divide(10), 'value')).toBe('{{ (value | float(0)) / 10 }}');
      expect(transformToJinja2(divide(100), 'value')).toBe('{{ (value | float(0)) / 100 }}');
    });
  });

  describe('multiply transform', () => {
    it('should multiply by the specified multiplier', () => {
      expect(executeTransform(multiply(10), '5')).toBe(50);
      expect(executeTransform(multiply(100), '1.5')).toBe(150);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(multiply(10), 'value')).toBe('{{ (value | float(0)) * 10 }}');
    });
  });

  describe('boolean transform', () => {
    it('should extract bit 0 as boolean', () => {
      expect(executeTransform(boolean(), '0')).toBe(false);
      expect(executeTransform(boolean(), '1')).toBe(true);
      expect(executeTransform(boolean(), '2')).toBe(false); // bit 0 is 0 in binary 10
      expect(executeTransform(boolean(), '3')).toBe(true); // bit 0 is 1 in binary 11
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(boolean(), 'value')).toBe(
        '{{ (value | int(0)) | bitwise_and(1) > 0 }}',
      );
    });
  });

  describe('bitBoolean transform', () => {
    it('should extract the specified bit as boolean', () => {
      expect(executeTransform(bitBoolean(0), '1')).toBe(true);
      expect(executeTransform(bitBoolean(1), '2')).toBe(true);
      expect(executeTransform(bitBoolean(2), '4')).toBe(true);
      expect(executeTransform(bitBoolean(3), '8')).toBe(true);
      expect(executeTransform(bitBoolean(0), '2')).toBe(false);
      expect(executeTransform(bitBoolean(1), '1')).toBe(false);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(bitBoolean(0), 'value')).toBe(
        '{{ (value | int(0)) | bitwise_and(1) > 0 }}',
      );
      expect(transformToJinja2(bitBoolean(1), 'value')).toBe(
        '{{ (value | int(0)) | bitwise_and(2) > 0 }}',
      );
      expect(transformToJinja2(bitBoolean(3), 'value')).toBe(
        '{{ (value | int(0)) | bitwise_and(8) > 0 }}',
      );
    });
  });

  describe('equalsBoolean transform', () => {
    it('should compare value to the specified string', () => {
      expect(executeTransform(equalsBoolean('1'), '1')).toBe(true);
      expect(executeTransform(equalsBoolean('1'), '0')).toBe(false);
      expect(executeTransform(equalsBoolean('yes'), 'yes')).toBe(true);
      expect(executeTransform(equalsBoolean('yes'), 'no')).toBe(false);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(equalsBoolean('1'), 'value')).toBe("{{ value == '1' }}");
    });
  });

  describe('notEqualsBoolean transform', () => {
    it('should compare value not equal to the specified string', () => {
      expect(executeTransform(notEqualsBoolean('0'), '1')).toBe(true);
      expect(executeTransform(notEqualsBoolean('0'), '0')).toBe(false);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(notEqualsBoolean('0'), 'value')).toBe("{{ value != '0' }}");
    });
  });

  describe('temperature transform', () => {
    it('should handle normal positive temperatures', () => {
      expect(executeTransform(temperature(), '25')).toBe(25);
      expect(executeTransform(temperature(), '100')).toBe(100);
    });

    it('should convert uint8 to int8 for negative temperatures', () => {
      expect(executeTransform(temperature(), '255')).toBe(-1);
      expect(executeTransform(temperature(), '254')).toBe(-2);
      expect(executeTransform(temperature(), '246')).toBe(-10);
      expect(executeTransform(temperature(), '128')).toBe(-128);
    });

    it('should handle values at boundaries', () => {
      expect(executeTransform(temperature(), '127')).toBe(127);
      expect(executeTransform(temperature(), '128')).toBe(-128);
    });

    it('should pass through values outside uint8 range', () => {
      expect(executeTransform(temperature(), '-5')).toBe(-5);
      expect(executeTransform(temperature(), '300')).toBe(300);
    });
  });

  describe('timeString transform', () => {
    it('should format time strings with padding', () => {
      expect(executeTransform(timeString(), '0:0')).toBe('00:00');
      expect(executeTransform(timeString(), '9:5')).toBe('09:05');
      expect(executeTransform(timeString(), '12:30')).toBe('12:30');
      expect(executeTransform(timeString(), '23:59')).toBe('23:59');
    });

    it('should return 00:00 for invalid formats', () => {
      expect(executeTransform(timeString(), 'invalid')).toBe('00:00');
      expect(executeTransform(timeString(), '12')).toBe('00:00');
    });
  });

  describe('negate transform', () => {
    it('should negate numeric values', () => {
      expect(executeTransform(negate(), '50')).toBe(-50);
      expect(executeTransform(negate(), '-30')).toBe(30);
      // Note: negate('0') returns -0 which is functionally equal to 0
      expect(executeTransform(negate(), '0') === 0).toBe(true);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(negate(), 'value')).toBe('{{ -(value | int(0)) }}');
    });
  });

  describe('parseInt transform', () => {
    it('should parse integers', () => {
      expect(executeTransform(parseIntTransform(), '42')).toBe(42);
      expect(executeTransform(parseIntTransform(), '3.14')).toBe(3);
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(parseIntTransform(), 'value')).toBe('{{ value | int(0) }}');
    });
  });

  describe('identity transform', () => {
    it('should pass through values unchanged', () => {
      expect(executeTransform(identity(), 'hello')).toBe('hello');
      expect(executeTransform(identity(), '123')).toBe('123');
    });

    it('should generate correct Jinja2 template', () => {
      expect(transformToJinja2(identity(), 'value')).toBe('{{ value }}');
    });
  });

  describe('map transform', () => {
    it('should map values according to the mapping', () => {
      const transform = map({ '0': 'day', '1': 'night', '2': 'dusk' });
      expect(executeTransform(transform, '0')).toBe('day');
      expect(executeTransform(transform, '1')).toBe('night');
      expect(executeTransform(transform, '2')).toBe('dusk');
    });

    it('should return default value for unmapped keys', () => {
      const transform = map({ '0': 'a', '1': 'b' }, 'unknown');
      expect(executeTransform(transform, '0')).toBe('a');
      expect(executeTransform(transform, '99')).toBe('unknown');
    });

    it('should return undefined when no default and unmapped', () => {
      const transform = map({ '0': 'a' });
      expect(executeTransform(transform, '99')).toBe(undefined);
    });
  });

  describe('round transform', () => {
    it('should round to nearest integer by default', () => {
      expect(executeTransform(round(), '3.4')).toBe(3);
      expect(executeTransform(round(), '3.5')).toBe(4);
      expect(executeTransform(round(), '3.6')).toBe(4);
    });

    it('should round to specified decimal places', () => {
      expect(executeTransform(round(2), '3.14159')).toBe(3.14);
      expect(executeTransform(round(1), '3.14159')).toBe(3.1);
    });
  });

  describe('chain transform', () => {
    it('should chain multiple transforms together', () => {
      const transform = chain(divide(10), round(1));
      expect(executeTransform(transform, '314')).toBe(31.4);
    });

    it('should work with a single transform', () => {
      const transform = chain(divide(10));
      expect(executeTransform(transform, '100')).toBe(10);
    });
  });

  describe('timePeriodField transform', () => {
    const validTimePeriod = '12|30|23|59|127|800|1';

    it('should extract startTime', () => {
      expect(executeTransform(timePeriodField('startTime'), validTimePeriod)).toBe('12:30');
    });

    it('should extract endTime', () => {
      expect(executeTransform(timePeriodField('endTime'), validTimePeriod)).toBe('23:59');
    });

    it('should extract power', () => {
      expect(executeTransform(timePeriodField('power'), validTimePeriod)).toBe(800);
    });

    it('should extract enabled', () => {
      expect(executeTransform(timePeriodField('enabled'), validTimePeriod)).toBe(true);
      expect(executeTransform(timePeriodField('enabled'), '0|0|0|0|0|0|0')).toBe(false);
    });

    it('should handle weekday bitmask', () => {
      // 127 = 1111111 in binary = all days
      expect(executeTransform(timePeriodField('weekday'), validTimePeriod)).toBe('0123456');
      // 1 = Sunday only
      expect(executeTransform(timePeriodField('weekday'), '0|0|0|0|1|0|0')).toBe('0');
      // 65 = 1000001 = Sunday and Saturday
      expect(executeTransform(timePeriodField('weekday'), '0|0|0|0|65|0|0')).toBe('06');
    });

    it('should return defaults for invalid input', () => {
      expect(executeTransform(timePeriodField('startTime'), 'invalid')).toBe('00:00');
      expect(executeTransform(timePeriodField('endTime'), 'invalid')).toBe('00:00');
      expect(executeTransform(timePeriodField('power'), 'invalid')).toBe(0);
      expect(executeTransform(timePeriodField('enabled'), 'invalid')).toBe(false);
    });
  });

  describe('mpptPvField transform', () => {
    const validPvInfo = '350|37|1304';

    it('should extract voltage', () => {
      expect(executeTransform(mpptPvField('voltage'), validPvInfo)).toBe(35);
    });

    it('should extract current', () => {
      expect(executeTransform(mpptPvField('current'), validPvInfo)).toBe(3.7);
    });

    it('should extract power', () => {
      expect(executeTransform(mpptPvField('power'), validPvInfo)).toBe(130.4);
    });

    it('should return 0 for invalid input', () => {
      expect(executeTransform(mpptPvField('voltage'), 'invalid')).toBe(0);
    });
  });

  describe('bitMaskToWeekday transform', () => {
    it('should convert bitmask to weekday set', () => {
      expect(executeTransform(bitMaskToWeekday(), '127')).toBe('0123456');
      expect(executeTransform(bitMaskToWeekday(), '1')).toBe('0');
      expect(executeTransform(bitMaskToWeekday(), '65')).toBe('06');
      expect(executeTransform(bitMaskToWeekday(), '0')).toBe('');
    });
  });

  describe('multi-key transforms', () => {
    describe('sum transform', () => {
      it('should sum all values', () => {
        expect(executeMultiKeyTransform(sum(), { w1: '100', w2: '200' })).toBe(300);
        expect(executeMultiKeyTransform(sum(), { a: '1', b: '2', c: '3' })).toBe(6);
      });

      it('should handle NaN values as 0', () => {
        expect(executeMultiKeyTransform(sum(), { a: '100', b: 'invalid' })).toBe(100);
      });

      it('should generate correct Jinja2 template', () => {
        expect(multiKeyTransformToJinja2(sum(), ['w1', 'w2'], 'value_json')).toBe(
          '{{ value_json.w1 | float(0) + value_json.w2 | float(0) }}',
        );
      });
    });

    describe('min transform', () => {
      it('should get minimum value', () => {
        expect(executeMultiKeyTransform(min(), { a: '100', b: '50', c: '200' })).toBe(50);
      });

      it('should apply scale', () => {
        expect(executeMultiKeyTransform(min(1000), { a: '3000', b: '2000' })).toBe(2);
      });
    });

    describe('max transform', () => {
      it('should get maximum value', () => {
        expect(executeMultiKeyTransform(max(), { a: '100', b: '200', c: '50' })).toBe(200);
      });

      it('should apply scale', () => {
        expect(executeMultiKeyTransform(max(1000), { a: '3000', b: '2000' })).toBe(3);
      });
    });

    describe('diff transform', () => {
      it('should get difference between max and min', () => {
        expect(executeMultiKeyTransform(diff(), { a: '100', b: '200', c: '50' })).toBe(150);
      });

      it('should apply scale', () => {
        expect(executeMultiKeyTransform(diff(1000), { a: '3000', b: '1000' })).toBe(2);
      });
    });

    describe('average transform', () => {
      it('should calculate average', () => {
        expect(executeMultiKeyTransform(average(), { a: '10', b: '20', c: '30' })).toBe(20);
      });

      it('should apply scale', () => {
        expect(executeMultiKeyTransform(average(10), { a: '100', b: '200' })).toBe(15);
      });

      it('should round when specified', () => {
        expect(executeMultiKeyTransform(average(undefined, true), { a: '10', b: '20', c: '25' })).toBe(18);
      });
    });
  });

  describe('isMultiKeyTransform', () => {
    it('should identify multi-key transforms', () => {
      expect(isMultiKeyTransform(sum())).toBe(true);
      expect(isMultiKeyTransform(min())).toBe(true);
      expect(isMultiKeyTransform(max())).toBe(true);
      expect(isMultiKeyTransform(diff())).toBe(true);
      expect(isMultiKeyTransform(average())).toBe(true);
    });

    it('should return false for single-key transforms', () => {
      expect(isMultiKeyTransform(number())).toBe(false);
      expect(isMultiKeyTransform(divide(10))).toBe(false);
      expect(isMultiKeyTransform(boolean())).toBe(false);
    });
  });

  describe('toTransformFunction', () => {
    it('should convert declarative transform to function', () => {
      const fn = toTransformFunction(divide(10));
      expect(fn('100')).toBe(10);
    });
  });

  describe('toMultiKeyTransformFunction', () => {
    it('should convert multi-key transform to function', () => {
      const fn = toMultiKeyTransformFunction(sum());
      expect(fn({ a: '10', b: '20' })).toBe(30);
    });
  });
});
