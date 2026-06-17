import { describe, it, expect } from 'vitest';
import { Bivium, bivium } from '../../../src/mechanics/Bivium.js';
import { makeCtx, makeRaw } from '../../helpers/fixtures.js';
import type { BiviumConfig, MechanicConfig } from '../../../src/types/index.js';

// ─── Config helper ────────────────────────────────────────────────────────────

const cfg = (overrides?: Partial<BiviumConfig>): BiviumConfig => ({
  type:          'bivium',
  positiveSides: 12,
  negativeSides: 12,
  target:        7,
  criticalOn:    'never',
  ...overrides,
});

// ─── assemble ────────────────────────────────────────────────────────────────

describe('Bivium.assemble', () => {
  it('should produce exactly 2 dice (positive and negative)', () => {
    const pool = bivium.assemble(cfg(), makeCtx());

    expect(pool.dice).toHaveLength(2);
  });

  it('should label each die correctly', () => {
    const pool = bivium.assemble(cfg(), makeCtx());

    expect(pool.dice[0]!.label).toBe('Positive');
    expect(pool.dice[1]!.label).toBe('Negative');
  });

  it('should use the configured sides for each die', () => {
    const pool = bivium.assemble(cfg({ positiveSides: 8, negativeSides: 6 }), makeCtx());

    expect(pool.dice[0]!.sides).toBe(8);
    expect(pool.dice[1]!.sides).toBe(6);
  });

  it('should apply optional modifier from config', () => {
    const pool = bivium.assemble(cfg({ modifier: 3 }), makeCtx());

    expect(pool.modifier).toBe(3);
  });

  it('should default modifier to 0 when absent', () => {
    const pool = bivium.assemble(cfg(), makeCtx());

    expect(pool.modifier).toBe(0);
  });

  it('should throw when config type is not bivium', () => {
    const badConfig = { type: 'calculi' } as unknown as MechanicConfig;

    expect(() => bivium.assemble(badConfig, makeCtx())).toThrow(
      'Bivium received config of type "calculi"',
    );
  });
});

// ─── roll ─────────────────────────────────────────────────────────────────────

describe('Bivium.roll', () => {
  it('should produce 2 roll entries', () => {
    const pool = bivium.assemble(cfg(), makeCtx());
    const raw  = bivium.roll(pool, cfg());

    expect(raw.rolls).toHaveLength(2);
  });

  it('should roll exactly 1 value per die', () => {
    const pool = bivium.assemble(cfg(), makeCtx());
    const raw  = bivium.roll(pool, cfg());

    expect(raw.rolls[0]!.values).toHaveLength(1);
    expect(raw.rolls[1]!.values).toHaveLength(1);
  });

  it('should produce values within [1, sides] for each die', () => {
    const c    = cfg({ positiveSides: 8, negativeSides: 6 });
    const pool = bivium.assemble(c, makeCtx());

    // Run enough iterations to be statistically confident
    for (let i = 0; i < 50; i++) {
      const raw = bivium.roll(pool, c);
      const pos = raw.rolls[0]!.values[0]!;
      const neg = raw.rolls[1]!.values[0]!;

      expect(pos).toBeGreaterThanOrEqual(1);
      expect(pos).toBeLessThanOrEqual(8);
      expect(neg).toBeGreaterThanOrEqual(1);
      expect(neg).toBeLessThanOrEqual(6);
    }
  });

  it('should carry the pool modifier through to raw result', () => {
    const c    = cfg({ modifier: 2 });
    const pool = bivium.assemble(c, makeCtx());
    const raw  = bivium.roll(pool, c);

    expect(raw.modifier).toBe(2);
  });
});

// ─── interpret ───────────────────────────────────────────────────────────────

describe('Bivium.interpret', () => {
  it('should throw when pool has fewer than 2 dice results', () => {
    const raw = makeRaw([{ sides: 12, values: [5] }]);

    expect(() => bivium.interpret(raw, cfg(), makeCtx())).toThrow(
      'Alea Bivium: expected exactly 2 dice in pool',
    );
  });

  it('should throw when rolls array is empty', () => {
    const raw = makeRaw([]);

    expect(() => bivium.interpret(raw, cfg(), makeCtx())).toThrow(
      'Alea Bivium: expected exactly 2 dice in pool',
    );
  });

  it('should sum positive dice rolls into positiveTotal', () => {
    const raw    = makeRaw([{ sides: 12, values: [8] }, { sides: 12, values: [3] }]);
    const result = bivium.interpret(raw, cfg(), makeCtx());

    expect(result.positiveTotal).toBe(8);
  });

  it('should sum negative dice rolls into negativeTotal', () => {
    const raw    = makeRaw([{ sides: 12, values: [8] }, { sides: 12, values: [3] }]);
    const result = bivium.interpret(raw, cfg(), makeCtx());

    expect(result.negativeTotal).toBe(3);
  });

  it('should combine positiveTotal + negativeTotal + modifier into total', () => {
    const raw    = makeRaw([{ sides: 12, values: [8] }, { sides: 12, values: [3] }], 2);
    const result = bivium.interpret(raw, cfg({ modifier: 2 }), makeCtx());

    expect(result.total).toBe(13); // 8 + 3 + 2
  });

  it('should return hits=1 when total >= target', () => {
    // positive=5, negative=3, total=8, target=7
    const raw    = makeRaw([{ sides: 12, values: [5] }, { sides: 12, values: [3] }]);
    const result = bivium.interpret(raw, cfg({ target: 7 }), makeCtx());

    expect(result.hits).toBe(1);
  });

  it('should return hits=0 when total < target', () => {
    // positive=2, negative=3, total=5, target=7
    const raw    = makeRaw([{ sides: 12, values: [2] }, { sides: 12, values: [3] }]);
    const result = bivium.interpret(raw, cfg({ target: 7 }), makeCtx());

    expect(result.hits).toBe(0);
  });

  it('should return hits=1 when total equals target exactly', () => {
    // positive=4, negative=3, total=7, target=7
    const raw    = makeRaw([{ sides: 12, values: [4] }, { sides: 12, values: [3] }]);
    const result = bivium.interpret(raw, cfg({ target: 7 }), makeCtx());

    expect(result.hits).toBe(1);
  });

  it('should use modifier from config (not pool) for total', () => {
    // raw modifier=0, config modifier=2: total should include config modifier
    const raw    = makeRaw([{ sides: 12, values: [3] }, { sides: 12, values: [3] }], 0);
    const result = bivium.interpret(raw, cfg({ modifier: 2 }), makeCtx());

    expect(result.total).toBe(8); // 3 + 3 + 2
  });

  it('should handle multi-value rolls by summing them', () => {
    // Although normal bivium only has 1 value per die, interpret uses reduce
    const raw    = makeRaw([{ sides: 12, values: [3, 4] }, { sides: 12, values: [2, 1] }]);
    const result = bivium.interpret(raw, cfg(), makeCtx());

    expect(result.positiveTotal).toBe(7);
    expect(result.negativeTotal).toBe(3);
    expect(result.total).toBe(10);
  });
});

// ─── tier — threshold mode ────────────────────────────────────────────────────

describe('Bivium.tier (threshold mode)', () => {
  // Helper: build an InterpretedResult with explicit pos/neg/total
  const makeInterpreted = (
    positiveTotal: number,
    negativeTotal: number,
    modifier = 0,
    targetOverride = 7,
  ) => {
    const total = positiveTotal + negativeTotal + modifier;
    const hits  = total >= targetOverride ? 1 : 0;
    const raw   = makeRaw([
      { sides: 12, values: [positiveTotal] },
      { sides: 12, values: [negativeTotal] },
    ]);
    return { hits, total, positiveTotal, negativeTotal, raw };
  };

  it('should return hit+and when positiveTotal > negativeTotal and isHit', () => {
    // pos=6, neg=3, total=9 >= target=7
    const interpreted = makeInterpreted(6, 3);
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('hit');
    expect(result.quality).toBe('and');
    expect(result.critical).toBeUndefined();
  });

  it('should return hit+but when negativeTotal > positiveTotal and isHit', () => {
    // pos=3, neg=6, total=9 >= target=7
    const interpreted = makeInterpreted(3, 6);
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('hit');
    expect(result.quality).toBe('but');
    expect(result.critical).toBeUndefined();
  });

  it('should return miss+and when positiveTotal > negativeTotal and not isHit', () => {
    // pos=4, neg=1, total=5 < target=7
    const interpreted = makeInterpreted(4, 1);
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('and');
  });

  it('should return miss+but when negativeTotal > positiveTotal and not isHit', () => {
    // pos=1, neg=4, total=5 < target=7
    const interpreted = makeInterpreted(1, 4);
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('but');
  });

  it('should return hit+but when tied and criticalOn=never', () => {
    // pos=5, neg=5, total=10 >= target=7, criticalOn=never → quality=but (tie default)
    const interpreted = makeInterpreted(5, 5);
    const result      = bivium.tier(interpreted, cfg({ criticalOn: 'never' }), makeCtx());

    expect(result.tier).toBe('hit');
    expect(result.quality).toBe('but');
    expect(result.critical).toBeUndefined();
  });

  it('should return miss+but when tied and criticalOn=never and not isHit', () => {
    // pos=2, neg=2, total=4 < target=7, criticalOn=never → quality=but
    const interpreted = makeInterpreted(2, 2);
    const result      = bivium.tier(interpreted, cfg({ criticalOn: 'never' }), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('but');
    expect(result.critical).toBeUndefined();
  });

  it('should return hit+and+critical when tied and criticalOn=tie and isHit', () => {
    // pos=5, neg=5, total=10 >= target=7, criticalOn=tie → quality=and, critical=true
    const interpreted = makeInterpreted(5, 5);
    const result      = bivium.tier(interpreted, cfg({ criticalOn: 'tie' }), makeCtx());

    expect(result.tier).toBe('hit');
    expect(result.quality).toBe('and');
    expect(result.critical).toBe(true);
  });

  it('should return miss+and+critical when tied and criticalOn=tie and not isHit', () => {
    // pos=2, neg=2, total=4 < target=7, criticalOn=tie → quality=and, critical=true
    const interpreted = makeInterpreted(2, 2);
    const result      = bivium.tier(interpreted, cfg({ criticalOn: 'tie' }), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('and');
    expect(result.critical).toBe(true);
  });

  it('should attach quality=and to miss (No-But / good miss) when positive wins', () => {
    // Verifies the "miss+and = No-But (good miss)" comment in source
    const interpreted = makeInterpreted(4, 1); // pos wins, miss
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('and');
  });

  it('should attach quality=but to miss (No-And / bad miss) when negative wins', () => {
    // Verifies the "miss+but = No-And (bad miss)" comment in source
    const interpreted = makeInterpreted(1, 4); // neg wins, miss
    const result      = bivium.tier(interpreted, cfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('but');
  });
});

// ─── tier — bandMode ─────────────────────────────────────────────────────────

describe('Bivium.tier (bandMode)', () => {
  const makeInterpreted = (
    positiveTotal: number,
    negativeTotal: number,
    modifier = 0,
  ) => {
    const total = positiveTotal + negativeTotal + modifier;
    const raw   = makeRaw([
      { sides: 12, values: [positiveTotal] },
      { sides: 12, values: [negativeTotal] },
    ]);
    return { hits: 0, total, positiveTotal, negativeTotal, raw };
  };

  const bandCfg = (overrides?: Partial<BiviumConfig>): BiviumConfig =>
    cfg({
      bandMode: {
        bands: [
          { min: 1,  max: 4,        tier: 'miss',       quality: 'but' },
          { min: 5,  max: 6,        tier: 'miss',       quality: 'and' },
          { min: 7,  max: 9,        tier: 'hit',        quality: 'but' },
          { min: 10, max: undefined, tier: 'strong-hit', quality: 'and' },
        ],
      },
      ...overrides,
    });

  it('should match band when total falls within band range (inclusive min/max)', () => {
    // total=7 should match band { min:7, max:9, tier:'hit', quality:'but' }
    const interpreted = makeInterpreted(4, 3); // total=7
    const result      = bivium.tier(interpreted, bandCfg(), makeCtx());

    expect(result.tier).toBe('hit');
    expect(result.quality).toBe('but');
  });

  it('should match open-ended band when total exceeds all bounded bands', () => {
    // total=12 → band { min:10, max:undefined, tier:'strong-hit', quality:'and' }
    const interpreted = makeInterpreted(7, 5); // total=12
    const result      = bivium.tier(interpreted, bandCfg(), makeCtx());

    expect(result.tier).toBe('strong-hit');
    expect(result.quality).toBe('and');
  });

  it('should return miss when no band matches', () => {
    const c = cfg({
      bandMode: {
        bands: [
          { min: 10, max: 20, tier: 'hit', quality: 'and' },
        ],
      },
    });

    const interpreted = makeInterpreted(2, 2); // total=4, no band matches
    const result      = bivium.tier(interpreted, c, makeCtx());

    expect(result.tier).toBe('miss');
  });

  it('should include quality from matched band when quality is not null', () => {
    const interpreted = makeInterpreted(3, 2); // total=5 → miss+and band
    const result      = bivium.tier(interpreted, bandCfg(), makeCtx());

    expect(result.quality).toBe('and');
  });

  it('should omit quality when band.quality is null', () => {
    const c = cfg({
      bandMode: {
        bands: [
          { min: 1, max: 20, tier: 'hit', quality: null },
        ],
      },
    });

    const interpreted = makeInterpreted(5, 5); // total=10
    const result      = bivium.tier(interpreted, c, makeCtx());

    expect(result.quality).toBeUndefined();
  });

  it('should not mark critical when criticalOn=never in bandMode even on tie', () => {
    // pos=5, neg=5 → tie, but criticalOn=never
    const interpreted = makeInterpreted(5, 5); // total=10 → strong-hit band
    const result      = bivium.tier(interpreted, bandCfg({ criticalOn: 'never' }), makeCtx());

    expect(result.critical).toBe(false);
  });

  it('should mark critical on tie when criticalOn=tie in bandMode', () => {
    // pos=5, neg=5 → tie, criticalOn=tie
    const interpreted = makeInterpreted(5, 5); // total=10 → strong-hit band
    const result      = bivium.tier(interpreted, bandCfg({ criticalOn: 'tie' }), makeCtx());

    expect(result.critical).toBe(true);
  });

  it('should not mark critical when criticalOn=tie but dice are not tied', () => {
    // pos=7, neg=5 → not a tie
    const interpreted = makeInterpreted(7, 5); // total=12 → strong-hit band
    const result      = bivium.tier(interpreted, bandCfg({ criticalOn: 'tie' }), makeCtx());

    expect(result.critical).toBe(false);
  });

  it('should fall back to miss when total is below all band minimums', () => {
    const c = cfg({
      bandMode: {
        bands: [
          { min: 5, max: 10, tier: 'hit', quality: 'and' },
        ],
      },
    });

    const interpreted = makeInterpreted(1, 1); // total=2, below band min
    const result      = bivium.tier(interpreted, c, makeCtx());

    expect(result.tier).toBe('miss');
  });

  it('should match band at exact min boundary', () => {
    // total=5 with band { min:5, max:6 }
    const interpreted = makeInterpreted(3, 2); // total=5
    const result      = bivium.tier(interpreted, bandCfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('and');
  });

  it('should match band at exact max boundary', () => {
    // total=6 with band { min:5, max:6 }
    const interpreted = makeInterpreted(4, 2); // total=6
    const result      = bivium.tier(interpreted, bandCfg(), makeCtx());

    expect(result.tier).toBe('miss');
    expect(result.quality).toBe('and');
  });
});

// ─── exported singleton ───────────────────────────────────────────────────────

describe('bivium singleton', () => {
  it('should be an instance of Bivium', () => {
    expect(bivium).toBeInstanceOf(Bivium);
  });

  it('should have id="bivium"', () => {
    expect(bivium.id).toBe('bivium');
  });

  it('should have label="Bivium"', () => {
    expect(bivium.label).toBe('Bivium');
  });
});
