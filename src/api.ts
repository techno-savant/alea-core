import type {
  AleaApi,
  AleaRitus,
  AutomationRule,
  DiceMechanic,
  DiceResolutionSchema,
  PartialRerollOptions,
  PostRollAction,
  RawDieResult,
  RawRollResult,
  RollContext,
  RollRequest,
  RollResult,
  StaticModifierDeclaration,
  TierLabelKey,
} from './types/index.js';
import { MechanicRegistry }       from './registry/MechanicRegistry.js';
import { SchemaRegistry }         from './registry/SchemaRegistry.js';
import { ModifierRegistry }       from './registry/ModifierRegistry.js';
import { PostRollActionRegistry } from './registry/PostRollActionRegistry.js';
import { TierLabelRegistry }      from './registry/TierLabelRegistry.js';
import { RollPipeline }           from './pipeline/RollPipeline.js';
import { interpretRoll }          from './pipeline/interpret.js';
import { tierRoll }               from './pipeline/tier.js';

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function createAleaApi(): AleaApi {
  const automationRules = new Map<string, AutomationRule>();

  const api: AleaApi = {
    registerRitus(ritus: AleaRitus): void {
      ritus.registerWith(api);
    },

    registerMechanic(mechanic: DiceMechanic): void {
      MechanicRegistry.register(mechanic);
    },

    registerSchema(schema: DiceResolutionSchema): void {
      SchemaRegistry.register(schema);
    },

    registerModifier(modifier: StaticModifierDeclaration): void {
      ModifierRegistry.register(modifier);
    },

    registerPostRollAction(action: PostRollAction): void {
      PostRollActionRegistry.register(action);
    },

    registerAutomationRule(rule: AutomationRule): void {
      automationRules.set(rule.id, rule);
    },

    registerTierLabels(labels: Partial<Record<TierLabelKey, string>>): void {
      TierLabelRegistry.register(labels);
    },

    async roll(request: RollRequest): Promise<RollResult> {
      return new RollPipeline(api.roll.bind(api), api).run(request);
    },

    async partialReroll(
      result: RollResult,
      ctx: RollContext,
      options: PartialRerollOptions,
    ): Promise<RollResult> {
      const schema = SchemaRegistry.get(result.resolutionId);
      if (schema === undefined) {
        throw new Error(`Alea partialReroll: schema "${result.resolutionId}" is not registered`);
      }

      const { filter, addDice } = options;

      const newRolls: RawDieResult[] = result.raw.rolls.map((group) => ({
        sides:  group.sides,
        values: group.values.map((value) =>
          filter?.({ sides: group.sides, value }) === true ? rollDie(group.sides) : value,
        ),
      }));

      if (addDice !== undefined && addDice > 0) {
        const primary = newRolls[0];
        if (primary !== undefined) {
          const extra = Array.from({ length: addDice }, () => rollDie(primary.sides));
          newRolls[0] = { ...primary, values: [...primary.values, ...extra] };
        }
      }

      const newRaw: RawRollResult = { rolls: newRolls, modifier: result.raw.modifier };

      const interpreted = interpretRoll(newRaw, schema, ctx);
      const tiered      = tierRoll(interpreted, schema, ctx);

      const newResult: RollResult = {
        resolutionId: result.resolutionId,
        mechanicId:   result.mechanicId,
        tier:         tiered.tier,
        hits:         interpreted.hits,
        raw:          newRaw,
        modifiers:    result.modifiers,
        interpreted,
        tiered,
        timestamp:    Date.now(),
        ...(tiered.quality  !== undefined && { quality:  tiered.quality }),
        ...(tiered.critical !== undefined && { critical: tiered.critical }),
        ...(tiered.glitch   !== undefined && { glitch:   tiered.glitch }),
        ...(tiered.margin   !== undefined && { margin:   tiered.margin }),
      };

      return newResult;
    },

    getMechanic(id: string): DiceMechanic | undefined {
      return MechanicRegistry.get(id);
    },

    getSchema(id: string): DiceResolutionSchema | undefined {
      return SchemaRegistry.get(id);
    },
  };

  return api;
}

export function getAleaApi(): AleaApi {
  const mod = game.modules.get<{ api?: AleaApi }>('alea-core');
  if (mod?.api === undefined) {
    throw new Error('Alea API is not yet ready. Listen for the "alea.ready" Hook.');
  }
  return mod.api;
}
