import type {
  CasusConfig,
  DiceMechanic,
  DicePool,
  InterpretedResult,
  MechanicConfig,
  RawDieResult,
  RawRollResult,
  ResolvedCasusConfig,
  RollContext,
  TierResult,
} from '../types/index.js';
import { MechanicRegistry } from '../registry/MechanicRegistry.js';

function isResolved(c: CasusConfig): c is CasusConfig & ResolvedCasusConfig {
  return 'bonusOnResolved' in c && 'penaltyOnResolved' in c;
}

export class Casus implements DiceMechanic {
  readonly id    = 'casus';
  readonly label = 'Casus (Wild Chance)';

  assemble(config: MechanicConfig, ctx: RollContext): DicePool {
    const cfg  = this.#narrow(config);
    const pool = this.#inner(cfg).assemble(cfg.wraps, ctx);
    const primarySides = pool.dice[0]?.sides ?? 6;
    return {
      ...pool,
      dice: [
        ...pool.dice,
        { sides: primarySides, count: 1, label: cfg.casusLabel ?? 'Casus Die' },
      ],
    };
  }

  roll(pool: DicePool, _config: MechanicConfig): RawRollResult {
    const rolls: RawDieResult[] = pool.dice.map(face => ({
      sides:  face.sides,
      values: Array.from({ length: face.count }, () =>
        Math.floor(Math.random() * face.sides) + 1,
      ),
    }));
    return { rolls, modifier: pool.modifier };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, ctx: RollContext): InterpretedResult {
    const cfg   = this.#narrow(config);
    const inner = this.#inner(cfg);

    const result = inner.interpret(raw, cfg.wraps, ctx);

    const casusRoll = raw.rolls.at(-1);
    if (casusRoll === undefined) throw new Error('Alea Casus: casus die missing from roll result');
    const casusValue = casusRoll.values[0] ?? 0;

    let bonusOn:          number;
    let penaltyOn:        number;
    let bonusSuppressed:  boolean;
    let penaltySuppressed: boolean;

    if (isResolved(cfg)) {
      bonusOn           = cfg.bonusOnResolved;
      penaltyOn         = cfg.penaltyOnResolved;
      bonusSuppressed   = cfg.bonusSuppressed;
      penaltySuppressed = cfg.penaltySuppressed;
    } else {
      bonusOn           = cfg.bonusOn;
      penaltyOn         = cfg.penaltyOn;
      bonusSuppressed   = false;
      penaltySuppressed = false;
    }

    let { hits } = result;

    if (!bonusSuppressed && casusValue >= bonusOn) {
      hits += 1;
    }
    if (!penaltySuppressed && casusValue <= penaltyOn) {
      hits = Math.max(0, hits - 1);
    }

    return { ...result, hits, total: hits };
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, ctx: RollContext): TierResult {
    const cfg = this.#narrow(config);
    return this.#inner(cfg).tier(interpreted, cfg.wraps, ctx);
  }

  #inner(config: CasusConfig): DiceMechanic {
    const inner = MechanicRegistry.get(config.wraps.type);
    if (inner === undefined) throw new Error(`Casus: inner mechanic "${config.wraps.type}" is not registered`);
    return inner;
  }

  #narrow(config: MechanicConfig): CasusConfig {
    if (config.type !== 'casus') throw new Error(`Casus received config of type "${config.type}"`);
    return config;
  }

}

export const casus = new Casus();
