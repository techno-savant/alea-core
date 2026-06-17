import { MechanicRegistry } from '../registry/MechanicRegistry.js';
import type { DiceResolutionSchema, InterpretedResult, RollContext, TierResult } from '../types/index.js';

export function tierRoll(
  interpreted: InterpretedResult,
  schema:      DiceResolutionSchema,
  ctx:         RollContext,
): TierResult {
  const mechanic = MechanicRegistry.get(schema.mechanic);
  if (!mechanic) {
    throw new Error(`Alea TIER: mechanic "${schema.mechanic}" is not registered`);
  }
  return mechanic.tier(interpreted, schema.mechanicConfig, ctx);
}
