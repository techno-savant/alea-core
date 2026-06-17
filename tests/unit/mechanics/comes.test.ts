import { vi, describe, it, expect, beforeEach } from 'vitest';

import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { Comes, comes } from '../../../src/mechanics/Comes.js';
import { makeCtx, makeRaw, makeMockMechanic, makeInterpreted } from '../../helpers/fixtures.js';
import type { ComesConfig, RawRollResult } from '../../../src/types/index.js';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn(), register: vi.fn(), has: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGet = MechanicRegistry.get as ReturnType<typeof vi.fn>;

function makeConfig(overrides: Partial<ComesConfig> = {}): ComesConfig {
  return {
    type:       'comes',
    comesSides: 6,
    wraps:      { type: 'mock' } as unknown as ComesConfig['wraps'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Comes
// ---------------------------------------------------------------------------

describe('Comes', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // assemble
  // -------------------------------------------------------------------------

  describe('assemble', () => {

    it('should append companion die after inner pool dice', () => {
      const inner = makeMockMechanic('mock', {
        assemble: () => ({
          dice:     [{ sides: 6, count: 3 }],
          modifier: 0,
        }),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig({ comesSides: 8 });

      const pool = comes.assemble(config, makeCtx());

      expect(pool.dice).toHaveLength(2);
      expect(pool.dice[0]).toEqual({ sides: 6, count: 3 });
      expect(pool.dice[1].sides).toBe(8);
      expect(pool.dice[1].count).toBe(1);
    });

    it('should use comesSides for companion die', () => {
      const inner = makeMockMechanic('mock', {
        assemble: () => ({ dice: [], modifier: 0 }),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig({ comesSides: 12 });

      const pool = comes.assemble(config, makeCtx());

      expect(pool.dice.at(-1)!.sides).toBe(12);
    });

    it('should use comesLabel when provided', () => {
      const inner = makeMockMechanic('mock', {
        assemble: () => ({ dice: [], modifier: 0 }),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig({ comesLabel: 'Fortune Die' });

      const pool = comes.assemble(config, makeCtx());

      expect(pool.dice.at(-1)!.label).toBe('Fortune Die');
    });

    it('should default companion label to "Wild Die"', () => {
      const inner = makeMockMechanic('mock', {
        assemble: () => ({ dice: [], modifier: 0 }),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig({ comesLabel: undefined });

      const pool = comes.assemble(config, makeCtx());

      expect(pool.dice.at(-1)!.label).toBe('Wild Die');
    });

    it('should throw when inner mechanic is not registered', () => {
      mockGet.mockReturnValue(undefined);

      const config = makeConfig();

      expect(() => comes.assemble(config, makeCtx())).toThrow(
        'Comes: inner mechanic "mock" is not registered',
      );
    });

    it('should throw when config type is not comes', () => {
      const badConfig = { type: 'limen', sides: 6, target: 4 } as unknown as ComesConfig;

      expect(() => comes.assemble(badConfig, makeCtx())).toThrow(
        'Comes received config of type "limen"',
      );
    });

  });

  // -------------------------------------------------------------------------
  // roll
  // -------------------------------------------------------------------------

  describe('roll', () => {

    it('should roll all dice including companion', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const pool = {
        dice: [
          { sides: 6, count: 2 },
          { sides: 8, count: 1 },
        ],
        modifier: 0,
      };
      const config = makeConfig();

      const result = comes.roll(pool, config);

      // 2 dice groups → 2 RawDieResult entries
      expect(result.rolls).toHaveLength(2);
      // first group: 2 values
      expect(result.rolls[0].values).toHaveLength(2);
      // companion group: 1 value
      expect(result.rolls[1].values).toHaveLength(1);

      spy.mockRestore();
    });

    it('should produce one value per die face count', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const pool = {
        dice: [
          { sides: 6, count: 3 },
          { sides: 6, count: 1 },
        ],
        modifier: 0,
      };
      const config = makeConfig();

      const result = comes.roll(pool, config);

      expect(result.rolls[0].values).toHaveLength(3);
      expect(result.rolls[1].values).toHaveLength(1);

      spy.mockRestore();
    });

    it('should preserve pool modifier in roll result', () => {
      const pool   = { dice: [{ sides: 6, count: 1 }], modifier: 5 };
      const config = makeConfig();

      const result = comes.roll(pool, config);

      expect(result.modifier).toBe(5);
    });

    it('should produce values within valid die range', () => {
      const pool   = { dice: [{ sides: 6, count: 1 }], modifier: 0 };
      const config = makeConfig();

      const result = comes.roll(pool, config);

      for (const roll of result.rolls) {
        for (const v of roll.values) {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(roll.sides);
        }
      }
    });

  });

  // -------------------------------------------------------------------------
  // interpret
  // -------------------------------------------------------------------------

  describe('interpret', () => {

    it('should throw when companion die is missing from raw rolls', () => {
      const inner = makeMockMechanic();
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([]);

      expect(() => comes.interpret(raw, config, makeCtx())).toThrow(
        'Alea Comes: companion die missing from roll result',
      );
    });

    it('should keep companion result when companion has more hits', () => {
      const primaryResult   = makeInterpreted(1, 3, makeRaw([]));
      const companionResult = makeInterpreted(3, 5, makeRaw([]));

      const inner = makeMockMechanic('mock', {
        interpret: vi.fn()
          .mockReturnValueOnce(primaryResult)
          .mockReturnValueOnce(companionResult),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [2] },
        { sides: 6, values: [5] },
      ]);

      const result = comes.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(companionResult.hits);
      expect(result.total).toBe(companionResult.total);
    });

    it('should keep primary result when primary has more hits', () => {
      const primaryResult   = makeInterpreted(4, 8, makeRaw([]));
      const companionResult = makeInterpreted(1, 2, makeRaw([]));

      const inner = makeMockMechanic('mock', {
        interpret: vi.fn()
          .mockReturnValueOnce(primaryResult)
          .mockReturnValueOnce(companionResult),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [5] },
        { sides: 6, values: [2] },
      ]);

      const result = comes.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(primaryResult.hits);
      expect(result.total).toBe(primaryResult.total);
    });

    it('should keep primary result when hits are equal (companion does not win ties)', () => {
      const primaryResult   = makeInterpreted(2, 4, makeRaw([]));
      const companionResult = makeInterpreted(2, 3, makeRaw([]));

      const inner = makeMockMechanic('mock', {
        interpret: vi.fn()
          .mockReturnValueOnce(primaryResult)
          .mockReturnValueOnce(companionResult),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [4] },
        { sides: 6, values: [3] },
      ]);

      const result = comes.interpret(raw, config, makeCtx());

      expect(result.hits).toBe(primaryResult.hits);
      expect(result.total).toBe(primaryResult.total);
    });

    it('should use raw from original full roll in returned result', () => {
      const primaryResult   = makeInterpreted(3, 6, makeRaw([]));
      const companionResult = makeInterpreted(1, 2, makeRaw([]));

      const inner = makeMockMechanic('mock', {
        interpret: vi.fn()
          .mockReturnValueOnce(primaryResult)
          .mockReturnValueOnce(companionResult),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [5] },
        { sides: 6, values: [2] },
      ]);

      const result = comes.interpret(raw, config, makeCtx());

      expect(result.raw).toBe(raw);
    });

    it('should use raw from original full roll even when companion wins', () => {
      const primaryResult   = makeInterpreted(0, 1, makeRaw([]));
      const companionResult = makeInterpreted(4, 6, makeRaw([]));

      const inner = makeMockMechanic('mock', {
        interpret: vi.fn()
          .mockReturnValueOnce(primaryResult)
          .mockReturnValueOnce(companionResult),
      });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [1] },
        { sides: 6, values: [6] },
      ]);

      const result = comes.interpret(raw, config, makeCtx());

      expect(result.raw).toBe(raw);
    });

    it('should pass only primary rolls (all but last) to inner.interpret for primary', () => {
      const interpretFn = vi.fn().mockReturnValue(makeInterpreted(1, 3, makeRaw([])));
      const inner = makeMockMechanic('mock', { interpret: interpretFn });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [2] },
        { sides: 6, values: [4] },
        { sides: 6, values: [5] }, // companion — last entry
      ]);

      comes.interpret(raw, config, makeCtx());

      // First call: primary slice (first two entries)
      const primaryArg: RawRollResult = interpretFn.mock.calls[0][0];
      expect(primaryArg.rolls).toHaveLength(2);
      expect(primaryArg.rolls[0]).toBe(raw.rolls[0]);
      expect(primaryArg.rolls[1]).toBe(raw.rolls[1]);
    });

    it('should pass only companion roll (last entry) to inner.interpret for companion', () => {
      const interpretFn = vi.fn().mockReturnValue(makeInterpreted(1, 3, makeRaw([])));
      const inner = makeMockMechanic('mock', { interpret: interpretFn });
      mockGet.mockReturnValue(inner);

      const config = makeConfig();
      const raw    = makeRaw([
        { sides: 6, values: [2] },
        { sides: 6, values: [5] }, // companion
      ]);

      comes.interpret(raw, config, makeCtx());

      // Second call: companion (last entry only, modifier 0)
      const companionArg: RawRollResult = interpretFn.mock.calls[1][0];
      expect(companionArg.rolls).toHaveLength(1);
      expect(companionArg.rolls[0]).toBe(raw.rolls[1]);
      expect(companionArg.modifier).toBe(0);
    });

  });

  // -------------------------------------------------------------------------
  // tier
  // -------------------------------------------------------------------------

  describe('tier', () => {

    it('should delegate tier to inner mechanic', () => {
      const inner = makeMockMechanic('mock', {
        tier: (_interpreted, _config, _ctx) => ({ tier: 'strong-hit' as const }),
      });
      mockGet.mockReturnValue(inner);

      const config      = makeConfig();
      const raw         = makeRaw([]);
      const interpreted = makeInterpreted(5, 10, raw);

      const result = comes.tier(interpreted, config, makeCtx());

      expect(result.tier).toBe('strong-hit');
    });

    it('should forward interpreted and context to inner.tier', () => {
      const tierFn = vi.fn().mockReturnValue({ tier: 'hit' as const });
      const inner  = makeMockMechanic('mock', { tier: tierFn });
      mockGet.mockReturnValue(inner);

      const config      = makeConfig();
      const ctx         = makeCtx();
      const raw         = makeRaw([]);
      const interpreted = makeInterpreted(2, 4, raw);

      comes.tier(interpreted, config, ctx);

      expect(tierFn).toHaveBeenCalledWith(interpreted, config.wraps, ctx);
    });

    it('should throw when inner mechanic is not registered during tier', () => {
      mockGet.mockReturnValue(undefined);

      const config      = makeConfig();
      const interpreted = makeInterpreted(1, 3, makeRaw([]));

      expect(() => comes.tier(interpreted, config, makeCtx())).toThrow(
        'Comes: inner mechanic "mock" is not registered',
      );
    });

  });

  // -------------------------------------------------------------------------
  // singleton export
  // -------------------------------------------------------------------------

  describe('singleton export', () => {

    it('should export comes as an instance of Comes', () => {
      expect(comes).toBeInstanceOf(Comes);
    });

    it('should have id "comes"', () => {
      expect(comes.id).toBe('comes');
    });

    it('should have label "Comes (Companion Die)"', () => {
      expect(comes.label).toBe('Comes (Companion Die)');
    });

  });

});
