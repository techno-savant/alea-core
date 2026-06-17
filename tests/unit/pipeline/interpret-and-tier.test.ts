import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { interpretRoll } from '../../../src/pipeline/interpret.js';
import { tierRoll } from '../../../src/pipeline/tier.js';
import { makeCtx, makeRaw, makeSchema, makeMockMechanic, makeInterpreted } from '../../helpers/fixtures.js';
import type { CalculiConfig } from '../../../src/types/index.js';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn() },
}));

const mockGet = vi.mocked(MechanicRegistry.get);

// ---------------------------------------------------------------------------
// interpretRoll
// ---------------------------------------------------------------------------

describe('interpretRoll', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockReturnValue(makeMockMechanic('standard'));
  });

  // -------------------------------------------------------------------------
  // Boundary Tests
  // -------------------------------------------------------------------------

  describe('mechanic registration', () => {
    it('should throw when mechanic is not registered', () => {
      mockGet.mockReturnValue(undefined as unknown as ReturnType<typeof makeMockMechanic>);
      const raw = makeRaw([{ sides: 6, values: [3] }]);
      const schema = makeSchema('unknown-mechanic', {});
      const ctx = makeCtx();

      expect(() => interpretRoll(raw, schema, ctx)).toThrow(
        'Alea INTERPRET: mechanic "unknown-mechanic" is not registered',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario Tests
  // -------------------------------------------------------------------------

  describe('delegation to mechanic.interpret', () => {
    it('should delegate to mechanic.interpret and return result', () => {
      const raw = makeRaw([{ sides: 6, values: [5] }]);
      const expectedInterpreted = makeInterpreted(1, 5, raw);
      const config: CalculiConfig = {};
      const mechanic = makeMockMechanic('standard', {
        interpret: vi.fn().mockReturnValue(expectedInterpreted),
      });
      mockGet.mockReturnValue(mechanic);
      const schema = makeSchema('standard', config);
      const ctx = makeCtx();

      const result = interpretRoll(raw, schema, ctx);

      expect(mechanic.interpret).toHaveBeenCalledWith(raw, config, ctx);
      expect(result).toEqual(expectedInterpreted);
    });
  });
});

// ---------------------------------------------------------------------------
// tierRoll
// ---------------------------------------------------------------------------

describe('tierRoll', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockReturnValue(makeMockMechanic('standard'));
  });

  // -------------------------------------------------------------------------
  // Boundary Tests
  // -------------------------------------------------------------------------

  describe('mechanic registration', () => {
    it('should throw when mechanic is not registered', () => {
      mockGet.mockReturnValue(undefined as unknown as ReturnType<typeof makeMockMechanic>);
      const interpreted = makeInterpreted(1, 4, makeRaw([]));
      const schema = makeSchema('unknown-mechanic', {});
      const ctx = makeCtx();

      expect(() => tierRoll(interpreted, schema, ctx)).toThrow(
        'Alea TIER: mechanic "unknown-mechanic" is not registered',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario Tests
  // -------------------------------------------------------------------------

  describe('delegation to mechanic.tier', () => {
    it('should delegate to mechanic.tier and return result', () => {
      const interpreted = makeInterpreted(2, 9, makeRaw([{ sides: 10, values: [9] }]));
      const expectedTier = { tier: 'hit' as const };
      const config: CalculiConfig = {};
      const mechanic = makeMockMechanic('standard', {
        tier: vi.fn().mockReturnValue(expectedTier),
      });
      mockGet.mockReturnValue(mechanic);
      const schema = makeSchema('standard', config);
      const ctx = makeCtx();

      const result = tierRoll(interpreted, schema, ctx);

      expect(mechanic.tier).toHaveBeenCalledWith(interpreted, config, ctx);
      expect(result).toEqual(expectedTier);
    });
  });
});
