import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn(), register: vi.fn(), has: vi.fn() },
}));

import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { Fulmen, fulmen } from '../../../src/mechanics/Fulmen.js';
import { makeCtx, makeRaw, makeMockMechanic } from '../../helpers/fixtures.js';
import type { FulmenConfig, CalculiConfig } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Shared config helpers
// ---------------------------------------------------------------------------

const baseWraps: CalculiConfig = {
  type:      'calculi',
  sides:     6,
  count:     2,
  threshold: 4,
};

function makeFulmenConfig(overrides: Partial<Omit<FulmenConfig, 'type'>> = {}): FulmenConfig {
  return {
    type:  'fulmen',
    wraps: baseWraps,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  const innerMechanic = makeMockMechanic('calculi');
  (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);
});

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

describe('assemble', () => {
  it('should delegate assemble to inner mechanic', () => {
    const cfg = makeFulmenConfig();
    const ctx = makeCtx();

    const innerMechanic = makeMockMechanic('calculi');
    const assembleSpy   = vi.spyOn(innerMechanic, 'assemble');
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    const pool = fulmen.assemble(cfg, ctx);

    expect(assembleSpy).toHaveBeenCalledOnce();
    expect(assembleSpy).toHaveBeenCalledWith(baseWraps, ctx);
    expect(pool).toBeDefined();
  });

  it('should throw when inner mechanic is not registered', () => {
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const cfg = makeFulmenConfig();
    const ctx = makeCtx();

    expect(() => fulmen.assemble(cfg, ctx)).toThrow(
      'Fulmen: inner mechanic "calculi" is not registered',
    );
  });

  it('should throw when config type is not fulmen', () => {
    const ctx = makeCtx();

    expect(() => fulmen.assemble(baseWraps, ctx)).toThrow(
      'Fulmen received config of type "calculi"',
    );
  });
});

// ---------------------------------------------------------------------------
// roll — no explosion
// ---------------------------------------------------------------------------

describe('roll — no explosion', () => {
  it('should not explode when no die value equals the trigger', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    // Inner roll returns value 3 — below trigger (default = sides = 6)
    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [3] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    const cfg    = makeFulmenConfig();
    const result = fulmen.roll(pool, cfg);

    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0].values).toEqual([3]);
    expect(result.rolls[0].exploded).toEqual([]);
  });

  it('should use sides as trigger when explodeOn is undefined', () => {
    const pool = { dice: [{ sides: 8, count: 1 }], modifier: 0 };

    // Value 8 on a d8 → should trigger explosion (sides = 8)
    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 8, values: [8] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // Mock Math.random so the explosion die rolls a non-trigger value (3)
    // floor(0.25 * 8) + 1 = floor(2) + 1 = 3
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const cfg    = makeFulmenConfig({ wraps: { ...baseWraps, sides: 8 } });
    const result = fulmen.roll(pool, cfg);

    expect(result.rolls[0].exploded).toHaveLength(1);
    expect(result.rolls[0].exploded![0]).toBe(3);

    randomSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// roll — explosion
// ---------------------------------------------------------------------------

describe('roll — explosion', () => {
  it('should add exploded dice when die value equals explodeOn', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [6] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // Explosion die rolls 4 (non-trigger) → chain ends after one explosion
    // floor(0.5 * 6) + 1 = floor(3) + 1 = 4
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    expect(result.rolls[0].exploded).toHaveLength(1);
    expect(result.rolls[0].exploded).toEqual([4]);

    randomSpy.mockRestore();
  });

  it('should include exploded values in the values array', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [6] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // Explosion die rolls 4; floor(0.5 * 6) + 1 = 4
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    // values should contain both the original 6 and the exploded 4
    expect(result.rolls[0].values).toContain(6);
    expect(result.rolls[0].values).toContain(4);
    expect(result.rolls[0].values).toHaveLength(2);

    randomSpy.mockRestore();
  });

  it('should continue explosion chain while die equals trigger', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [6] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // First explosion: 6 (triggers again), second explosion: 3 (stops)
    // floor(0.9 * 6) + 1 = floor(5.4) + 1 = 6  → triggers again
    // floor(0.4 * 6) + 1 = floor(2.4) + 1 = 3  → stops
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.4);

    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    // original 6 + explosion 6 + explosion 3
    expect(result.rolls[0].values).toHaveLength(3);
    expect(result.rolls[0].exploded).toHaveLength(2);
    expect(result.rolls[0].exploded).toEqual([6, 3]);

    randomSpy.mockRestore();
  });

  it('should stop explosion chain at maxChain', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [6] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // All explosion dice roll 6 (keep triggering) — chain must stop at maxChain=3
    // floor(0.9 * 6) + 1 = 6 always
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const cfg    = makeFulmenConfig({ explodeOn: 6, maxChain: 3 });
    const result = fulmen.roll(pool, cfg);

    // original 6 + exactly 3 explosion dice
    expect(result.rolls[0].exploded).toHaveLength(3);
    expect(result.rolls[0].values).toHaveLength(4);

    randomSpy.mockRestore();
  });

  it('should cap explosion chain at maxChain=10 by default', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [6] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // All explosion dice keep rolling 6 — default cap of 10 applies
    // floor(0.9 * 6) + 1 = 6 always
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const cfg    = makeFulmenConfig({ explodeOn: 6 }); // no maxChain → default 10
    const result = fulmen.roll(pool, cfg);

    // original 6 + exactly 10 explosion dice (capped)
    expect(result.rolls[0].exploded).toHaveLength(10);
    expect(result.rolls[0].values).toHaveLength(11);

    randomSpy.mockRestore();
  });

  it('should preserve existing exploded array from inner mechanic', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

    // Inner mechanic already supplies an exploded entry — Fulmen should append to it
    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [5, 3], exploded: [3] }]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // No values equal trigger (6) → no new explosions
    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    // Should preserve the inner mechanic's existing exploded value
    expect(result.rolls[0].exploded).toEqual([3]);
    expect(result.rolls[0].values).toEqual([5, 3]);
  });

  it('should handle multiple dice in the pool independently', () => {
    const pool = { dice: [{ sides: 6, count: 2 }], modifier: 0 };

    // Two dice: first rolls 6 (triggers), second rolls 3 (no trigger)
    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([
        { sides: 6, values: [6] },
        { sides: 6, values: [3] },
      ]),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    // Explosion for first die rolls 2 (stops)
    // floor(0.2 * 6) + 1 = floor(1.2) + 1 = 2
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    // First die: values [6, 2], exploded [2]
    expect(result.rolls[0].values).toEqual([6, 2]);
    expect(result.rolls[0].exploded).toEqual([2]);

    // Second die: no explosion
    expect(result.rolls[1].values).toEqual([3]);
    expect(result.rolls[1].exploded).toEqual([]);

    randomSpy.mockRestore();
  });

  it('should pass modifier from inner roll through unchanged', () => {
    const pool = { dice: [{ sides: 6, count: 1 }], modifier: 2 };

    const innerMechanic = makeMockMechanic('calculi', {
      roll: () => makeRaw([{ sides: 6, values: [3] }], 2),
    });
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    const cfg    = makeFulmenConfig({ explodeOn: 6 });
    const result = fulmen.roll(pool, cfg);

    expect(result.modifier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// interpret
// ---------------------------------------------------------------------------

describe('interpret', () => {
  it('should delegate interpret to inner mechanic', () => {
    const cfg = makeFulmenConfig();
    const ctx = makeCtx();
    const raw = makeRaw([{ sides: 6, values: [4] }]);

    const innerMechanic = makeMockMechanic('calculi');
    const interpretSpy  = vi.spyOn(innerMechanic, 'interpret');
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    const result = fulmen.interpret(raw, cfg, ctx);

    expect(interpretSpy).toHaveBeenCalledOnce();
    expect(interpretSpy).toHaveBeenCalledWith(raw, baseWraps, ctx);
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// tier
// ---------------------------------------------------------------------------

describe('tier', () => {
  it('should delegate tier to inner mechanic', () => {
    const cfg         = makeFulmenConfig();
    const ctx         = makeCtx();
    const interpreted = { hits: 2, total: 4, raw: makeRaw([]) };

    const innerMechanic = makeMockMechanic('calculi');
    const tierSpy       = vi.spyOn(innerMechanic, 'tier');
    (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);

    const result = fulmen.tier(interpreted, cfg, ctx);

    expect(tierSpy).toHaveBeenCalledOnce();
    expect(tierSpy).toHaveBeenCalledWith(interpreted, baseWraps, ctx);
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// exported singleton
// ---------------------------------------------------------------------------

describe('fulmen singleton', () => {
  it('should export a singleton with id "fulmen"', () => {
    expect(fulmen).toBeInstanceOf(Fulmen);
    expect(fulmen.id).toBe('fulmen');
  });

  it('should expose a human-readable label', () => {
    expect(typeof fulmen.label).toBe('string');
    expect(fulmen.label.length).toBeGreaterThan(0);
  });
});
