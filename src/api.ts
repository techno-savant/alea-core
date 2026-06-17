import type {
  AleaApi,
  AleaRitus,
  AutomationRule,
  DiceMechanic,
  DiceResolutionSchema,
  PartialRerollOptions,
  PostRollAction,
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
      _result: RollResult,
      _ctx: RollContext,
      _options: PartialRerollOptions,
    ): Promise<RollResult> {
      throw new Error('partialReroll not yet implemented');
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
