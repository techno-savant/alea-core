import { MechanicRegistry } from '../registry/MechanicRegistry.js';
import type { DicePool, DiceResolutionSchema, RollContext } from '../types/index.js';

export function assemblePool(schema: DiceResolutionSchema, ctx: RollContext): DicePool {
  const mechanic = MechanicRegistry.get(schema.mechanic);
  if (!mechanic) {
    throw new Error(`Alea ASSEMBLE: mechanic "${schema.mechanic}" is not registered`);
  }

  let pool: DicePool = mechanic.assemble(schema.mechanicConfig, ctx);

  if (schema.poolBuilder !== undefined) {
    const count = schema.poolBuilder(ctx);
    if (count < 1) {
      throw new Error(
        `Alea ASSEMBLE: poolBuilder for schema "${schema.id}" returned ${count} — must be ≥ 1`
      );
    }
    const [primary, ...rest] = pool.dice;
    if (primary === undefined) {
      throw new Error(`Alea ASSEMBLE: poolBuilder for schema "${schema.id}" — pool has no dice`);
    }
    pool = { ...pool, dice: [{ ...primary, count }, ...rest] };
  }

  return pool;
}
