import type {
  DicePool,
  DiceResolutionSchema,
  RawRollResult,
  RollContext,
} from '../types/index.js';
import { MechanicRegistry } from '../registry/MechanicRegistry.js';

export function rollPool(
  pool:   DicePool,
  schema: DiceResolutionSchema,
  ctx:    RollContext,
): RawRollResult {
  const mechanic = MechanicRegistry.get(schema.mechanic);
  if (mechanic === undefined) {
    throw new Error(`Alea ROLL: mechanic "${schema.mechanic}" is not registered`);
  }

  let result: RawRollResult;

  if (pool.fortune !== undefined) {
    const setCount = pool.fortune === 'supreme' ? 3 : 2;
    const sets = Array.from(
      { length: setCount },
      () => mechanic.roll(pool, schema.mechanicConfig),
    );

    const hitCounts = sets.map(
      raw => mechanic.interpret(raw, schema.mechanicConfig, ctx).hits,
    );

    // On tie the first index wins — findIndex returns the earliest match.
    const keptIndex =
      pool.fortune === 'unfavorable'
        ? hitCounts.indexOf(Math.min(...hitCounts))
        : hitCounts.indexOf(Math.max(...hitCounts));

    const keptRaw = sets[keptIndex] ?? sets[0];
    result = { ...keptRaw, fortuneSets: sets, keptSet: keptIndex };
  } else {
    result = mechanic.roll(pool, schema.mechanicConfig);
  }

  // Fire DSN hook for chat animation; DSN listens to this and handles async internally.
  Hooks.callAll('alea.rollAnimated', result, pool, ctx);

  return result;
}
