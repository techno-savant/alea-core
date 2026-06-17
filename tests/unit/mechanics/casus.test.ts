import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { Casus, casus } from '../../../src/mechanics/Casus.js';
import { makeCtx, makeRaw, makeMockMechanic, makeInterpreted } from '../../helpers/fixtures.js';
import type { CasusConfig, ResolvedCasusConfig } from '../../../src/types/index.js';

vi.mock('../../../src/registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn(), register: vi.fn(), has: vi.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCasusConfig(overrides: Partial<CasusConfig> = {}): CasusConfig {
  return {
    type:      'casus',
    wraps:     { type: 'calculi', sides: 6, count: 3, threshold: 4 },
    bonusOn:   6,
    penaltyOn: 1,
    ...overrides,
  } as CasusConfig;
}

function makeResolvedConfig(
  overrides: Partial<ResolvedCasusConfig> = {},
): ResolvedCasusConfig {
  return {
    ...makeCasusConfig(),
    bonusOnResolved:   6,
    penaltyOnResolved: 1,
    bonusSuppressed:   false,
    penaltySuppressed: false,
    ...overrides,
  } as ResolvedCasusConfig;
}

// ─── isResolved — tested indirectly via interpret ────────────────────────────

describe('isResolved (via interpret)', () => {
  beforeEach(() => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', {
        interpret: (_raw, _config, _ctx) => makeInterpreted(2, 2, makeRaw([])),
      }),
    );
  });

  it('should treat config as resolved when bonusOnResolved and penaltyOnResolved are present', () => {
    const cfg = makeResolvedConfig({ bonusSuppressed: true, penaltySuppressed: true });
    // Both suppressed: inner hits (2) pass through unchanged only if resolved branch is taken
    const raw = makeRaw([
      { sides: 6, values: [4, 4, 4] },
      { sides: 6, values: [6] }, // casus die — would add bonus if unresolved
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(2); // bonus suppressed, so no +1 from casusValue=6
  });

  it('should treat config as unresolved when resolved fields are absent', () => {
    const cfg = makeCasusConfig({ bonusOn: 6, penaltyOn: 1 });
    // Unresolved path: bonusSuppressed=false, so a casus roll of 6 gives +1
    const raw = makeRaw([
      { sides: 6, values: [4, 4, 4] },
      { sides: 6, values: [6] }, // casus die — triggers bonus
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(3); // inner 2 + 1 bonus
  });
});

// ─── assemble ────────────────────────────────────────────────────────────────

describe('Casus.assemble', () => {
  beforeEach(() => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', {
        assemble: (_config, _ctx) => ({
          dice:     [{ sides: 8, count: 3 }],
          modifier: 0,
        }),
      }),
    );
  });

  it('should append casus die with same sides as primary die', () => {
    const cfg = makeCasusConfig();

    const pool = casus.assemble(cfg, makeCtx());

    expect(pool.dice.at(-1)?.sides).toBe(8);
  });

  it('should default casus die sides to 6 when inner pool is empty', () => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', {
        assemble: (_config, _ctx) => ({ dice: [], modifier: 0 }),
      }),
    );
    const cfg = makeCasusConfig();

    const pool = casus.assemble(cfg, makeCtx());

    expect(pool.dice.at(-1)?.sides).toBe(6);
  });

  it('should use casusLabel when provided', () => {
    const cfg = makeCasusConfig({ casusLabel: 'Fate Die' });

    const pool = casus.assemble(cfg, makeCtx());

    expect(pool.dice.at(-1)?.label).toBe('Fate Die');
  });

  it('should default casus label to "Casus Die" when casusLabel is absent', () => {
    const cfg = makeCasusConfig();

    const pool = casus.assemble(cfg, makeCtx());

    expect(pool.dice.at(-1)?.label).toBe('Casus Die');
  });

  it('should throw when config type is not casus', () => {
    const bad = { type: 'calculi', sides: 6, count: 3, threshold: 4 } as unknown as CasusConfig;

    expect(() => casus.assemble(bad, makeCtx())).toThrow('Casus received config of type "calculi"');
  });

  it('should throw when inner mechanic is not registered', () => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(undefined);
    const cfg = makeCasusConfig();

    expect(() => casus.assemble(cfg, makeCtx())).toThrow('is not registered');
  });
});

// ─── interpret ───────────────────────────────────────────────────────────────

describe('Casus.interpret', () => {
  beforeEach(() => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', {
        interpret: (_raw, _config, _ctx) => makeInterpreted(2, 2, makeRaw([])),
      }),
    );
  });

  it('should throw when casus die is missing from raw rolls', () => {
    const cfg = makeCasusConfig();
    const raw = makeRaw([]); // no rolls at all

    expect(() => casus.interpret(raw, cfg, makeCtx())).toThrow(
      'Alea Casus: casus die missing from roll result',
    );
  });

  it('should add bonus hit when casusValue >= bonusOn', () => {
    const cfg = makeCasusConfig({ bonusOn: 5, penaltyOn: 1 });
    const raw = makeRaw([
      { sides: 6, values: [3, 4, 5] },
      { sides: 6, values: [5] }, // casus >= bonusOn(5)
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(3); // inner 2 + 1 bonus
  });

  it('should remove hit when casusValue <= penaltyOn', () => {
    const cfg = makeCasusConfig({ bonusOn: 6, penaltyOn: 2 });
    const raw = makeRaw([
      { sides: 6, values: [3, 4, 5] },
      { sides: 6, values: [2] }, // casus <= penaltyOn(2)
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(1); // inner 2 - 1 penalty
  });

  it('should clamp hits to 0 when penalty would go negative', () => {
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', {
        interpret: (_raw, _config, _ctx) => makeInterpreted(0, 0, makeRaw([])),
      }),
    );
    const cfg = makeCasusConfig({ bonusOn: 6, penaltyOn: 2 });
    const raw = makeRaw([
      { sides: 6, values: [3] },
      { sides: 6, values: [1] }, // casus <= penaltyOn(2), inner hits already 0
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(0);
  });

  it('should not apply bonus when bonusSuppressed is true in resolved config', () => {
    const cfg = makeResolvedConfig({
      bonusOnResolved:   5,
      penaltyOnResolved: 1,
      bonusSuppressed:   true,
      penaltySuppressed: false,
    });
    const raw = makeRaw([
      { sides: 6, values: [3, 4, 5] },
      { sides: 6, values: [6] }, // would trigger bonus but suppressed
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(2); // inner 2, no bonus
  });

  it('should not apply penalty when penaltySuppressed is true in resolved config', () => {
    const cfg = makeResolvedConfig({
      bonusOnResolved:   6,
      penaltyOnResolved: 2,
      bonusSuppressed:   false,
      penaltySuppressed: true,
    });
    const raw = makeRaw([
      { sides: 6, values: [3, 4, 5] },
      { sides: 6, values: [1] }, // would trigger penalty but suppressed
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(2); // inner 2, no penalty
  });

  it('should use resolved thresholds when config is resolved', () => {
    const cfg = makeResolvedConfig({
      bonusOn:           6,   // unresolved threshold (ignored in resolved branch)
      penaltyOn:         1,   // unresolved threshold (ignored in resolved branch)
      bonusOnResolved:   4,   // resolved threshold — lower bar for bonus
      penaltyOnResolved: 3,   // resolved threshold — higher bar for penalty
      bonusSuppressed:   false,
      penaltySuppressed: false,
    });
    const raw = makeRaw([
      { sides: 6, values: [3, 3, 3] },
      { sides: 6, values: [4] }, // 4 >= bonusOnResolved(4) → bonus; 4 > penaltyOnResolved(3) → no penalty
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    expect(result.hits).toBe(3); // inner 2 + 1 bonus
  });

  it('should apply both bonus and penalty independently when both thresholds are met', () => {
    // bonusOn=3, penaltyOn=3 — a roll of exactly 3 satisfies both
    const cfg = makeCasusConfig({ bonusOn: 3, penaltyOn: 3 });
    const raw = makeRaw([
      { sides: 6, values: [4, 5, 6] },
      { sides: 6, values: [3] }, // 3 >= bonusOn(3) AND 3 <= penaltyOn(3)
    ]);

    const result = casus.interpret(raw, cfg, makeCtx());

    // inner 2, +1 bonus, -1 penalty → net 2
    expect(result.hits).toBe(2);
  });
});

// ─── tier ────────────────────────────────────────────────────────────────────

describe('Casus.tier', () => {
  it('should delegate tier to inner mechanic', () => {
    const tierFn = vi.fn().mockReturnValue({ tier: 'hit' as const });
    vi.mocked(MechanicRegistry.get).mockReturnValue(
      makeMockMechanic('calculi', { tier: tierFn }),
    );
    const cfg         = makeCasusConfig();
    const interpreted = makeInterpreted(2, 2, makeRaw([]));
    const ctx         = makeCtx();

    const result = casus.tier(interpreted, cfg, ctx);

    expect(tierFn).toHaveBeenCalledOnce();
    expect(result.tier).toBe('hit');
  });
});

// ─── singleton export ─────────────────────────────────────────────────────────

describe('casus singleton', () => {
  it('should be an instance of Casus', () => {
    expect(casus).toBeInstanceOf(Casus);
  });

  it('should have id "casus"', () => {
    expect(casus.id).toBe('casus');
  });
});
