import { MechanicRegistry } from '../registry/MechanicRegistry.js';
import type { DiceResolutionSchema, InterpretedResult, RawRollResult, RollContext } from '../types/index.js';

export function interpretRoll(
  raw:    RawRollResult,
  schema: DiceResolutionSchema,
  ctx:    RollContext,
): InterpretedResult {
  const mechanic = MechanicRegistry.get(schema.mechanic);
  if (!mechanic) {
    throw new Error(`Alea INTERPRET: mechanic "${schema.mechanic}" is not registered`);
  }
  return mechanic.interpret(raw, schema.mechanicConfig, ctx);
}
