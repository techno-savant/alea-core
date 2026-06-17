import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SchemaRegistry } from '../../../src/registry/SchemaRegistry.js';
import type { DiceResolutionSchema } from '../../../src/types/index.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let _counter = 0;

function uid(): string {
  return `schema-registry-test-${++_counter}`;
}

function makeTestSchema(id: string): DiceResolutionSchema {
  return {
    id,
    label: 'Test',
    mechanic: 'calculi',
    mechanicConfig: { type: 'calculi', sides: 6, count: 1, threshold: 5 },
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SchemaRegistry', () => {

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {

    it('should store a schema and make it retrievable by id', () => {
      const id = uid();
      const schema = makeTestSchema(id);

      SchemaRegistry.register(schema);

      expect(SchemaRegistry.get(id)).toBe(schema);
    });

    it('should warn via console.warn when replacing an existing schema', () => {
      const id = uid();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      SchemaRegistry.register(makeTestSchema(id));
      SchemaRegistry.register(makeTestSchema(id));

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(
        `[alea-core] SchemaRegistry: duplicate schema id "${id}" — replacing existing entry.`,
      );
    });

    it('should not warn on the first registration of an id', () => {
      const id = uid();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      SchemaRegistry.register(makeTestSchema(id));

      expect(spy).not.toHaveBeenCalled();
    });

    it('should replace the stored schema when the same id is registered twice', () => {
      const id = uid();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const first = makeTestSchema(id);
      const second = { ...makeTestSchema(id), label: 'Replacement' };

      SchemaRegistry.register(first);
      SchemaRegistry.register(second);

      expect(SchemaRegistry.get(id)).toBe(second);
    });

  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {

    it('should return undefined for an unregistered id', () => {
      const result = SchemaRegistry.get('non-existent-schema-id');

      expect(result).toBeUndefined();
    });

    it('should return the exact schema object that was registered', () => {
      const id = uid();
      const schema = makeTestSchema(id);

      SchemaRegistry.register(schema);

      expect(SchemaRegistry.get(id)).toBe(schema);
    });

  });

  // ── has ────────────────────────────────────────────────────────────────────

  describe('has', () => {

    it('should return true for a registered id', () => {
      const id = uid();

      SchemaRegistry.register(makeTestSchema(id));

      expect(SchemaRegistry.has(id)).toBe(true);
    });

    it('should return false for an unregistered id', () => {
      expect(SchemaRegistry.has('definitely-not-registered')).toBe(false);
    });

  });

});
