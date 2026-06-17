import type {
  DicePool,
  DiceResolutionSchema,
  ModifierEntry,
  ResolvedCasusConfig,
  RollContext,
} from '../types/index.js';
import { ModifierRegistry } from '../registry/ModifierRegistry.js';

export interface ModifyResult {
  pool:           DicePool;
  modifiers:      ModifierEntry[];
  resolvedCasus?: ResolvedCasusConfig;
}

export function modifyPool(
  pool:   DicePool,
  schema: DiceResolutionSchema,
  ctx:    RollContext,
): ModifyResult {
  let currentPool: DicePool = { ...pool, dice: [...pool.dice] };
  const modifiers: ModifierEntry[] = [];

  for (const entry of ModifierRegistry.bySchema(schema.id)) {
    currentPool = { ...currentPool, modifier: currentPool.modifier + entry.value };
    modifiers.push({
      value:       entry.value,
      sourceLabel: entry.sourceLabel,
      sourceType:  'schema',
    });
  }

  // Hooks listeners receive a wrapper object so they can replace pool wholesale.
  const poolRef = { pool: currentPool };
  Hooks.callAll('alea.modifyPool', poolRef, schema, ctx);
  currentPool = poolRef.pool;

  if (schema.mechanicConfig.type !== 'casus') {
    return { pool: currentPool, modifiers };
  }

  const casusConfig = schema.mechanicConfig;
  const resolved: ResolvedCasusConfig = {
    ...casusConfig,
    bonusOnResolved:   casusConfig.bonusOn,
    penaltyOnResolved: casusConfig.penaltyOn,
    penaltySuppressed: false,
    bonusSuppressed:   false,
  };
  Hooks.callAll('alea.resolveCasus', resolved, ctx);

  return { pool: currentPool, modifiers, resolvedCasus: resolved };
}
