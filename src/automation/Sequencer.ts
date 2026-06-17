import type {
  AutomationLevel,
  DiceResolutionSchema,
  RollContext,
  RollRequest,
  RollResult,
  SequenceContext,
  SequenceRoll,
} from '../types/index.js';

function newSequenceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'seq-' + Math.random().toString(36).slice(2);
  }
}

export class AutomationSequencer {
  async sequence(
    result:  RollResult,
    schema:  DiceResolutionSchema,
    ctx:     RollContext,
    rollFn:  (request: RollRequest) => Promise<RollResult>,
  ): Promise<void> {
    if (!schema.automationConfig || schema.automationConfig.followUps.length === 0) {
      return;
    }

    const matchingFollowUps = schema.automationConfig.followUps.filter(
      (fu) => fu.on.length === 0 || fu.on.includes(result.tier),
    );

    for (const followUp of matchingFollowUps) {
      if (ctx.automationLevel === 'none') {
        console.log(`Alea: follow-up "${followUp.schemaId}" skipped (automationLevel: none)`);
        continue;
      }

      const newRoll: SequenceRoll = {
        schemaId: schema.id,
        result,
        ...(ctx.item !== undefined && { item: ctx.item }),
      };

      let updatedSequence: SequenceContext;
      if (ctx.sequence !== undefined) {
        updatedSequence = {
          ...ctx.sequence,
          rolls: [...ctx.sequence.rolls, newRoll],
        };
      } else {
        updatedSequence = {
          id:    newSequenceId(),
          rolls: [newRoll],
          ...(ctx.item !== undefined && { item: ctx.item }),
        };
      }

      const targetActor =
        followUp.targetMode === 'self'
          ? ctx.actor
          : ctx.targets[0] ?? ctx.actor;

      const request: RollRequest = {
        actor:        targetActor,
        targets:      ctx.targets,
        resolutionId: followUp.schemaId,
        sequence:     updatedSequence,
        ...(ctx.item !== undefined && { item: ctx.item }),
      };

      await rollFn(request);
    }
  }

  shouldPrompt(level: AutomationLevel): boolean {
    return level === 'semi';
  }
}

export const automationSequencer = new AutomationSequencer();
