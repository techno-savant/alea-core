import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Calculi, calculi } from '../../../src/mechanics/Calculi.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { CalculiConfig, MechanicConfig } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Shared config factories
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CalculiConfig> = {}): CalculiConfig {
  return {
    type:      'calculi',
    sides:     6,
    count:     3,
    threshold: 4,
    ...overrides,
  };
}

function makeWrongConfig(type = 'limen'): MechanicConfig {
  return { type } as unknown as MechanicConfig;
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

describe('Calculi.assemble', () => {
  const ctx = makeCtx();

  it('should build pool with provided sides and count', () => {
    const config = makeConfig({ sides: 8, count: 5 });

    const pool = calculi.assemble(config, ctx);

    expect(pool.dice).toEqual([{ sides: 8, count: 5 }]);
  });

  it('should always set pool modifier to 0', () => {
    const config = makeConfig({ sides: 6, count: 2 });

    const pool = calculi.assemble(config, ctx);

    expect(pool.modifier).toBe(0);
  });

  it('should return a single dice face entry', () => {
    const config = makeConfig();

    const pool = calculi.assemble(config, ctx);

    expect(pool.dice).toHaveLength(1);
  });

  it('should narrow the config and use calculi-typed fields', () => {
    const config = makeConfig({ sides: 10, count: 4 });

    const pool = calculi.assemble(config, ctx);

    expect(pool.dice[0]).toMatchObject({ sides: 10, count: 4 });
  });

  it('should throw when config type is not calculi', () => {
    const bad = makeWrongConfig('limen');

    expect(() => calculi.assemble(bad, ctx)).toThrow(
      'Calculi received config of type "limen"',
    );
  });
});

// ---------------------------------------------------------------------------
// roll
// ---------------------------------------------------------------------------

describe('Calculi.roll', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should produce exactly count values per die face', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pool = { dice: [{ sides: 6, count: 4 }], modifier: 0 };
    const config = makeConfig({ sides: 6, count: 4 });

    const result = calculi.roll(pool, config);

    expect(result.rolls[0].values).toHaveLength(4);
  });

  it('should clamp all values to [1, sides] inclusive', () => {
    // Math.random() returns [0, 1); floor(0 * 6) + 1 = 1 (min), floor(0.999 * 6) + 1 = 6 (max)
    const spy = vi.spyOn(Math, 'random');
    const pool = { dice: [{ sides: 6, count: 6 }], modifier: 0 };
    const config = makeConfig({ sides: 6, count: 6 });

    spy.mockReturnValueOnce(0)       // floor(0*6)+1 = 1
       .mockReturnValueOnce(0.999)   // floor(0.999*6)+1 = 6
       .mockReturnValueOnce(0.166)   // floor(0.166*6)+1 = 1
       .mockReturnValueOnce(0.5)     // floor(0.5*6)+1 = 4
       .mockReturnValueOnce(0.333)   // floor(0.333*6)+1 = 2
       .mockReturnValueOnce(0.833);  // floor(0.833*6)+1 = 5

    const result = calculi.roll(pool, config);
    const values = result.rolls[0].values;

    expect(values.every(v => v >= 1 && v <= 6)).toBe(true);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...values)).toBeLessThanOrEqual(6);
  });

  it('should return rolls array with modifier 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pool = { dice: [{ sides: 6, count: 2 }], modifier: 0 };
    const config = makeConfig();

    const result = calculi.roll(pool, config);

    expect(result.modifier).toBe(0);
    expect(result.rolls).toBeDefined();
  });

  it('should handle multiple die faces independently', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // pool with two die groups: 2d6 and 3d8
    const pool = {
      dice: [
        { sides: 6, count: 2 },
        { sides: 8, count: 3 },
      ],
      modifier: 0,
    };
    const config = makeConfig();

    const result = calculi.roll(pool, config);

    expect(result.rolls).toHaveLength(2);
    expect(result.rolls[0].values).toHaveLength(2);
    expect(result.rolls[0].sides).toBe(6);
    expect(result.rolls[1].values).toHaveLength(3);
    expect(result.rolls[1].sides).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// interpret
// ---------------------------------------------------------------------------

describe('Calculi.interpret', () => {
  const ctx = makeCtx();

  it('should count 0 hits when all dice are below threshold', () => {
    const config = makeConfig({ threshold: 5 });
    const raw    = makeRaw([{ sides: 6, values: [1, 2, 3, 4] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.hits).toBe(0);
  });

  it('should count all dice as hits when all meet threshold', () => {
    const config = makeConfig({ threshold: 4 });
    const raw    = makeRaw([{ sides: 6, values: [4, 5, 6, 6] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.hits).toBe(4);
  });

  it('should count only dice at or above threshold', () => {
    const config = makeConfig({ threshold: 4 });
    const raw    = makeRaw([{ sides: 6, values: [1, 3, 4, 5, 6] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.hits).toBe(3);
  });

  it('should count glitches when glitchOn is set', () => {
    const config = makeConfig({ glitchOn: 1 });
    const raw    = makeRaw([{ sides: 6, values: [1, 1, 4, 5, 6] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.glitches).toBe(2);
  });

  it('should omit glitches field when glitchOn is undefined', () => {
    const config = makeConfig({ glitchOn: undefined });
    const raw    = makeRaw([{ sides: 6, values: [1, 1, 4, 5] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.glitches).toBeUndefined();
    expect('glitches' in result).toBe(false);
  });

  it('should count glitches independently from hits (dice can be both hit and glitch)', () => {
    // glitchOn: 4 — a value of 4 is both a hit (threshold 4) and a glitch
    const config = makeConfig({ threshold: 4, glitchOn: 4 });
    const raw    = makeRaw([{ sides: 6, values: [4, 4, 1, 2] }]);

    const result = calculi.interpret(raw, config, ctx);

    expect(result.hits).toBe(2);
    expect(result.glitches).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// tier
// ---------------------------------------------------------------------------

describe('Calculi.tier', () => {
  const ctx = makeCtx();

  it('should return miss when hits is 0 and no glitch', () => {
    const config      = makeConfig({ threshold: 4 });
    const raw         = makeRaw([{ sides: 6, values: [1, 2, 3] }]);
    const interpreted = { hits: 0, total: 0, raw };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'miss' });
  });

  it('should return hit when hits is 1 and no glitch', () => {
    const config      = makeConfig({ threshold: 4 });
    const raw         = makeRaw([{ sides: 6, values: [4, 1, 2] }]);
    const interpreted = { hits: 1, total: 1, raw };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'hit' });
  });

  it('should return strong-hit when hits meets strongHitAt threshold', () => {
    const config      = makeConfig({ threshold: 4, strongHitAt: 3 });
    const raw         = makeRaw([{ sides: 6, values: [4, 5, 6] }]);
    const interpreted = { hits: 3, total: 3, raw };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'strong-hit' });
  });

  it('should return hit+glitch when hits>0 and glitch ratio meets threshold', () => {
    // 2 glitches out of 4 dice = 0.5, meets default glitchThreshold of 0.5
    const config      = makeConfig({ threshold: 4, glitchOn: 1 });
    const raw         = makeRaw([{ sides: 6, values: [1, 1, 5, 6] }]);
    const interpreted = { hits: 2, total: 2, raw, glitches: 2 };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'hit', glitch: true });
  });

  it('should return miss+glitch when hits=0 and glitch ratio meets threshold', () => {
    // 2 glitches out of 4 dice = 0.5, meets default glitchThreshold of 0.5
    const config      = makeConfig({ threshold: 5, glitchOn: 1 });
    const raw         = makeRaw([{ sides: 6, values: [1, 1, 2, 3] }]);
    const interpreted = { hits: 0, total: 0, raw, glitches: 2 };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'miss', glitch: true });
  });

  it('should not glitch when glitchOn is undefined', () => {
    // Even with 4 out of 4 dice being value 1, no glitch when glitchOn is absent
    const config      = makeConfig({ threshold: 5, glitchOn: undefined });
    const raw         = makeRaw([{ sides: 6, values: [1, 1, 1, 1] }]);
    const interpreted = { hits: 0, total: 0, raw };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'miss' });
    expect((result as { glitch?: boolean }).glitch).toBeUndefined();
  });

  it('should use default glitchThreshold of 0.5 when not specified', () => {
    // Exactly 0.5 ratio: 2 glitches / 4 dice — should trigger with no explicit glitchThreshold
    const config      = makeConfig({ threshold: 4, glitchOn: 1 });
    const raw         = makeRaw([{ sides: 6, values: [1, 1, 4, 5] }]);
    const interpreted = { hits: 2, total: 2, raw, glitches: 2 };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result.glitch).toBe(true);
  });

  it('should not glitch when glitch ratio is below the default threshold', () => {
    // 1 glitch out of 4 dice = 0.25, below default 0.5
    const config      = makeConfig({ threshold: 4, glitchOn: 1 });
    const raw         = makeRaw([{ sides: 6, values: [1, 4, 5, 6] }]);
    const interpreted = { hits: 3, total: 3, raw, glitches: 1 };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result).toEqual({ tier: 'hit' });
    expect((result as { glitch?: boolean }).glitch).toBeUndefined();
  });

  it('should use custom glitchThreshold when specified', () => {
    // 1 glitch out of 4 dice = 0.25, which meets custom glitchThreshold of 0.25
    const config      = makeConfig({ threshold: 4, glitchOn: 1, glitchThreshold: 0.25 });
    const raw         = makeRaw([{ sides: 6, values: [1, 4, 5, 6] }]);
    const interpreted = { hits: 3, total: 3, raw, glitches: 1 };

    const result = calculi.tier(interpreted, config, ctx);

    expect(result.glitch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

describe('calculi singleton', () => {
  it('should export a pre-constructed Calculi instance', () => {
    expect(calculi).toBeInstanceOf(Calculi);
  });

  it('should have id "calculi"', () => {
    expect(calculi.id).toBe('calculi');
  });

  it('should have label "Calculi"', () => {
    expect(calculi.label).toBe('Calculi');
  });
});

// ---------------------------------------------------------------------------
// #narrow (tested indirectly via public surface)
// ---------------------------------------------------------------------------

describe('Calculi #narrow (via public methods)', () => {
  const ctx = makeCtx();

  it('should throw when config type is not calculi (via interpret)', () => {
    const bad = makeWrongConfig('gradus');
    const raw = makeRaw([{ sides: 6, values: [4] }]);

    expect(() => calculi.interpret(raw, bad, ctx)).toThrow(
      'Calculi received config of type "gradus"',
    );
  });

  it('should throw when config type is not calculi (via tier)', () => {
    const bad         = makeWrongConfig('scala');
    const raw         = makeRaw([{ sides: 6, values: [4] }]);
    const interpreted = { hits: 1, total: 1, raw };

    expect(() => calculi.tier(interpreted, bad, ctx)).toThrow(
      'Calculi received config of type "scala"',
    );
  });
});
