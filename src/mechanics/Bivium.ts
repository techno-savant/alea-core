import type {
  BiviumConfig,
  DicePool,
  DiceMechanic,
  InterpretedResult,
  MechanicConfig,
  Quality,
  RawRollResult,
  ResultTier,
  RollContext,
  TierResult,
} from '../types/index.js';

export class Bivium implements DiceMechanic {
  readonly id    = 'bivium';
  readonly label = 'Bivium';

  assemble(config: MechanicConfig, _ctx: RollContext): DicePool {
    const c = this.#narrow(config);
    return {
      dice: [
        { sides: c.positiveSides, count: 1, label: 'Positive' },
        { sides: c.negativeSides, count: 1, label: 'Negative' },
      ],
      modifier: c.modifier ?? 0,
    };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    return {
      rolls: pool.dice.map(face => ({
        sides:  face.sides,
        values: [Math.floor(Math.random() * face.sides) + 1],
      })),
      modifier: pool.modifier,
    };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, _ctx: RollContext): InterpretedResult {
    const c        = this.#narrow(config);
    const modifier = c.modifier ?? 0;

    const posRoll = raw.rolls[0];
    const negRoll = raw.rolls[1];
    if (posRoll === undefined || negRoll === undefined) {
      throw new Error('Alea Bivium: expected exactly 2 dice in pool');
    }

    const positiveTotal = posRoll.values.reduce((sum, v) => sum + v, 0);
    const negativeTotal = negRoll.values.reduce((sum, v) => sum + v, 0);
    const total         = positiveTotal + negativeTotal + modifier;
    const hits          = total >= c.target ? 1 : 0;
    return { hits, total, positiveTotal, negativeTotal, raw };
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, _ctx: RollContext): TierResult {
    const c             = this.#narrow(config);
    const positiveTotal = interpreted.positiveTotal ?? 0;
    const negativeTotal = interpreted.negativeTotal ?? 0;
    const total         = interpreted.total;

    if (c.bandMode) {
      const critical = c.criticalOn === 'tie' && positiveTotal === negativeTotal;
      for (const band of c.bandMode.bands) {
        if (total >= band.min && (band.max === undefined || total <= band.max)) {
          const result: TierResult = { tier: band.tier, critical };
          if (band.quality !== null) result.quality = band.quality;
          return result;
        }
      }
      return { tier: 'miss', critical };
    }

    const isHit = total >= c.target;

    if (positiveTotal === negativeTotal) {
      if (c.criticalOn === 'tie') {
        const tier: ResultTier = isHit ? 'hit' : 'miss';
        return { tier, quality: 'and', critical: true };
      }
      const tier: ResultTier = isHit ? 'hit' : 'miss';
      return { tier, quality: 'but' };
    }

    const quality: Quality = positiveTotal > negativeTotal ? 'and' : 'but';

    if (isHit) {
      return { tier: 'hit', quality };
    }
    // miss+and = No-But (good miss), miss+but = No-And (bad miss)
    // quality label stays on the result so callers can render "No-And" / "No-But"
    return { tier: 'miss', quality };
  }

  #narrow(config: MechanicConfig): BiviumConfig {
    if (config.type !== 'bivium') {
      throw new Error(`Bivium received config of type "${config.type}"`);
    }
    return config;
  }
}

export const bivium = new Bivium();
