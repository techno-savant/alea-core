import { describe, it, expect, vi } from 'vitest';
import { ModifierRegistry } from '../../../src/registry/ModifierRegistry.js';
import type { StaticModifierDeclaration } from '../../../src/types/index.js';

// Singleton isolation: each test uses unique IDs via an incrementing counter.
let n = 0;
const uid = () => `mod-${++n}`;

function makeModifier(
  overrides: Partial<StaticModifierDeclaration> = {},
): StaticModifierDeclaration {
  const id = uid();
  return {
    id,
    schemaId: `schema-${id}`,
    value: 1,
    sourceLabel: `Source ${id}`,
    ...overrides,
  };
}

// ─── register ────────────────────────────────────────────────────────────────

describe('ModifierRegistry.register', () => {
  it('should store a modifier and make it retrievable by id', () => {
    const mod = makeModifier();

    ModifierRegistry.register(mod);

    expect(ModifierRegistry.get(mod.id)).toBe(mod);
  });

  it('should warn via console.warn when replacing an existing modifier', () => {
    const mod = makeModifier();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    ModifierRegistry.register(mod);
    ModifierRegistry.register({ ...mod, value: 99 });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(mod.id));

    spy.mockRestore();
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe('ModifierRegistry.get', () => {
  it('should return the registered modifier', () => {
    const mod = makeModifier();

    ModifierRegistry.register(mod);

    expect(ModifierRegistry.get(mod.id)).toBe(mod);
  });

  it('should return undefined for an unregistered id', () => {
    expect(ModifierRegistry.get('mod-unregistered-' + uid())).toBeUndefined();
  });
});

// ─── has ─────────────────────────────────────────────────────────────────────

describe('ModifierRegistry.has', () => {
  it('should return true for a registered id', () => {
    const mod = makeModifier();

    ModifierRegistry.register(mod);

    expect(ModifierRegistry.has(mod.id)).toBe(true);
  });

  it('should return false for an unregistered id', () => {
    expect(ModifierRegistry.has('mod-absent-' + uid())).toBe(false);
  });
});

// ─── bySchema ────────────────────────────────────────────────────────────────

describe('ModifierRegistry.bySchema', () => {
  it('should return empty array when no modifiers match schemaId', () => {
    const result = ModifierRegistry.bySchema('schema-nonexistent-' + uid());

    expect(result).toEqual([]);
  });

  it('should return all modifiers with matching schemaId', () => {
    const schemaId = `schema-shared-${uid()}`;
    const modA = makeModifier({ schemaId });
    const modB = makeModifier({ schemaId });

    ModifierRegistry.register(modA);
    ModifierRegistry.register(modB);

    const result = ModifierRegistry.bySchema(schemaId);

    expect(result).toContain(modA);
    expect(result).toContain(modB);
    expect(result).toHaveLength(2);
  });

  it('should not return modifiers for a different schemaId', () => {
    const targetSchema = `schema-target-${uid()}`;
    const otherSchema = `schema-other-${uid()}`;
    const targetMod = makeModifier({ schemaId: targetSchema });
    const otherMod  = makeModifier({ schemaId: otherSchema });

    ModifierRegistry.register(targetMod);
    ModifierRegistry.register(otherMod);

    const result = ModifierRegistry.bySchema(targetSchema);

    expect(result).toContain(targetMod);
    expect(result).not.toContain(otherMod);
  });

  it('should return modifiers in insertion order', () => {
    const schemaId = `schema-ordered-${uid()}`;
    const first  = makeModifier({ schemaId });
    const second = makeModifier({ schemaId });
    const third  = makeModifier({ schemaId });

    ModifierRegistry.register(first);
    ModifierRegistry.register(second);
    ModifierRegistry.register(third);

    const result = ModifierRegistry.bySchema(schemaId);

    expect(result.indexOf(first)).toBeLessThan(result.indexOf(second));
    expect(result.indexOf(second)).toBeLessThan(result.indexOf(third));
  });
});
