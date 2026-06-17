import { describe, it, expect, vi } from 'vitest';
import { resolveDynamicValue } from '../../../src/lex/resolver.js';
import { makeActor, makeCtx } from '../../helpers/fixtures.js';

// ─── Literal numbers ──────────────────────────────────────────────────────────

describe('resolveDynamicValue — literal numbers', () => {
  const ctx = makeCtx();

  it('returns a positive number directly', () => {
    expect(resolveDynamicValue(3, ctx)).toBe(3);
  });

  it('returns a negative number directly', () => {
    expect(resolveDynamicValue(-2, ctx)).toBe(-2);
  });

  it('returns 0 for null', () => {
    expect(resolveDynamicValue(null, ctx)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(resolveDynamicValue(undefined, ctx)).toBe(0);
  });

  it('returns 0 for a string', () => {
    expect(resolveDynamicValue('5', ctx)).toBe(0);
  });
});

// ─── { ref } paths ────────────────────────────────────────────────────────────

describe('resolveDynamicValue — { ref } actor paths', () => {
  it('resolves actor.system.* path', () => {
    const actor = makeActor({
      system: { strength: { value: 14 } } as unknown as Record<string, unknown>,
    });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ ref: 'actor.system.strength.value' }, ctx)).toBe(14);
  });

  it('resolves shallow actor.system path', () => {
    const actor = makeActor({ system: { agility: 3 } as unknown as Record<string, unknown> });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ ref: 'actor.system.agility' }, ctx)).toBe(3);
  });

  it('returns 0 and warns for a missing actor path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx();
    expect(resolveDynamicValue({ ref: 'actor.system.missing' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('actor.system.missing'));
    warn.mockRestore();
  });

  it('returns 0 for a non-numeric actor path', () => {
    const actor = makeActor({ system: { name: 'Sword' } as unknown as Record<string, unknown> });
    const ctx = makeCtx({ actor });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ ref: 'actor.system.name' }, ctx)).toBe(0);
    warn.mockRestore();
  });
});

describe('resolveDynamicValue — { ref } actor.state paths', () => {
  it('reads from actor.flags.lex.state via getFlag', () => {
    const actor = makeActor({
      getFlag: (_scope: string, key: string) => (key === 'state.recoil' ? 2 : undefined),
    });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ ref: 'actor.state.recoil' }, ctx)).toBe(2);
  });

  it('returns 0 when state field is undefined', () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ ref: 'actor.state.missing' }, ctx)).toBe(0);
    warn.mockRestore();
  });
});

describe('resolveDynamicValue — { ref } item paths', () => {
  it('resolves item.system.* path', () => {
    const item = { id: 'item-1', name: 'Sword', system: { damage: { value: 8 } } };
    const ctx = makeCtx({ item: item as unknown as import('../../../src/types/index.js').FoundryDocument });
    expect(resolveDynamicValue({ ref: 'item.system.damage.value' }, ctx)).toBe(8);
  });

  it('returns 0 and warns when no item is present', () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ ref: 'item.system.damage' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('item'));
    warn.mockRestore();
  });
});

describe('resolveDynamicValue — { ref } target paths', () => {
  it('resolves target.system.* against the first target', () => {
    const target = makeActor({ system: { defense: 12 } as unknown as Record<string, unknown> });
    const ctx = makeCtx({ targets: [target] });
    expect(resolveDynamicValue({ ref: 'target.system.defense' }, ctx)).toBe(12);
  });

  it('returns 0 and warns when no targets are set', () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ ref: 'target.system.defense' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('target'));
    warn.mockRestore();
  });
});

describe('resolveDynamicValue — { ref } unknown namespace', () => {
  it('returns 0 and warns for unrecognised namespace', () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ ref: 'world.someProp' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('world.someProp'));
    warn.mockRestore();
  });
});

// ─── { formula } expressions ──────────────────────────────────────────────────

describe('resolveDynamicValue — { formula } arithmetic', () => {
  const ctx = makeCtx();

  it('evaluates a literal number formula', () => {
    expect(resolveDynamicValue({ formula: '5' }, ctx)).toBe(5);
  });

  it('evaluates addition', () => {
    expect(resolveDynamicValue({ formula: '3 + 4' }, ctx)).toBe(7);
  });

  it('evaluates subtraction', () => {
    expect(resolveDynamicValue({ formula: '10 - 3' }, ctx)).toBe(7);
  });

  it('evaluates multiplication', () => {
    expect(resolveDynamicValue({ formula: '2 * 6' }, ctx)).toBe(12);
  });

  it('evaluates division', () => {
    expect(resolveDynamicValue({ formula: '9 / 3' }, ctx)).toBe(3);
  });

  it('respects operator precedence (* before +)', () => {
    expect(resolveDynamicValue({ formula: '2 + 3 * 4' }, ctx)).toBe(14);
  });

  it('respects parentheses', () => {
    expect(resolveDynamicValue({ formula: '(2 + 3) * 4' }, ctx)).toBe(20);
  });

  it('handles unary minus', () => {
    expect(resolveDynamicValue({ formula: '-5' }, ctx)).toBe(-5);
  });

  it('handles division by zero gracefully', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ formula: '6 / 0' }, ctx)).toBe(0);
    warn.mockRestore();
  });
});

describe('resolveDynamicValue — { formula } built-in functions', () => {
  const ctx = makeCtx();

  it('max', () => expect(resolveDynamicValue({ formula: 'max(2, 7, 4)' }, ctx)).toBe(7));
  it('min', () => expect(resolveDynamicValue({ formula: 'min(2, 7, 4)' }, ctx)).toBe(2));
  it('floor', () => expect(resolveDynamicValue({ formula: 'floor(3.9)' }, ctx)).toBe(3));
  it('ceil',  () => expect(resolveDynamicValue({ formula: 'ceil(3.1)'  }, ctx)).toBe(4));
  it('abs',   () => expect(resolveDynamicValue({ formula: 'abs(-5)'    }, ctx)).toBe(5));
});

describe('resolveDynamicValue — { formula } with ref paths', () => {
  it('resolves an actor ref inside a formula', () => {
    const actor = makeActor({ system: { strength: 14 } as unknown as Record<string, unknown> });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ formula: 'actor.system.strength + 2' }, ctx)).toBe(16);
  });

  it('resolves floor(actor.system.strength / 2)', () => {
    const actor = makeActor({ system: { strength: 15 } as unknown as Record<string, unknown> });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ formula: 'floor(actor.system.strength / 2)' }, ctx)).toBe(7);
  });

  it('resolves max of two actor paths', () => {
    const actor = makeActor({
      system: { str: 12, dex: 16 } as unknown as Record<string, unknown>,
    });
    const ctx = makeCtx({ actor });
    expect(resolveDynamicValue({ formula: 'max(actor.system.str, actor.system.dex)' }, ctx)).toBe(16);
  });
});

describe('resolveDynamicValue — { formula } error handling', () => {
  const ctx = makeCtx();

  it('returns 0 and warns on syntax error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ formula: '2 +' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('formula error'));
    warn.mockRestore();
  });

  it('returns 0 and warns on unknown function', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDynamicValue({ formula: 'sqrt(9)' }, ctx)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('formula error'));
    warn.mockRestore();
  });
});
