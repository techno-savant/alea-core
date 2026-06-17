import type {
  CalculiConfig,
  DiceMechanic,
  DicePool,
  InterpretedResult,
  MechanicConfig,
  RawRollResult,
  RollContext,
  TierResult,
} from '../types/index.js';

export class Calculi implements DiceMechanic {
  readonly id    = 'calculi';
  readonly label = 'Calculi';

  assemble(config: MechanicConfig, _ctx: RollContext): DicePool {
    const c = this.#narrow(config);
    return { dice: [{ sides: c.sides, count: c.count }], modifier: 0 };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    const rolls = pool.dice.map(face => ({
      sides:  face.sides,
      values: Array.from({ length: face.count }, () =>
        Math.floor(Math.random() * face.sides) + 1,
      ),
    }));
    return { rolls, modifier: 0 };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, _ctx: RollContext): InterpretedResult {
    const c      = this.#narrow(config);
    const values = raw.rolls.flatMap(r => r.values);
    const hits   = values.filter(v => v >= c.threshold).length;
    const result: InterpretedResult = { hits, total: hits, raw };
    if (c.glitchOn !== undefined) {
      result.glitches = values.filter(v => v === c.glitchOn).length;
    }
    return result;
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, _ctx: RollContext): TierResult {
    const c          = this.#narrow(config);
    const totalDice  = interpreted.raw.rolls.reduce((sum, r) => sum + r.values.length, 0);
    const glitches   = interpreted.glitches ?? 0;
    const threshold  = c.glitchThreshold ?? 0.5;
    const isGlitch   = c.glitchOn !== undefined && totalDice > 0 && glitches / totalDice >= threshold;
    const { hits }   = interpreted;

    if (hits === 0 && isGlitch) return { tier: 'miss', glitch: true };
    if (isGlitch && hits > 0)   return { tier: 'hit',  glitch: true };
    if (c.strongHitAt !== undefined && hits >= c.strongHitAt) return { tier: 'strong-hit' };
    if (hits > 0)                return { tier: 'hit' };
    return { tier: 'miss' };
  }

  #narrow(config: MechanicConfig): CalculiConfig {
    if (config.type !== 'calculi') {
      throw new Error(`Calculi received config of type "${config.type}"`);
    }
    return config;
  }
}

export const calculi = new Calculi();
