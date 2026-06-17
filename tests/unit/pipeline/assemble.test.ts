import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { assemblePool } from '../../../src/pipeline/assemble.js';
import { makeCtx, makeSchema, makeMockMechanic } from '../../helpers/fixtures.js';
import type { CalculiConfig, DicePool } from '../../../src/types/index.js';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn(), register: vi.fn(), has: vi.fn() },
}));

const mockGet = vi.mocked(MechanicRegistry.get);

describe('assemblePool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockReturnValue(makeMockMechanic('standard'));
  });

  // ---------------------------------------------------------------------------
  // Boundary Tests
  // ---------------------------------------------------------------------------

  describe('mechanic registration', () => {
    it('should throw when mechanic is not registered', () => {
      mockGet.mockReturnValue(undefined as unknown as ReturnType<typeof makeMockMechanic>);
      const schema = makeSchema('unknown-mechanic', {});
      const ctx = makeCtx();

      expect(() => assemblePool(schema, ctx)).toThrow(
        'Alea ASSEMBLE: mechanic "unknown-mechanic" is not registered',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario Tests
  // ---------------------------------------------------------------------------

  describe('delegation to mechanic.assemble', () => {
    it('should delegate to mechanic.assemble and return pool', () => {
      const expectedPool: DicePool = { dice: [{ sides: 8, count: 3 }], modifier: 2 };
      const mechanic = makeMockMechanic('standard', {
        assemble: vi.fn().mockReturnValue(expectedPool),
      });
      mockGet.mockReturnValue(mechanic);
      const config: CalculiConfig = {};
      const schema = makeSchema('standard', config);
      const ctx = makeCtx();

      const result = assemblePool(schema, ctx);

      expect(mechanic.assemble).toHaveBeenCalledWith(config, ctx);
      expect(result).toEqual(expectedPool);
    });

    it('should apply poolBuilder to override die count on first die', () => {
      const mechanic = makeMockMechanic('standard', {
        assemble: vi.fn().mockReturnValue({ dice: [{ sides: 6, count: 1 }], modifier: 0 }),
      });
      mockGet.mockReturnValue(mechanic);
      const schema = makeSchema('standard', {}, { poolBuilder: (_ctx) => 4 });
      const ctx = makeCtx();

      const result = assemblePool(schema, ctx);

      expect(result.dice[0]).toMatchObject({ sides: 6, count: 4 });
    });

    it('should preserve remaining dice when poolBuilder overrides count', () => {
      const mechanic = makeMockMechanic('standard', {
        assemble: vi.fn().mockReturnValue({
          dice: [
            { sides: 6, count: 1 },
            { sides: 12, count: 2 },
            { sides: 4, count: 1 },
          ],
          modifier: 1,
        }),
      });
      mockGet.mockReturnValue(mechanic);
      const schema = makeSchema('standard', {}, { poolBuilder: (_ctx) => 5 });
      const ctx = makeCtx();

      const result = assemblePool(schema, ctx);

      expect(result.dice).toHaveLength(3);
      expect(result.dice[0]).toMatchObject({ sides: 6, count: 5 });
      expect(result.dice[1]).toMatchObject({ sides: 12, count: 2 });
      expect(result.dice[2]).toMatchObject({ sides: 4, count: 1 });
      expect(result.modifier).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Failure Tests
  // ---------------------------------------------------------------------------

  describe('poolBuilder validation', () => {
    it('should throw when poolBuilder returns 0', () => {
      const schema = makeSchema('standard', {}, { id: 'my-schema', poolBuilder: (_ctx) => 0 });
      const ctx = makeCtx();

      expect(() => assemblePool(schema, ctx)).toThrow(
        'Alea ASSEMBLE: poolBuilder for schema "my-schema" returned 0 — must be ≥ 1',
      );
    });

    it('should throw when poolBuilder returns a negative number', () => {
      const schema = makeSchema('standard', {}, { id: 'my-schema', poolBuilder: (_ctx) => -3 });
      const ctx = makeCtx();

      expect(() => assemblePool(schema, ctx)).toThrow(
        'Alea ASSEMBLE: poolBuilder for schema "my-schema" returned -3 — must be ≥ 1',
      );
    });

    it('should throw when mechanic returns empty dice array and poolBuilder is set', () => {
      const mechanic = makeMockMechanic('standard', {
        assemble: vi.fn().mockReturnValue({ dice: [], modifier: 0 }),
      });
      mockGet.mockReturnValue(mechanic);
      const schema = makeSchema('standard', {}, { id: 'my-schema', poolBuilder: (_ctx) => 2 });
      const ctx = makeCtx();

      expect(() => assemblePool(schema, ctx)).toThrow(
        'Alea ASSEMBLE: poolBuilder for schema "my-schema" — pool has no dice',
      );
    });
  });
});
