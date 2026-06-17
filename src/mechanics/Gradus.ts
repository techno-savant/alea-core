import type {
  DiceMechanic,
  MechanicConfig,
  GradusConfig,
  RollContext,
  DicePool,
  RawRollResult,
  InterpretedResult,
  TierResult,
} from '../types/index.js';

export class Gradus implements DiceMechanic {
  readonly id    = 'gradus';
  readonly label = 'Gradus';

  assemble(config: MechanicConfig, _ctx: RollContext): DicePool {
    const c = this.#narrow(config);
    return {
      dice: [{ sides: c.sides, count: c.count ?? 1 }],
      modifier: 0,
    };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    const rolls = pool.dice.map(die => ({
      sides: die.sides,
      values: Array.from({ length: die.count }, () =>
        Math.floor(Math.random() * die.sides) + 1,
      ),
    }));
    return { rolls, modifier: pool.modifier };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, _ctx: RollContext): InterpretedResult {
    const c = this.#narrow(config);
    const allValues = raw.rolls.flatMap(r => r.values);
    const total =
      c.sumMode === 'highest'
        ? Math.max(...allValues) + raw.modifier
        : allValues.reduce((a, b) => a + b, 0) + raw.modifier;
    return { hits: total >= c.target ? 1 : 0, total, raw };
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, _ctx: RollContext): TierResult {
    const c = this.#narrow(config);
    const margin = interpreted.total - c.target;

    if (margin >= c.critMargin) {
      return { tier: 'strong-hit', margin };
    }
    if (margin >= 0) {
      return { tier: 'hit', margin };
    }
    if (c.fumbleMargin !== undefined && margin > -c.fumbleMargin) {
      return { tier: 'close-hit', margin };
    }
    return { tier: 'miss', margin };
  }

  #narrow(config: MechanicConfig): GradusConfig {
    if (config.type !== 'gradus') {
      throw new Error(`Gradus received config of type "${config.type}"`);
    }
    return config;
  }
}

export const gradus = new Gradus();
