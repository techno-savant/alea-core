import { describe, it, expect } from 'vitest';
import { Certamen, certamen } from '../../../src/mechanics/Certamen.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { CertamenConfig, SequenceContext, RollResult } from '../../../src/types/index.js';

// ---------------------------------------------------------------------------
// Shared config factories
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CertamenConfig> = {}): CertamenConfig {
  return {
    type:           'certamen',
    attackerSchema: 'attacker-schema',
    defenderSchema: 'defender-schema',
    netHitTiers: {
      strongHit: 4,
      hit:       2,
      glancing:  1,
    },
    ...overrides,
  };
}

function makeWrongConfig(type = 'calculi') {
  return { type } as unknown as import('../../../src/types/index.js').MechanicConfig;
}

function makeRollResult(hits: number): RollResult {
  const raw = makeRaw([]);
  return {
    resolutionId: 'test-resolution',
    mechanicId:   'calculi',
    tier:         'hit',
    hits,
    raw,
    modifiers:    [],
    interpreted:  { hits, total: hits, raw },
    tiered:       { tier: 'hit' },
    timestamp:    0,
  };
}

function makeSequence(rolls: { schemaId: string; hits: number }[]): SequenceContext {
  return {
    id:    'test-sequence',
    rolls: rolls.map(({ schemaId, hits }) => ({
      schemaId,
      result: makeRollResult(hits),
    })),
  };
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

describe('Certamen.assemble', () => {
  it('should return empty pool with 0 modifier', () => {
    const config = makeConfig();
    const ctx    = makeCtx();

    const pool = certamen.assemble(config, ctx);

    expect(pool).toEqual({ dice: [], modifier: 0 });
  });
});

// ---------------------------------------------------------------------------
// roll
// ---------------------------------------------------------------------------

describe('Certamen.roll', () => {
  it('should return empty rolls with 0 modifier', () => {
    const config = makeConfig();
    const pool   = { dice: [], modifier: 0 };

    const result = certamen.roll(pool, config);

    expect(result).toEqual({ rolls: [], modifier: 0 });
  });
});

// ---------------------------------------------------------------------------
// interpret
// ---------------------------------------------------------------------------

describe('Certamen.interpret', () => {
  const raw = makeRaw([]);

  it('should compute netHits as max(0, attackerHits - defenderHits)', () => {
    const config = makeConfig();
    const ctx    = makeCtx({
      sequence: makeSequence([
        { schemaId: 'attacker-schema', hits: 5 },
        { schemaId: 'defender-schema', hits: 2 },
      ]),
    });

    const result = certamen.interpret(raw, config, ctx);

    expect(result.hits).toBe(3);
    expect(result.total).toBe(3);
    expect(result.raw).toBe(raw);
  });

  it('should clamp netHits to 0 when defender wins', () => {
    const config = makeConfig();
    const ctx    = makeCtx({
      sequence: makeSequence([
        { schemaId: 'attacker-schema', hits: 1 },
        { schemaId: 'defender-schema', hits: 4 },
      ]),
    });

    const result = certamen.interpret(raw, config, ctx);

    expect(result.hits).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should return 0 netHits when attacker schema missing from sequence', () => {
    const config = makeConfig();
    const ctx    = makeCtx({
      sequence: makeSequence([
        { schemaId: 'defender-schema', hits: 3 },
      ]),
    });

    const result = certamen.interpret(raw, config, ctx);

    expect(result.hits).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should return 0 netHits when defender schema missing from sequence', () => {
    const config = makeConfig();
    const ctx    = makeCtx({
      sequence: makeSequence([
        { schemaId: 'attacker-schema', hits: 3 },
      ]),
    });

    const result = certamen.interpret(raw, config, ctx);

    expect(result.hits).toBe(3);
    expect(result.total).toBe(3);
  });

  it('should return 0 netHits when sequence is absent', () => {
    const config = makeConfig();
    const ctx    = makeCtx();

    const result = certamen.interpret(raw, config, ctx);

    expect(result.hits).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should throw when config type is not certamen', () => {
    const badConfig = makeWrongConfig('calculi');
    const ctx       = makeCtx();

    expect(() => certamen.interpret(raw, badConfig, ctx)).toThrow(
      'Certamen received config of type "calculi"',
    );
  });
});

// ---------------------------------------------------------------------------
// tier
// ---------------------------------------------------------------------------

describe('Certamen.tier', () => {
  const ctx = makeCtx();

  it('should return miss when netHits is below glancing threshold', () => {
    const config      = makeConfig({ netHitTiers: { strongHit: 4, hit: 2, glancing: 1 } });
    const interpreted = { hits: 0, total: 0, raw: makeRaw([]) };

    const result = certamen.tier(interpreted, config, ctx);

    expect(result.tier).toBe('miss');
  });

  it('should return glancing when netHits meets glancing threshold', () => {
    const config      = makeConfig({ netHitTiers: { strongHit: 4, hit: 2, glancing: 1 } });
    const interpreted = { hits: 1, total: 1, raw: makeRaw([]) };

    const result = certamen.tier(interpreted, config, ctx);

    expect(result.tier).toBe('glancing');
  });

  it('should return hit when netHits meets hit threshold', () => {
    const config      = makeConfig({ netHitTiers: { strongHit: 4, hit: 2, glancing: 1 } });
    const interpreted = { hits: 2, total: 2, raw: makeRaw([]) };

    const result = certamen.tier(interpreted, config, ctx);

    expect(result.tier).toBe('hit');
  });

  it('should return strong-hit when netHits meets strongHit threshold', () => {
    const config      = makeConfig({ netHitTiers: { strongHit: 4, hit: 2, glancing: 1 } });
    const interpreted = { hits: 4, total: 4, raw: makeRaw([]) };

    const result = certamen.tier(interpreted, config, ctx);

    expect(result.tier).toBe('strong-hit');
  });

  it('should throw when config type is not certamen', () => {
    const badConfig   = makeWrongConfig('limen');
    const interpreted = { hits: 3, total: 3, raw: makeRaw([]) };

    expect(() => certamen.tier(interpreted, badConfig, ctx)).toThrow(
      'Certamen received config of type "limen"',
    );
  });
});

// ---------------------------------------------------------------------------
// Certamen class identity
// ---------------------------------------------------------------------------

describe('Certamen (class)', () => {
  it('should expose id "certamen"', () => {
    const instance = new Certamen();

    expect(instance.id).toBe('certamen');
  });

  it('should expose the expected label', () => {
    const instance = new Certamen();

    expect(instance.label).toBe('Certamen (Opposed Roll)');
  });
});
