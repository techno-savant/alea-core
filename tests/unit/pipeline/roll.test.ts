import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { rollPool } from '../../../src/pipeline/roll.js';
import {
  makeCtx,
  makeRaw,
  makeSchema,
  makeMockMechanic,
  makeInterpreted,
} from '../../helpers/fixtures.js';
import type { DicePool, CalculiConfig } from '../../../src/types/index.js';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn() },
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const baseConfig: CalculiConfig = {
  type:      'calculi',
  sides:     6,
  count:     2,
  threshold: 4,
};

function makePool(overrides: Partial<DicePool> = {}): DicePool {
  return {
    dice:     [{ sides: 6, count: 2 }],
    modifier: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rollPool', () => {
  beforeEach(() => {
    vi.mocked(MechanicRegistry.get).mockReset();
  });

  // ── Boundary ────────────────────────────────────────────────────────────────

  describe('boundary', () => {
    it('should throw when mechanic is not registered', () => {
      vi.mocked(MechanicRegistry.get).mockReturnValue(undefined);

      const pool   = makePool();
      const schema = makeSchema('missing-mechanic', baseConfig);
      const ctx    = makeCtx();

      expect(() => rollPool(pool, schema, ctx)).toThrow(
        'Alea ROLL: mechanic "missing-mechanic" is not registered',
      );
    });
  });

  // ── Scenario: no fortune ─────────────────────────────────────────────────

  describe('no fortune', () => {
    it('should call mechanic.roll when no fortune modifier', () => {
      const mechanic = makeMockMechanic('calculi');
      vi.spyOn(mechanic, 'roll');
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool();
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      rollPool(pool, schema, ctx);

      expect(mechanic.roll).toHaveBeenCalledOnce();
      expect(mechanic.roll).toHaveBeenCalledWith(pool, baseConfig);
    });

    it('should return the raw result from mechanic.roll when no fortune modifier', () => {
      const raw      = makeRaw([{ sides: 6, values: [5, 3] }]);
      const mechanic = makeMockMechanic('calculi', { roll: vi.fn().mockReturnValue(raw) });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool();
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(result).toEqual(raw);
    });

    it('should fire alea.rollAnimated hook after rolling', () => {
      const raw      = makeRaw([{ sides: 6, values: [4] }]);
      const mechanic = makeMockMechanic('calculi', { roll: vi.fn().mockReturnValue(raw) });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool();
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      rollPool(pool, schema, ctx);

      expect(Hooks.callAll).toHaveBeenCalledWith('alea.rollAnimated', raw, pool, ctx);
    });
  });

  // ── Fortune: favorable ──────────────────────────────────────────────────────

  describe('fortune: favorable', () => {
    it('should roll 2 sets for favorable fortune and keep highest hits', () => {
      const raw1 = makeRaw([{ sides: 6, values: [3, 2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [5, 6] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 5, raw1))
          .mockReturnValueOnce(makeInterpreted(2, 11, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'favorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(mechanic.roll).toHaveBeenCalledTimes(2);
      // raw2 has 2 hits — higher — so it is kept
      expect(result.keptSet).toBe(1);
    });

    it('should set fortuneSets containing both raw sets for favorable fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [3, 2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [5, 6] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 5, raw1))
          .mockReturnValueOnce(makeInterpreted(2, 11, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'favorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(result.fortuneSets).toEqual([raw1, raw2]);
    });

    it('should use first index on hit-count tie for favorable fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [4, 4] }]);
      const raw2 = makeRaw([{ sides: 6, values: [5, 3] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        // both sets have 1 hit — tie
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(1, 8, raw1))
          .mockReturnValueOnce(makeInterpreted(1, 8, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'favorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      // findIndex returns earliest match on tie — index 0 wins
      expect(result.keptSet).toBe(0);
    });
  });

  // ── Fortune: unfavorable ────────────────────────────────────────────────────

  describe('fortune: unfavorable', () => {
    it('should roll 2 sets for unfavorable fortune and keep lowest hits', () => {
      const raw1 = makeRaw([{ sides: 6, values: [5, 6] }]);
      const raw2 = makeRaw([{ sides: 6, values: [2, 1] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(2, 11, raw1))
          .mockReturnValueOnce(makeInterpreted(0, 3, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'unfavorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      // raw2 has 0 hits — lower — so it is kept
      expect(result.keptSet).toBe(1);
    });

    it('should use first index on hit-count tie for unfavorable fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [4, 2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [5, 1] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        // both sets have 1 hit — tie
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(1, 6, raw1))
          .mockReturnValueOnce(makeInterpreted(1, 6, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'unfavorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      // findIndex returns earliest match on tie — index 0 wins
      expect(result.keptSet).toBe(0);
    });

    it('should set fortuneSets containing both raw sets for unfavorable fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [5, 6] }]);
      const raw2 = makeRaw([{ sides: 6, values: [1, 2] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(2, 11, raw1))
          .mockReturnValueOnce(makeInterpreted(0, 3, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'unfavorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(result.fortuneSets).toEqual([raw1, raw2]);
    });
  });

  // ── Fortune: supreme ────────────────────────────────────────────────────────

  describe('fortune: supreme', () => {
    it('should roll 3 sets for supreme fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [3] }]);
      const raw3 = makeRaw([{ sides: 6, values: [5] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll: vi.fn()
          .mockReturnValueOnce(raw1)
          .mockReturnValueOnce(raw2)
          .mockReturnValueOnce(raw3),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 2, raw1))
          .mockReturnValueOnce(makeInterpreted(0, 3, raw2))
          .mockReturnValueOnce(makeInterpreted(1, 5, raw3)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'supreme' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      rollPool(pool, schema, ctx);

      expect(mechanic.roll).toHaveBeenCalledTimes(3);
    });

    it('should keep the set with highest hits across 3 sets for supreme fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [3] }]);
      const raw3 = makeRaw([{ sides: 6, values: [5] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll: vi.fn()
          .mockReturnValueOnce(raw1)
          .mockReturnValueOnce(raw2)
          .mockReturnValueOnce(raw3),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 2, raw1))
          .mockReturnValueOnce(makeInterpreted(0, 3, raw2))
          .mockReturnValueOnce(makeInterpreted(1, 5, raw3)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'supreme' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      // raw3 has 1 hit — highest — so it is kept at index 2
      expect(result.keptSet).toBe(2);
    });

    it('should set fortuneSets containing all 3 raw sets for supreme fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [2] }]);
      const raw2 = makeRaw([{ sides: 6, values: [4] }]);
      const raw3 = makeRaw([{ sides: 6, values: [5] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll: vi.fn()
          .mockReturnValueOnce(raw1)
          .mockReturnValueOnce(raw2)
          .mockReturnValueOnce(raw3),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 2, raw1))
          .mockReturnValueOnce(makeInterpreted(1, 4, raw2))
          .mockReturnValueOnce(makeInterpreted(1, 5, raw3)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'supreme' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(result.fortuneSets).toEqual([raw1, raw2, raw3]);
    });
  });

  // ── Fortune: hook fired after fortune roll ──────────────────────────────────

  describe('fortune hook', () => {
    it('should fire alea.rollAnimated hook after rolling with fortune', () => {
      const raw1 = makeRaw([{ sides: 6, values: [3] }]);
      const raw2 = makeRaw([{ sides: 6, values: [5] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(0, 3, raw1))
          .mockReturnValueOnce(makeInterpreted(1, 5, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'favorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      const result = rollPool(pool, schema, ctx);

      expect(Hooks.callAll).toHaveBeenCalledWith(
        'alea.rollAnimated',
        result,
        pool,
        ctx,
      );
    });
  });

  // ── Fortune: interpret uses schema.mechanicConfig ───────────────────────────

  describe('fortune interpret arguments', () => {
    it('should pass schema.mechanicConfig and ctx to mechanic.interpret for each set', () => {
      const raw1 = makeRaw([{ sides: 6, values: [4] }]);
      const raw2 = makeRaw([{ sides: 6, values: [2] }]);

      const mechanic = makeMockMechanic('calculi', {
        roll:      vi.fn().mockReturnValueOnce(raw1).mockReturnValueOnce(raw2),
        interpret: vi.fn()
          .mockReturnValueOnce(makeInterpreted(1, 4, raw1))
          .mockReturnValueOnce(makeInterpreted(0, 2, raw2)),
      });
      vi.mocked(MechanicRegistry.get).mockReturnValue(mechanic);

      const pool   = makePool({ fortune: 'favorable' });
      const schema = makeSchema('calculi', baseConfig);
      const ctx    = makeCtx();

      rollPool(pool, schema, ctx);

      expect(mechanic.interpret).toHaveBeenCalledTimes(2);
      expect(mechanic.interpret).toHaveBeenNthCalledWith(1, raw1, baseConfig, ctx);
      expect(mechanic.interpret).toHaveBeenNthCalledWith(2, raw2, baseConfig, ctx);
    });
  });
});
