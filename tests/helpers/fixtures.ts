import type {
  FoundryActor,
  FoundryDocument,
  RollContext,
  RawRollResult,
  MechanicConfig,
  DiceResolutionSchema,
  DiceMechanic,
  DicePool,
  InterpretedResult,
  TierResult,
  ResultTier,
} from '../../src/types/index.js';

export function makeActor(overrides: Partial<FoundryActor> = {}): FoundryActor {
  return {
    id:      'actor-1',
    name:    'Test Actor',
    system:  {},
    getFlag: () => undefined,
    setFlag: async function(this: FoundryActor) { return this; },
    ...overrides,
  } as unknown as FoundryActor;
}

export function makeCtx(overrides: Partial<RollContext> = {}): RollContext {
  return {
    actor:           makeActor(),
    targets:         [],
    tags:            new Set<string>(),
    resolutionId:    'test-schema',
    automationLevel: 'full',
    ...overrides,
  };
}

export function makeRaw(
  rolls: { sides: number; values: number[]; exploded?: number[] }[],
  modifier = 0,
): RawRollResult {
  return { rolls, modifier };
}

export function makeSchema(
  mechanicId: string,
  config: MechanicConfig,
  overrides: Partial<DiceResolutionSchema> = {},
): DiceResolutionSchema {
  return {
    id:             'test-schema',
    label:          'Test Schema',
    mechanic:       mechanicId,
    mechanicConfig: config,
    ...overrides,
  };
}

export function makeInterpreted(
  hits: number,
  total: number,
  raw: RawRollResult = makeRaw([]),
  overrides: Partial<InterpretedResult> = {},
): InterpretedResult {
  return { hits, total, raw, ...overrides };
}

export function makeMockMechanic(
  id = 'mock',
  overrides: Partial<DiceMechanic> = {},
): DiceMechanic {
  return {
    id,
    label: `Mock (${id})`,
    assemble: (_config, _ctx) => ({ dice: [{ sides: 6, count: 1 }], modifier: 0 }),
    roll:     (_pool, _config) => makeRaw([{ sides: 6, values: [4] }]),
    interpret: (_raw, _config, _ctx) => makeInterpreted(1, 4, makeRaw([])),
    tier:     (_interpreted, _config, _ctx): TierResult => ({ tier: 'hit' as ResultTier }),
    ...overrides,
  };
}

export function makeDocument(id = 'doc-1', name = 'Test Doc'): FoundryDocument {
  return { id, name };
}
