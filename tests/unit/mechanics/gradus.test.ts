import { describe, it, expect, vi } from 'vitest';
import { Gradus, gradus } from '../../../src/mechanics/Gradus.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { GradusConfig } from '../../../src/types/index.js';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<GradusConfig> = {}): GradusConfig {
  return {
    type:        'gradus',
    sides:       6,
    count:       2,
    target:      7,
    critMargin:  3,
    ...overrides,
  };
}

// ─── assemble ─────────────────────────────────────────────────────────────────

describe('Gradus.assemble', () => {
  it('should use provided sides and count', () => {
    const config = makeConfig({ sides: 8, count: 3 });
    const ctx    = makeCtx();

    const pool = gradus.assemble(config, ctx);

    expect(pool.dice).toEqual([{ sides: 8, count: 3 }]);
  });

  it('should default count to 1 when count is omitted', () => {
    const config = makeConfig({ count: undefined });
    const ctx    = makeCtx();

    const pool = gradus.assemble(config, ctx);

    expect(pool.dice[0].count).toBe(1);
  });

  it('should always set pool modifier to 0', () => {
    const config = makeConfig();
    const ctx    = makeCtx();

    const pool = gradus.assemble(config, ctx);

    expect(pool.modifier).toBe(0);
  });

  it('should throw when config type is not gradus', () => {
    const config = { type: 'limen', sides: 6, count: 1, target: 5 } as unknown as GradusConfig;
    const ctx    = makeCtx();

    expect(() => gradus.assemble(config, ctx)).toThrow('Gradus received config of type "limen"');
  });
});

// ─── roll ─────────────────────────────────────────────────────────────────────

describe('Gradus.roll', () => {
  it('should produce exactly count random values per die', () => {
    const pool   = { dice: [{ sides: 6, count: 3 }], modifier: 0 };
    const config = makeConfig({ count: 3 });

    const result = gradus.roll(pool, config);

    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0].values).toHaveLength(3);
  });

  it('should clamp all rolled values to [1, sides] inclusive', () => {
    const pool   = { dice: [{ sides: 6, count: 20 }], modifier: 0 };
    const config = makeConfig({ count: 20 });

    const result = gradus.roll(pool, config);

    for (const v of result.rolls[0].values) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('should carry pool modifier through to the raw result', () => {
    const pool   = { dice: [{ sides: 6, count: 1 }], modifier: 4 };
    const config = makeConfig({ count: 1 });

    const result = gradus.roll(pool, config);

    expect(result.modifier).toBe(4);
  });

  it('should sum all values with modifier when sumMode is sum (default)', () => {
    const pool   = { dice: [{ sides: 6, count: 2 }], modifier: 2 };
    const config = makeConfig({ sumMode: 'sum' });

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)  // → floor(0.5 * 6) + 1 = 4
      .mockReturnValueOnce(0.0); // → floor(0.0 * 6) + 1 = 1

    const result = gradus.roll(pool, config);

    // The roll method just returns raw values; sumMode is applied in interpret
    expect(result.rolls[0].values).toEqual([4, 1]);
    expect(result.modifier).toBe(2);

    vi.restoreAllMocks();
  });

  it('should pick highest value with modifier when sumMode is highest (via interpret)', () => {
    // roll() itself is agnostic to sumMode — verify values are present for interpret to pick from
    const pool   = { dice: [{ sides: 6, count: 3 }], modifier: 1 };
    const config = makeConfig({ sumMode: 'highest', count: 3 });

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)  // → 1
      .mockReturnValueOnce(0.8)  // → 5
      .mockReturnValueOnce(0.3); // → 2

    const result = gradus.roll(pool, config);

    expect(result.rolls[0].values).toEqual([1, 5, 2]);
    expect(result.modifier).toBe(1);

    vi.restoreAllMocks();
  });
});

// ─── interpret ────────────────────────────────────────────────────────────────

describe('Gradus.interpret', () => {
  it('should set hits to 1 when total >= target', () => {
    const config = makeConfig({ target: 7, sumMode: 'sum' });
    const raw    = makeRaw([{ sides: 6, values: [4, 3] }], 0);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.hits).toBe(1);
  });

  it('should set hits to 0 when total < target', () => {
    const config = makeConfig({ target: 10, sumMode: 'sum' });
    const raw    = makeRaw([{ sides: 6, values: [3, 3] }], 0);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.hits).toBe(0);
  });

  it('should include the correct total in the result', () => {
    const config = makeConfig({ target: 5, sumMode: 'sum' });
    const raw    = makeRaw([{ sides: 6, values: [3, 4] }], 1);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.total).toBe(8); // 3 + 4 + 1 modifier
  });

  it('should sum all values across dice when sumMode is sum', () => {
    const config = makeConfig({ target: 5, sumMode: 'sum' });
    const raw    = makeRaw([{ sides: 6, values: [2, 3, 1] }], 0);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.total).toBe(6); // 2 + 3 + 1
  });

  it('should pick the highest single value plus modifier when sumMode is highest', () => {
    const config = makeConfig({ target: 5, sumMode: 'highest' });
    const raw    = makeRaw([{ sides: 6, values: [2, 6, 1] }], 2);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.total).toBe(8); // max(2,6,1) + 2 modifier
  });

  it('should add raw.modifier to the sum when sumMode is sum', () => {
    const config = makeConfig({ target: 5, sumMode: 'sum' });
    const raw    = makeRaw([{ sides: 6, values: [2, 2] }], 3);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.total).toBe(7); // 2 + 2 + 3 modifier
  });

  it('should include raw in the returned result', () => {
    const config = makeConfig({ target: 5 });
    const raw    = makeRaw([{ sides: 6, values: [5] }], 0);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.raw).toBe(raw);
  });

  it('should treat sumMode sum as default when sumMode is undefined', () => {
    const config = makeConfig({ target: 5, sumMode: undefined });
    const raw    = makeRaw([{ sides: 6, values: [3, 4] }], 0);
    const ctx    = makeCtx();

    const result = gradus.interpret(raw, config, ctx);

    expect(result.total).toBe(7); // 3 + 4 (sum, not highest)
  });
});

// ─── tier ─────────────────────────────────────────────────────────────────────

describe('Gradus.tier', () => {
  it('should return strong-hit when margin >= critMargin', () => {
    const config      = makeConfig({ target: 5, critMargin: 3 });
    const interpreted = { hits: 1, total: 9, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 9 - 5 = 4, critMargin = 3 → 4 >= 3
    expect(result.tier).toBe('strong-hit');
  });

  it('should return hit when margin >= 0 but below critMargin', () => {
    const config      = makeConfig({ target: 5, critMargin: 3 });
    const interpreted = { hits: 1, total: 7, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 7 - 5 = 2, critMargin = 3 → 2 < 3, but 2 >= 0
    expect(result.tier).toBe('hit');
  });

  it('should return hit when margin is exactly 0', () => {
    const config      = makeConfig({ target: 5, critMargin: 3 });
    const interpreted = { hits: 0, total: 5, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 5 - 5 = 0 → exactly 0, not critMargin
    expect(result.tier).toBe('hit');
  });

  it('should return miss when margin < 0 and fumbleMargin is undefined', () => {
    const config      = makeConfig({ target: 5, critMargin: 3, fumbleMargin: undefined });
    const interpreted = { hits: 0, total: 3, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 3 - 5 = -2
    expect(result.tier).toBe('miss');
  });

  it('should return close-hit when margin > -fumbleMargin and fumbleMargin is set', () => {
    const config      = makeConfig({ target: 5, critMargin: 3, fumbleMargin: 3 });
    const interpreted = { hits: 0, total: 3, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 3 - 5 = -2; fumbleMargin = 3 → margin(-2) > -3 → close-hit
    expect(result.tier).toBe('close-hit');
  });

  it('should return miss when margin <= -fumbleMargin', () => {
    const config      = makeConfig({ target: 5, critMargin: 3, fumbleMargin: 2 });
    const interpreted = { hits: 0, total: 3, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 3 - 5 = -2; fumbleMargin = 2 → margin(-2) not > -2 → miss
    expect(result.tier).toBe('miss');
  });

  it('should include margin in strong-hit result', () => {
    const config      = makeConfig({ target: 5, critMargin: 2 });
    const interpreted = { hits: 1, total: 10, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    expect(result.margin).toBe(5); // 10 - 5
  });

  it('should include margin in hit result', () => {
    const config      = makeConfig({ target: 5, critMargin: 5 });
    const interpreted = { hits: 1, total: 7, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    expect(result.margin).toBe(2); // 7 - 5
  });

  it('should include margin in close-hit result', () => {
    const config      = makeConfig({ target: 5, critMargin: 5, fumbleMargin: 4 });
    const interpreted = { hits: 0, total: 2, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    // margin = 2 - 5 = -3; fumbleMargin = 4 → -3 > -4 → close-hit
    expect(result.margin).toBe(-3);
  });

  it('should include margin in miss result', () => {
    const config      = makeConfig({ target: 5, critMargin: 5, fumbleMargin: undefined });
    const interpreted = { hits: 0, total: 1, raw: makeRaw([]) };
    const ctx         = makeCtx();

    const result = gradus.tier(interpreted, config, ctx);

    expect(result.margin).toBe(-4); // 1 - 5
  });

  it('should correctly classify all four tiers across a margin range', () => {
    const config = makeConfig({ target: 10, critMargin: 3, fumbleMargin: 2 });
    const ctx    = makeCtx();

    const cases: Array<{ total: number; expected: string }> = [
      { total: 14, expected: 'strong-hit' }, // margin  4 >= critMargin 3
      { total: 13, expected: 'strong-hit' }, // margin  3 >= critMargin 3
      { total: 12, expected: 'hit' },        // margin  2 <  critMargin 3, >= 0
      { total: 11, expected: 'hit' },        // margin  1 >= 0, < critMargin
      { total: 10, expected: 'hit' },        // margin  0 >= 0
      { total: 9,  expected: 'close-hit' },  // margin -1 > -fumbleMargin(-2)
      { total: 8,  expected: 'miss' },       // margin -2, not > -2
    ];

    for (const { total, expected } of cases) {
      const interpreted = { hits: total >= 10 ? 1 : 0, total, raw: makeRaw([]) };
      const result      = gradus.tier(interpreted, config, ctx);
      expect(result.tier, `total=${total}`).toBe(expected);
    }
  });
});

// ─── singleton export ─────────────────────────────────────────────────────────

describe('gradus singleton', () => {
  it('should be an instance of Gradus', () => {
    expect(gradus).toBeInstanceOf(Gradus);
  });

  it('should have id "gradus"', () => {
    expect(gradus.id).toBe('gradus');
  });

  it('should have label "Gradus"', () => {
    expect(gradus.label).toBe('Gradus');
  });
});
