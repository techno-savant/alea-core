import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ModifierRegistry } from '../../../src/registry/ModifierRegistry.js';
import { modifyPool } from '../../../src/pipeline/modify.js';
import { makeCtx, makeSchema } from '../../helpers/fixtures.js';
import type { DicePool, CasusConfig, CalculiConfig } from '../../../src/types/index.js';

vi.mock('../../../src/registry/ModifierRegistry.js', () => ({
  ModifierRegistry: { bySchema: vi.fn().mockReturnValue([]) },
}));

const basePool: DicePool = { dice: [{ sides: 6, count: 3 }], modifier: 0 };

const calculiConfig: CalculiConfig = {
  type:      'calculi',
  sides:     6,
  count:     3,
  threshold: 4,
};

const casusConfig: CasusConfig = {
  type:      'casus',
  wraps:     calculiConfig,
  bonusOn:   6,
  penaltyOn: 1,
};

describe('modifyPool', () => {
  beforeEach(() => {
    (ModifierRegistry.bySchema as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it('should accumulate static modifiers onto pool modifier', () => {
    const schema = makeSchema('calculi', calculiConfig);
    (ModifierRegistry.bySchema as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'mod-a', schemaId: schema.id, value: 2, sourceLabel: 'Bonus A' },
      { id: 'mod-b', schemaId: schema.id, value: -1, sourceLabel: 'Penalty B' },
    ]);
    const ctx = makeCtx();

    const result = modifyPool(basePool, schema, ctx);

    expect(result.pool.modifier).toBe(1);
  });

  it('should record each modifier in returned modifiers array with correct sourceType=schema', () => {
    const schema = makeSchema('calculi', calculiConfig);
    (ModifierRegistry.bySchema as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'mod-x', schemaId: schema.id, value: 3, sourceLabel: 'Power Up' },
      { id: 'mod-y', schemaId: schema.id, value: -2, sourceLabel: 'Debuff' },
    ]);
    const ctx = makeCtx();

    const result = modifyPool(basePool, schema, ctx);

    expect(result.modifiers).toHaveLength(2);
    expect(result.modifiers[0]).toEqual({ value: 3, sourceLabel: 'Power Up', sourceType: 'schema' });
    expect(result.modifiers[1]).toEqual({ value: -2, sourceLabel: 'Debuff', sourceType: 'schema' });
  });

  it('should fire alea.modifyPool hook with poolRef wrapper', () => {
    const schema = makeSchema('calculi', calculiConfig);
    const ctx = makeCtx();

    modifyPool(basePool, schema, ctx);

    expect(Hooks.callAll).toHaveBeenCalledWith(
      'alea.modifyPool',
      expect.objectContaining({ pool: expect.objectContaining({ dice: basePool.dice }) }),
      schema,
      ctx,
    );
  });

  it('should apply pool replacement from hook listener', () => {
    const schema = makeSchema('calculi', calculiConfig);
    const ctx = makeCtx();
    const replacementPool: DicePool = { dice: [{ sides: 8, count: 2 }], modifier: 5 };

    (Hooks.callAll as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, poolRef: { pool: DicePool }) => {
        if (event === 'alea.modifyPool') {
          poolRef.pool = replacementPool;
        }
      },
    );

    const result = modifyPool(basePool, schema, ctx);

    expect(result.pool).toBe(replacementPool);
  });

  it('should return no resolvedCasus for non-casus schema', () => {
    const schema = makeSchema('calculi', calculiConfig);
    const ctx = makeCtx();

    const result = modifyPool(basePool, schema, ctx);

    expect(result.resolvedCasus).toBeUndefined();
  });

  it('should return resolvedCasus for casus schema with bonusOn/penaltyOn copied', () => {
    const schema = makeSchema('casus', casusConfig);
    const ctx = makeCtx();

    const result = modifyPool(basePool, schema, ctx);

    expect(result.resolvedCasus).toBeDefined();
    expect(result.resolvedCasus).toMatchObject({
      type:              'casus',
      bonusOn:           casusConfig.bonusOn,
      penaltyOn:         casusConfig.penaltyOn,
      bonusOnResolved:   casusConfig.bonusOn,
      penaltyOnResolved: casusConfig.penaltyOn,
      penaltySuppressed: false,
      bonusSuppressed:   false,
    });
  });

  it('should fire alea.resolveCasus hook for casus schema', () => {
    const schema = makeSchema('casus', casusConfig);
    const ctx = makeCtx();

    modifyPool(basePool, schema, ctx);

    expect(Hooks.callAll).toHaveBeenCalledWith(
      'alea.resolveCasus',
      expect.objectContaining({ type: 'casus', bonusOnResolved: casusConfig.bonusOn }),
      ctx,
    );
  });
});
