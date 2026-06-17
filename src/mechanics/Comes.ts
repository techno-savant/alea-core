import type {
  ComesConfig,
  DiceMechanic,
  DicePool,
  InterpretedResult,
  MechanicConfig,
  RawDieResult,
  RawRollResult,
  RollContext,
  TierResult,
} from '../types/index.js';
import { MechanicRegistry } from '../registry/MechanicRegistry.js';

export class Comes implements DiceMechanic {
  readonly id    = 'comes';
  readonly label = 'Comes (Companion Die)';

  assemble(config: MechanicConfig, ctx: RollContext): DicePool {
    const cfg  = this.#narrow(config);
    const pool = this.#inner(cfg).assemble(cfg.wraps, ctx);
    return {
      ...pool,
      dice: [
        ...pool.dice,
        { sides: cfg.comesSides, count: 1, label: cfg.comesLabel ?? 'Wild Die' },
      ],
    };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    const rolls: RawDieResult[] = pool.dice.map(face => ({
      sides:  face.sides,
      values: Array.from({ length: face.count }, () => Comes.#rollOneDie(face.sides)),
    }));
    return { rolls, modifier: pool.modifier };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, ctx: RollContext): InterpretedResult {
    const cfg   = this.#narrow(config);
    const inner = this.#inner(cfg);

    const primaryRolls: RawDieResult[] = raw.rolls.slice(0, -1);
    const comesRoll = raw.rolls.at(-1);
    if (comesRoll === undefined) throw new Error('Alea Comes: companion die missing from roll result');

    const primaryRaw: RawRollResult = { rolls: primaryRolls, modifier: raw.modifier };
    const comesRaw:   RawRollResult = { rolls: [comesRoll],  modifier: 0 };

    const primaryResult = inner.interpret(primaryRaw, cfg.wraps, ctx);
    const comesResult   = inner.interpret(comesRaw,   cfg.wraps, ctx);

    if (comesResult.hits > primaryResult.hits) {
      return { ...comesResult, raw };
    }
    return { ...primaryResult, raw };
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, ctx: RollContext): TierResult {
    const cfg = this.#narrow(config);
    return this.#inner(cfg).tier(interpreted, cfg.wraps, ctx);
  }

  #inner(config: ComesConfig): DiceMechanic {
    const inner = MechanicRegistry.get(config.wraps.type);
    if (inner === undefined) throw new Error(`Comes: inner mechanic "${config.wraps.type}" is not registered`);
    return inner;
  }

  #narrow(config: MechanicConfig): ComesConfig {
    if (config.type !== 'comes') throw new Error(`Comes received config of type "${config.type}"`);
    return config;
  }

  static #rollOneDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }
}

export const comes = new Comes();
