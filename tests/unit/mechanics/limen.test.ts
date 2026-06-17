import { describe, it, expect, vi } from 'vitest';

import { Limen, limen } from '../../../src/mechanics/Limen.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { LimenConfig } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<LimenConfig> = {}): LimenConfig {
  return {
    type:   'limen',
    sides:  6,
    target: 4,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Limen
// ---------------------------------------------------------------------------

describe('Limen', () => {

  // -------------------------------------------------------------------------
  // assemble
  // -------------------------------------------------------------------------

  describe('assemble', () => {

    it('should default count to 1 when not provided in config', () => {
      const config = makeConfig({ count: undefined });

      const pool = limen.assemble(config, makeCtx());

      expect(pool.dice[0].count).toBe(1);
    });

    it('should use provided count when specified', () => {
      const config = makeConfig({ count: 3 });

      const pool = limen.assemble(config, makeCtx());

      expect(pool.dice[0].count).toBe(3);
    });

    it('should return pool with correct sides', () => {
      const config = makeConfig({ sides: 10 });

      const pool = limen.assemble(config, makeCtx());

      expect(pool.dice[0].sides).toBe(10);
    });

    it('should always set pool modifier to 0', () => {
      const config = makeConfig();

      const pool = limen.assemble(config, makeCtx());

      expect(pool.modifier).toBe(0);
    });

    it('should throw when config type is not limen', () => {
      const badConfig = { type: 'calculi', sides: 6, target: 4 } as unknown as LimenConfig;

      expect(() => limen.assemble(badConfig, makeCtx())).toThrow(
        'Limen received config of type "calculi"',
      );
    });

  });

  // -------------------------------------------------------------------------
  // roll
  // -------------------------------------------------------------------------

  describe('roll', () => {

    it('should sum all values when sumMode is unset', () => {
      // Spy on Math.random to return deterministic values: 0 → 1, 0.5 → 4
      const spy = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)     // value: 1
        .mockReturnValueOnce(0.5);  // value: 4 (floor(0.5*6)+1 = 4)

      const config = makeConfig({ count: 2, sides: 6 });
      const pool   = limen.assemble(config, makeCtx());

      const result = limen.roll(pool, config);

      // sum = 1 + 4 = 5; pool.modifier = 0
      expect(result.modifier).toBe(5);

      spy.mockRestore();
    });

    it('should sum all values when sumMode is "sum"', () => {
      const spy = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)     // value: 1
        .mockReturnValueOnce(0.5);  // value: 4

      const config = makeConfig({ count: 2, sides: 6, sumMode: 'sum' });
      const pool   = limen.assemble(config, makeCtx());

      const result = limen.roll(pool, config);

      expect(result.modifier).toBe(5);

      spy.mockRestore();
    });

    it('should pick the highest value when sumMode is "highest"', () => {
      const spy = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)     // value: 1
        .mockReturnValueOnce(0.5);  // value: 4

      const config = makeConfig({ count: 2, sides: 6, sumMode: 'highest' });
      const pool   = limen.assemble(config, makeCtx());

      const result = limen.roll(pool, config);

      // max(1, 4) = 4; pool.modifier = 0
      expect(result.modifier).toBe(4);

      spy.mockRestore();
    });

    it('should incorporate pool.modifier into modifier field', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // all values → 1

      const config = makeConfig({ count: 2, sides: 6 });
      const pool   = { dice: [{ sides: 6, count: 2 }], modifier: 3 };

      const result = limen.roll(pool, config);

      // sum = 1 + 1 = 2; plus pool.modifier 3 → 5
      expect(result.modifier).toBe(5);

      spy.mockRestore();
    });

    it('should fall back to config.sides when pool.dice is empty', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // value: 1

      const config = makeConfig({ sides: 8 });
      const pool   = { dice: [], modifier: 0 };

      const result = limen.roll(pool, config);

      expect(result.modifier).toBe(1);
      expect(result.rolls[0].sides).toBe(8);

      spy.mockRestore();
    });

    it('should store computed value in modifier, not in rolls.values', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // value: 1

      const config = makeConfig({ count: 1, sides: 6 });
      const pool   = limen.assemble(config, makeCtx());

      const result = limen.roll(pool, config);

      // The individual dice values live in rolls[0].values
      expect(result.rolls[0].values).toContain(1);
      // The aggregate lives in modifier
      expect(result.modifier).toBe(1);

      spy.mockRestore();
    });

  });

  // -------------------------------------------------------------------------
  // interpret
  // -------------------------------------------------------------------------

  describe('interpret', () => {

    it('should use raw.modifier as total', () => {
      const config = makeConfig({ target: 10 });
      const raw    = makeRaw([{ sides: 6, values: [3] }], 7);

      const result = limen.interpret(raw, config, makeCtx());

      expect(result.total).toBe(7);
    });

    it('should return hits=1 when total >= target', () => {
      const config = makeConfig({ target: 5 });
      const raw    = makeRaw([{ sides: 6, values: [5] }], 5);

      const result = limen.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(1);
    });

    it('should return hits=1 when total exceeds target', () => {
      const config = makeConfig({ target: 4 });
      const raw    = makeRaw([{ sides: 6, values: [6] }], 8);

      const result = limen.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(1);
    });

    it('should return hits=0 when total < target', () => {
      const config = makeConfig({ target: 6 });
      const raw    = makeRaw([{ sides: 6, values: [3] }], 3);

      const result = limen.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(0);
    });

    it('should attach raw to interpreted result', () => {
      const config = makeConfig({ target: 4 });
      const raw    = makeRaw([{ sides: 6, values: [5] }], 5);

      const result = limen.interpret(raw, config, makeCtx());

      expect(result.raw).toBe(raw);
    });

  });

  // -------------------------------------------------------------------------
  // tier
  // -------------------------------------------------------------------------

  describe('tier', () => {

    it('should return hit when hits >= 1', () => {
      const config      = makeConfig();
      const raw         = makeRaw([], 0);
      const interpreted = { hits: 1, total: 5, raw };

      const result = limen.tier(interpreted, config, makeCtx());

      expect(result.tier).toBe('hit');
    });

    it('should return hit when hits is greater than 1', () => {
      const config      = makeConfig();
      const raw         = makeRaw([], 0);
      const interpreted = { hits: 3, total: 12, raw };

      const result = limen.tier(interpreted, config, makeCtx());

      expect(result.tier).toBe('hit');
    });

    it('should return miss when hits is 0', () => {
      const config      = makeConfig();
      const raw         = makeRaw([], 0);
      const interpreted = { hits: 0, total: 2, raw };

      const result = limen.tier(interpreted, config, makeCtx());

      expect(result.tier).toBe('miss');
    });

  });

  // -------------------------------------------------------------------------
  // singleton export
  // -------------------------------------------------------------------------

  describe('singleton export', () => {

    it('should export limen as an instance of Limen', () => {
      expect(limen).toBeInstanceOf(Limen);
    });

    it('should have id "limen"', () => {
      expect(limen.id).toBe('limen');
    });

    it('should have label "Limen"', () => {
      expect(limen.label).toBe('Limen');
    });

  });

});
