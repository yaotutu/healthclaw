// src/store/json-utils.test.ts
import { describe, test, expect } from 'bun:test';
import { safeJsonParse, safeJsonStringify } from './json-utils';

describe('safeJsonParse', () => {
  test('parses valid JSON string', () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(['a', 'b']);
  });

  test('returns fallback for null input', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
  });

  test('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', [])).toEqual([]);
  });

  test('returns fallback for malformed JSON', () => {
    expect(safeJsonParse('{broken', {})).toEqual({});
  });

  test('parses object correctly', () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
  });
});

describe('safeJsonStringify', () => {
  test('stringifies arrays', () => {
    expect(safeJsonStringify(['a', 'b'])).toBe('["a","b"]');
  });

  test('stringifies null to "null"', () => {
    expect(safeJsonStringify(null)).toBe('null');
  });

  test('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = safeJsonStringify(obj);
    expect(typeof result).toBe('string');
  });
});
