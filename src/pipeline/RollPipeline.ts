import type {
  AleaApi,
  AutomationLevel,
  DicePool,
  DiceResolutionSchema,
  InterpretedResult,
  RollContext,
  RollRequest,
  RollResult,
  TierResult,
} from '../types/index.js';
import { SchemaRegistry }        from '../registry/SchemaRegistry.js';
import { PostRollActionRegistry } from '../registry/PostRollActionRegistry.js';
import { assemblePool }           from './assemble.js';
import { modifyPool }             from './modify.js';
import { rollPool }               from './roll.js';
import { interpretRoll }          from './interpret.js';
import { tierRoll }               from './tier.js';
import { PostRollActionQueue }    from '../chat/PostRollActionQueue.js';
import { automationSequencer }    from '../automation/Sequencer.js';

export class RollPipeline {
  readonly #rollFn: (request: RollRequest) => Promise<RollResult>;
  readonly #api: AleaApi;

  constructor(rollFn: (request: RollRequest) => Promise<RollResult>, api: AleaApi) {
    this.#rollFn = rollFn;
    this.#api = api;
  }

  async run(request: RollRequest): Promise<RollResult> {
    Hooks.callAll('alea.preRoll', request);

    const schema: DiceResolutionSchema | undefined = SchemaRegistry.get(request.resolutionId);
    if (schema === undefined) {
      throw new Error(`Alea: schema "${request.resolutionId}" is not registered`);
    }

    const ctx: RollContext = {
      actor:           request.actor,
      targets:         request.targets ?? [],
      tags:            new Set<string>(),
      resolutionId:    request.resolutionId,
      automationLevel: game.settings.get<AutomationLevel>('alea-core', 'automationLevel'),
      ...(request.item     !== undefined && { item:     request.item }),
      ...(request.sequence !== undefined && { sequence: request.sequence }),
    };

    const assembledPool: DicePool = assemblePool(schema, ctx);

    const { pool: modifiedPool, modifiers } = modifyPool(assembledPool, schema, ctx);

    // Stages 5–8 extracted into a local function so reroll can repeat them.
    const rollAndBuild = (): RollResult => {
      const rawRef = { raw: rollPool(modifiedPool, schema, ctx) };
      Hooks.callAll('alea.postRoll', rawRef, ctx);
      const raw = rawRef.raw;

      const interpreted: InterpretedResult = interpretRoll(raw, schema, ctx);

      const tiered: TierResult = tierRoll(interpreted, schema, ctx);

      const result: RollResult = {
        resolutionId: schema.id,
        mechanicId:   schema.mechanic,
        tier:         tiered.tier,
        hits:         interpreted.hits,
        raw,
        modifiers,
        interpreted,
        tiered,
        timestamp:    Date.now(),
        ...(tiered.quality  !== undefined && { quality:  tiered.quality }),
        ...(tiered.critical !== undefined && { critical: tiered.critical }),
        ...(tiered.glitch   !== undefined && { glitch:   tiered.glitch }),
        ...(tiered.margin   !== undefined && { margin:   tiered.margin }),
      };

      Hooks.callAll('alea.tierResolved', result, ctx);
      return result;
    };

    let result: RollResult = rollAndBuild();

    if (ctx.automationLevel !== 'none') {
      const actions = PostRollActionRegistry.forSchema(schema.postRollActions ?? []);
      const timeoutMs = schema.queueTimeout ??
        (game.settings.get<number>('alea-core', 'postRollTimer') * 1000);

      let keepLooping = true;
      while (keepLooping) {
        const queue  = new PostRollActionQueue(result, ctx, actions);
        const action = await queue.open(timeoutMs);

        if (action.id === 'alea.reroll') {
          // Re-run stages 5–8 only; pool is unchanged.
          result = rollAndBuild();
        } else if (action.id === 'alea.accept') {
          keepLooping = false;
        } else {
          await action.handler(result, ctx, this.#api);
          keepLooping = false;
        }
      }
    }

    if (schema.onComplete !== undefined) {
      try {
        await schema.onComplete(result, ctx);
      } catch (err) {
        console.error('[alea-core] RollPipeline: schema.onComplete threw', err);
      }
    }

    Hooks.callAll('alea.rollComplete', result, ctx);

    await automationSequencer.sequence(result, schema, ctx, this.#rollFn);

    return result;
  }
}
