import type {
  CertamenConfig,
  DiceMechanic,
  DicePool,
  InterpretedResult,
  MechanicConfig,
  RawRollResult,
  RollContext,
  TierResult,
} from '../types/index.js';

export class Certamen implements DiceMechanic {
  readonly id    = 'certamen';
  readonly label = 'Certamen (Opposed Roll)';

  assemble(_config: MechanicConfig, _ctx: RollContext): DicePool {
    return { dice: [], modifier: 0 };
  }

  roll(_pool: DicePool, _config: MechanicConfig): RawRollResult {
    return { rolls: [], modifier: 0 };
  }

  interpret(raw: RawRollResult, config: MechanicConfig, ctx: RollContext): InterpretedResult {
    const cfg = this.#narrow(config);

    const attackerRoll = ctx.sequence?.rolls.find(r => r.schemaId === cfg.attackerSchema);
    const defenderRoll = ctx.sequence?.rolls.find(r => r.schemaId === cfg.defenderSchema);
    const attackerHits = attackerRoll?.result.hits ?? 0;
    const defenderHits = defenderRoll?.result.hits ?? 0;

    const netHits = Math.max(0, attackerHits - defenderHits);

    return { hits: netHits, total: netHits, raw };
  }

  tier(interpreted: InterpretedResult, config: MechanicConfig, _ctx: RollContext): TierResult {
    const cfg    = this.#narrow(config);
    const { hits } = interpreted;
    const { strongHit, hit, glancing } = cfg.netHitTiers;

    if (hits >= strongHit) return { tier: 'strong-hit' };
    if (hits >= hit)       return { tier: 'hit' };
    if (hits >= glancing)  return { tier: 'glancing' };
    return { tier: 'miss' };
  }

  #narrow(config: MechanicConfig): CertamenConfig {
    if (config.type !== 'certamen') {
      throw new Error(`Certamen received config of type "${config.type}"`);
    }
    return config;
  }
}

export const certamen = new Certamen();
