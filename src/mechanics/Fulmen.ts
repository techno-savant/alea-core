import type {
  DiceMechanic,
  DicePool,
  FulmenConfig,
  InterpretedResult,
  MechanicConfig,
  RawDieResult,
  RawRollResult,
  RollContext,
  TierResult,
} from '../types/index.js';
import { MechanicRegistry } from '../registry/MechanicRegistry.js';

export class Fulmen implements DiceMechanic {
  readonly id    = 'fulmen';
  readonly label = 'Fulmen (Exploding Dice)';

  assemble(config: MechanicConfig, ctx: RollContext): DicePool {
    const cfg = this.#narrow(config);
    return this.#inner(cfg).assemble(cfg.wraps, ctx);
  }

  roll(pool: DicePool, config: MechanicConfig): RawRollResult {
    const cfg        = this.#narrow(config);
    const trigger    = cfg.explodeOn;
    const cap        = cfg.maxChain ?? 10;
    const inner      = this.#inner(cfg);
    const base       = inner.roll(pool, cfg.wraps);

    const rolls: RawDieResult[] = base.rolls.map((die) => {
      const values:   number[] = [...die.values];
      const exploded: number[] = die.exploded !== undefined ? [...die.exploded] : [];
      const threshold = trigger ?? die.sides;

      for (const rolled of die.values) {
        if (rolled === threshold) {
          let chain = 0;
          while (chain < cap) {
            const next = Fulmen.#rollOneDie(die.sides);
            exploded.push(next);
            values.push(next);
            chain++;
            if (next !== threshold) break;
          }
        }
      }

      return { sides: die.sides, values, exploded };
    });

    return { rolls, modifier: base.modifier };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, ctx: RollContext): InterpretedResult {
    const cfg = this.#narrow(config);
    return this.#inner(cfg).interpret(raw, cfg.wraps, ctx);
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, ctx: RollContext): TierResult {
    const cfg = this.#narrow(config);
    return this.#inner(cfg).tier(interpreted, cfg.wraps, ctx);
  }

  #inner(config: FulmenConfig): DiceMechanic {
    const inner = MechanicRegistry.get(config.wraps.type);
    if (inner === undefined) throw new Error(`Fulmen: inner mechanic "${config.wraps.type}" is not registered`);
    return inner;
  }

  #narrow(config: MechanicConfig): FulmenConfig {
    if (config.type !== 'fulmen') throw new Error(`Fulmen received config of type "${config.type}"`);
    return config;
  }

  static #rollOneDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }
}

export const fulmen = new Fulmen();
