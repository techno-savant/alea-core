import type {
  DiceMechanic,
  DicePool,
  InterpretedResult,
  LimenConfig,
  MechanicConfig,
  RawRollResult,
  RollContext,
  TierResult,
} from '../types/index.js';

export class Limen implements DiceMechanic {
  readonly id    = 'limen';
  readonly label = 'Limen';

  #narrow(config: MechanicConfig): LimenConfig {
    if (config.type !== 'limen') throw new Error(`Limen received config of type "${config.type}"`);
    return config;
  }

  assemble(config: MechanicConfig, _ctx: RollContext): DicePool {
    const c = this.#narrow(config);
    return {
      dice:     [{ sides: c.sides, count: c.count ?? 1 }],
      modifier: 0,
    };
  }

  roll(pool: DicePool, config: MechanicConfig): RawRollResult {
    const c     = this.#narrow(config);
    const face  = pool.dice[0];
    const sides = face?.sides ?? c.sides;
    const count = face?.count ?? c.count ?? 1;

    const values: number[] = Array.from(
      { length: count },
      () => Math.floor(Math.random() * sides) + 1,
    );

    const computedValue =
      (c.sumMode ?? 'sum') === 'highest'
        ? Math.max(...values)
        : values.reduce((acc, v) => acc + v, 0);

    return {
      rolls:    [{ sides, values }],
      modifier: computedValue + pool.modifier,
    };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, _ctx: RollContext): InterpretedResult {
    const c     = this.#narrow(config);
    const total = raw.modifier;
    return {
      hits:  total >= c.target ? 1 : 0,
      total,
      raw,
    };
  }

  tier(interpreted: InterpretedResult, _config: MechanicConfig, _ctx: RollContext): TierResult {
    return { tier: interpreted.hits >= 1 ? 'hit' : 'miss' };
  }
}

export const limen = new Limen();
