import type {
  DiceMechanic,
  DicePool,
  InterpretedResult,
  MechanicConfig,
  RawRollResult,
  RollContext,
  ScalaConfig,
  TierResult,
} from '../types/index.js';

export class Scala implements DiceMechanic {
  readonly id    = 'scala';
  readonly label = 'Scala';

  assemble(config: MechanicConfig, ctx: RollContext): DicePool {
    const cfg = this.#narrow(config);
    const { sides, overflow } = this.#dieSides(cfg, ctx);
    return { dice: [{ sides, count: 1 }], modifier: overflow };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    const die = pool.dice[0];
    if (!die) return { rolls: [], modifier: pool.modifier };
    const value = Math.floor(Math.random() * die.sides) + 1;
    return {
      rolls:    [{ sides: die.sides, values: [value] }],
      modifier: pool.modifier,
    };
  }

  interpret(raw: RawRollResult, _config: MechanicConfig, _ctx: RollContext): InterpretedResult {
    const rolled = raw.rolls[0]?.values[0] ?? 0;
    const total  = rolled + raw.modifier;
    return { hits: 1, total, raw };
  }

  tier(_interpreted: InterpretedResult, _config: MechanicConfig, _ctx: RollContext): TierResult {
    return { tier: 'hit' };
  }

  #dieSides(config: ScalaConfig, ctx: RollContext): { sides: number; overflow: number } {
    const tag = [...ctx.tags].find(t => t.startsWith('scala:attributeValue:'));
    const attrValue = tag ? parseInt(tag.split(':')[2] ?? '1', 10) : 1;
    const sortedKeys = Object.keys(config.stepsMap).map(Number).sort((a, b) => a - b);
    const maxKey = sortedKeys.at(-1) ?? 1;
    if (attrValue <= maxKey) {
      const sides = config.stepsMap[attrValue] ?? config.stepsMap[sortedKeys[0] ?? 1] ?? 4;
      return { sides, overflow: 0 };
    }
    const overflow = (attrValue - maxKey) * (config.overflowModifier ?? 0);
    return { sides: config.stepsMap[maxKey] ?? 4, overflow };
  }

  #narrow(config: MechanicConfig): ScalaConfig {
    if (config.type !== 'scala') throw new Error(`Scala received config of type "${config.type}"`);
    return config;
  }
}

export const scala = new Scala();
