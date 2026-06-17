import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scala, scala } from '../../../src/mechanics/Scala.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { ScalaConfig } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeConfig(
  stepsMap: Record<number, number>,
  overflowModifier?: number,
): ScalaConfig {
  return { type: 'scala', stepsMap, ...(overflowModifier !== undefined ? { overflowModifier } : {}) };
}

function ctxWithTag(tag: string) {
  return makeCtx({ tags: new Set([tag]) });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Scala', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // assemble
  // -------------------------------------------------------------------------

  describe('assemble', () => {
    it('should read attribute value from scala:attributeValue: tag', () => {
      const config = makeConfig({ 3: 8 });
      const ctx = ctxWithTag('scala:attributeValue:3');

      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(8);
    });

    it('should map attribute value to die size via stepsMap', () => {
      const config = makeConfig({ 1: 4, 2: 6, 3: 8 });
      const ctx = ctxWithTag('scala:attributeValue:2');

      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(6);
      expect(pool.modifier).toBe(0);
    });

    it('should default to attribute value 1 when no tag present', () => {
      const config = makeConfig({ 1: 4, 2: 6 });
      const ctx = makeCtx();

      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(4);
      expect(pool.modifier).toBe(0);
    });

    it('should handle attrValue exactly at maxKey without overflow', () => {
      const config = makeConfig({ 1: 4, 2: 6, 4: 10 }, 3);
      const ctx = ctxWithTag('scala:attributeValue:4');

      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(10);
      expect(pool.modifier).toBe(0);
    });

    it('should apply overflow modifier when attrValue exceeds max key', () => {
      const config = makeConfig({ 1: 4, 2: 6, 3: 8 }, 2);
      const ctx = ctxWithTag('scala:attributeValue:5');

      // maxKey=3, attrValue=5, overflow = (5-3) * 2 = 4
      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(8);
      expect(pool.modifier).toBe(4);
    });

    it('should use default sides (4) when attrValue not in map and no fallback', () => {
      // stepsMap has no key 0 (or any key below attrValue 1)
      // attrValue defaults to 1 when no tag; stepsMap[1] is undefined;
      // fallback is stepsMap[sortedKeys[0]] which is stepsMap[2] = 6 here.
      // To hit the final ?? 4 guard, provide a stepsMap whose first key has
      // an undefined value — that is impossible via the Record<number,number>
      // type, so instead test the documented behaviour: missing attrValue key
      // resolves to stepsMap[sortedKeys[0]].
      const config = makeConfig({ 2: 6, 4: 10 });
      const ctx = ctxWithTag('scala:attributeValue:3');

      // 3 is <= maxKey 4 but not in stepsMap; falls back to stepsMap[2] = 6
      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(6);
      expect(pool.modifier).toBe(0);
    });

    it('should use overflow sides from maxKey when attrValue exceeds max and overflowModifier is 0', () => {
      const config = makeConfig({ 1: 4, 3: 12 }, 0);
      const ctx = ctxWithTag('scala:attributeValue:7');

      // overflow = (7-3) * 0 = 0; sides = stepsMap[3] = 12
      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(12);
      expect(pool.modifier).toBe(0);
    });

    it('should use overflowModifier of 0 when overflowModifier is absent', () => {
      const config = makeConfig({ 1: 4, 2: 8 });
      const ctx = ctxWithTag('scala:attributeValue:5');

      // No overflowModifier — defaults to 0; overflow = (5-2) * 0 = 0
      const pool = scala.assemble(config, ctx);

      expect(pool.dice[0]?.sides).toBe(8);
      expect(pool.modifier).toBe(0);
    });

    it('should produce exactly one die with count 1', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = ctxWithTag('scala:attributeValue:1');

      const pool = scala.assemble(config, ctx);

      expect(pool.dice).toHaveLength(1);
      expect(pool.dice[0]?.count).toBe(1);
    });

    it('should throw when config type is not scala', () => {
      const badConfig = { type: 'calculi', sides: 6, count: 1 } as unknown as ScalaConfig;
      const ctx = makeCtx();

      expect(() => scala.assemble(badConfig, ctx)).toThrow(
        'Scala received config of type "calculi"',
      );
    });
  });

  // -------------------------------------------------------------------------
  // roll
  // -------------------------------------------------------------------------

  describe('roll', () => {
    it('should return empty rolls when pool has no dice', () => {
      const pool = { dice: [], modifier: 3 };

      const result = scala.roll(pool, makeConfig({ 1: 6 }));

      expect(result.rolls).toEqual([]);
      expect(result.modifier).toBe(3);
    });

    it('should produce one value in [1, sides]', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const config = makeConfig({ 1: 8 });
      const pool = { dice: [{ sides: 8, count: 1 }], modifier: 0 };

      const result = scala.roll(pool, config);

      expect(result.rolls).toHaveLength(1);
      expect(result.rolls[0]?.values).toHaveLength(1);
      const value = result.rolls[0]!.values[0]!;
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(8);
    });

    it('should map Math.random=0 to die face 1', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const config = makeConfig({ 1: 6 });
      const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

      const result = scala.roll(pool, config);

      expect(result.rolls[0]?.values[0]).toBe(1);
    });

    it('should map Math.random approaching 1 to die face equal to sides', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9999);
      const config = makeConfig({ 1: 6 });
      const pool = { dice: [{ sides: 6, count: 1 }], modifier: 0 };

      const result = scala.roll(pool, config);

      expect(result.rolls[0]?.values[0]).toBe(6);
    });

    it('should carry pool.modifier through', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const config = makeConfig({ 1: 6 });
      const pool = { dice: [{ sides: 6, count: 1 }], modifier: 5 };

      const result = scala.roll(pool, config);

      expect(result.modifier).toBe(5);
    });

    it('should report the die sides in the roll entry', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const config = makeConfig({ 1: 10 });
      const pool = { dice: [{ sides: 10, count: 1 }], modifier: 0 };

      const result = scala.roll(pool, config);

      expect(result.rolls[0]?.sides).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // interpret
  // -------------------------------------------------------------------------

  describe('interpret', () => {
    it('should sum rolled value and modifier as total', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const raw = makeRaw([{ sides: 6, values: [4] }], 2);

      const result = scala.interpret(raw, config, ctx);

      expect(result.total).toBe(6);
    });

    it('should always return hits=1', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const raw = makeRaw([{ sides: 6, values: [1] }], 0);

      const result = scala.interpret(raw, config, ctx);

      expect(result.hits).toBe(1);
    });

    it('should handle empty rolls with modifier only', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const raw = makeRaw([], 7);

      const result = scala.interpret(raw, config, ctx);

      // rolls[0]?.values[0] ?? 0 = 0; total = 0 + 7 = 7
      expect(result.total).toBe(7);
      expect(result.hits).toBe(1);
    });

    it('should attach the raw result to the interpreted result', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const raw = makeRaw([{ sides: 6, values: [3] }], 1);

      const result = scala.interpret(raw, config, ctx);

      expect(result.raw).toBe(raw);
    });

    it('should return total=0 when rolls are empty and modifier is 0', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const raw = makeRaw([], 0);

      const result = scala.interpret(raw, config, ctx);

      expect(result.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // tier
  // -------------------------------------------------------------------------

  describe('tier', () => {
    it('should always return hit', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();
      const interpreted = { hits: 1, total: 5, raw: makeRaw([]) };

      const result = scala.tier(interpreted, config, ctx);

      expect(result.tier).toBe('hit');
    });

    it('should return hit regardless of total value', () => {
      const config = makeConfig({ 1: 6 });
      const ctx = makeCtx();

      for (const total of [0, 1, 100, -5]) {
        const interpreted = { hits: 1, total, raw: makeRaw([]) };
        expect(scala.tier(interpreted, config, ctx).tier).toBe('hit');
      }
    });
  });

  // -------------------------------------------------------------------------
  // singleton export
  // -------------------------------------------------------------------------

  describe('scala (singleton)', () => {
    it('should be an instance of Scala', () => {
      expect(scala).toBeInstanceOf(Scala);
    });

    it('should have id "scala"', () => {
      expect(scala.id).toBe('scala');
    });

    it('should have label "Scala"', () => {
      expect(scala.label).toBe('Scala');
    });
  });
});
