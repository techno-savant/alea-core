import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AutomationSequencer, automationSequencer } from '../../../src/automation/Sequencer.js';
import { makeCtx, makeActor, makeRaw, makeDocument } from '../../helpers/fixtures.js';
import type {
  DiceResolutionSchema,
  RollResult,
  AutomationFollowUp,
  ResultTier,
  RollRequest,
} from '../../../src/types/index.js';

// ─── Local helpers ────────────────────────────────────────────────────────────

function makeResult(tier: ResultTier = 'hit'): RollResult {
  const raw = makeRaw([{ sides: 6, values: [4] }]);
  return {
    resolutionId: 'parent-schema',
    mechanicId:   'calculi',
    tier,
    hits:         1,
    raw,
    modifiers:    [],
    interpreted:  { hits: 1, total: 4, raw },
    tiered:       { tier },
    timestamp:    0,
  };
}

function makeFollowUp(
  schemaId: string,
  on: ResultTier[] = [],
  targetMode: 'self' | 'first-target' = 'self',
): AutomationFollowUp {
  return { schemaId, on, targetMode };
}

function makeSchemaWithFollowUps(followUps: AutomationFollowUp[]): DiceResolutionSchema {
  return {
    id:             'parent-schema',
    label:          'Parent',
    mechanic:       'calculi',
    mechanicConfig: { type: 'calculi', sides: 6, count: 1, threshold: 5 },
    automationConfig: { followUps },
  };
}

// ─── shouldPrompt ─────────────────────────────────────────────────────────────

describe('AutomationSequencer.shouldPrompt', () => {
  const sequencer = new AutomationSequencer();

  it('should return true when level is semi', () => {
    const result = sequencer.shouldPrompt('semi');

    expect(result).toBe(true);
  });

  it('should return false when level is full', () => {
    const result = sequencer.shouldPrompt('full');

    expect(result).toBe(false);
  });

  it('should return false when level is none', () => {
    const result = sequencer.shouldPrompt('none');

    expect(result).toBe(false);
  });
});

// ─── sequence — boundary conditions ──────────────────────────────────────────

describe('AutomationSequencer.sequence — boundary conditions', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should return without calling rollFn when automationConfig is absent', async () => {
    const schema: DiceResolutionSchema = {
      id:             'schema-no-automation',
      label:          'No Automation',
      mechanic:       'calculi',
      mechanicConfig: { type: 'calculi', sides: 6, count: 1, threshold: 5 },
    };
    const ctx = makeCtx();

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    expect(rollFn).not.toHaveBeenCalled();
  });

  it('should return without calling rollFn when followUps is empty', async () => {
    const schema = makeSchemaWithFollowUps([]);
    const ctx    = makeCtx();

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    expect(rollFn).not.toHaveBeenCalled();
  });
});

// ─── sequence — followUp matching ────────────────────────────────────────────

describe('AutomationSequencer.sequence — followUp matching', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should call rollFn once per matching followUp', async () => {
    const schema = makeSchemaWithFollowUps([
      makeFollowUp('follow-a'),
      makeFollowUp('follow-b'),
    ]);
    const ctx = makeCtx();

    await sequencer.sequence(makeResult('hit'), schema, ctx, rollFn);

    expect(rollFn).toHaveBeenCalledTimes(2);
  });

  it('should skip followUp when tier does not match followUp.on', async () => {
    const schema = makeSchemaWithFollowUps([
      makeFollowUp('follow-miss-only', ['close-hit']),
    ]);
    const ctx = makeCtx();

    await sequencer.sequence(makeResult('hit'), schema, ctx, rollFn);

    expect(rollFn).not.toHaveBeenCalled();
  });

  it('should fire all followUps when followUp.on is empty', async () => {
    const schema = makeSchemaWithFollowUps([
      makeFollowUp('always-fires', []),
    ]);
    const ctx = makeCtx();

    await sequencer.sequence(makeResult('close-hit'), schema, ctx, rollFn);

    expect(rollFn).toHaveBeenCalledTimes(1);
  });

  it('should call rollFn when followUp.on includes the result tier', async () => {
    const schema = makeSchemaWithFollowUps([
      makeFollowUp('on-hit', ['hit']),
    ]);
    const ctx = makeCtx();

    await sequencer.sequence(makeResult('hit'), schema, ctx, rollFn);

    expect(rollFn).toHaveBeenCalledTimes(1);
  });
});

// ─── sequence — automationLevel: none ────────────────────────────────────────

describe('AutomationSequencer.sequence — automationLevel none', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should log and skip when automationLevel is none', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const schema  = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx     = makeCtx({ automationLevel: 'none' });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    expect(rollFn).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('follow-a'),
    );

    logSpy.mockRestore();
  });
});

// ─── sequence — target resolution ────────────────────────────────────────────

describe('AutomationSequencer.sequence — target resolution', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should use ctx.actor as target when targetMode is self', async () => {
    const actor  = makeActor({ id: 'actor-self' });
    const target = makeActor({ id: 'actor-target' });
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a', [], 'self')]);
    const ctx    = makeCtx({ actor, targets: [target] });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.actor.id).toBe('actor-self');
  });

  it('should use ctx.targets[0] as target when targetMode is first-target and targets exist', async () => {
    const actor   = makeActor({ id: 'actor-self' });
    const target1 = makeActor({ id: 'target-1' });
    const target2 = makeActor({ id: 'target-2' });
    const schema  = makeSchemaWithFollowUps([makeFollowUp('follow-a', [], 'first-target')]);
    const ctx     = makeCtx({ actor, targets: [target1, target2] });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.actor.id).toBe('target-1');
  });

  it('should fall back to ctx.actor when targets is empty and targetMode is first-target', async () => {
    const actor  = makeActor({ id: 'actor-fallback' });
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a', [], 'first-target')]);
    const ctx    = makeCtx({ actor, targets: [] });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.actor.id).toBe('actor-fallback');
  });
});

// ─── sequence — sequence context construction ─────────────────────────────────

describe('AutomationSequencer.sequence — sequence context construction', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should create a new sequence with a generated id when ctx.sequence is absent', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ sequence: undefined });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(typeof request.sequence!.id).toBe('string');
    expect(request.sequence!.id.length).toBeGreaterThan(0);
  });

  it('should create a new sequence with one roll when ctx.sequence is absent', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ sequence: undefined });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.sequence!.rolls).toHaveLength(1);
  });

  it('should append to existing sequence when ctx.sequence is present', async () => {
    const existingRoll = {
      schemaId: 'prev-schema',
      result:   makeResult('strong-hit'),
    };
    const existingSequence = {
      id:    'existing-seq-id',
      rolls: [existingRoll],
    };
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ sequence: existingSequence });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.sequence!.id).toBe('existing-seq-id');
    expect(request.sequence!.rolls).toHaveLength(2);
    expect(request.sequence!.rolls[0]).toBe(existingRoll);
  });

  it('should preserve other sequence context properties when appending', async () => {
    const existingSequence = {
      id:    'existing-seq-id',
      rolls: [],
      item:  makeDocument('seq-item', 'Sequence Item'),
    };
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ sequence: existingSequence });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.sequence!.item).toBe(existingSequence.item);
  });
});

// ─── sequence — SequenceRoll item presence ────────────────────────────────────

describe('AutomationSequencer.sequence — SequenceRoll item presence', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should include item in SequenceRoll when ctx.item is set', async () => {
    const item   = makeDocument('item-1', 'Weapon');
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ item });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    const newRoll = request.sequence!.rolls.at(-1)!;
    expect('item' in newRoll).toBe(true);
    expect(newRoll.item).toBe(item);
  });

  it('should not include item in SequenceRoll when ctx.item is absent', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ /* no item */ });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    const newRoll = request.sequence!.rolls.at(-1)!;
    expect('item' in newRoll).toBe(false);
  });
});

// ─── sequence — request shape ─────────────────────────────────────────────────

describe('AutomationSequencer.sequence — request shape', () => {
  const sequencer = new AutomationSequencer();
  let rollFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rollFn = vi.fn().mockResolvedValue(makeResult());
  });

  it('should set resolutionId on request to followUp.schemaId', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-schema-x')]);
    const ctx    = makeCtx();

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.resolutionId).toBe('follow-schema-x');
  });

  it('should set SequenceRoll.schemaId to the parent schema id', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx();

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    const newRoll = request.sequence!.rolls.at(-1)!;
    expect(newRoll.schemaId).toBe('parent-schema');
  });

  it('should include ctx.item on the request when ctx.item is set', async () => {
    const item   = makeDocument('item-1', 'Weapon');
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ item });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.item).toBe(item);
  });

  it('should not include item on the request when ctx.item is absent', async () => {
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ /* no item */ });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect('item' in request).toBe(false);
  });

  it('should pass ctx.targets to the request', async () => {
    const target = makeActor({ id: 'target-1' });
    const schema = makeSchemaWithFollowUps([makeFollowUp('follow-a')]);
    const ctx    = makeCtx({ targets: [target] });

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    const request = rollFn.mock.calls[0]![0] as RollRequest;
    expect(request.targets).toEqual([target]);
  });
});

// ─── sequence — sequential execution ─────────────────────────────────────────

describe('AutomationSequencer.sequence — sequential execution', () => {
  it('should call rollFn sequentially (awaiting each call)', async () => {
    const sequencer = new AutomationSequencer();
    const order:    string[] = [];

    const rollFn = vi.fn().mockImplementation(async (req: RollRequest) => {
      order.push(req.resolutionId);
      return makeResult();
    });

    const schema = makeSchemaWithFollowUps([
      makeFollowUp('step-1'),
      makeFollowUp('step-2'),
      makeFollowUp('step-3'),
    ]);
    const ctx = makeCtx();

    await sequencer.sequence(makeResult(), schema, ctx, rollFn);

    expect(order).toEqual(['step-1', 'step-2', 'step-3']);
  });
});

// ─── singleton export ─────────────────────────────────────────────────────────

describe('automationSequencer singleton', () => {
  it('should be an instance of AutomationSequencer', () => {
    expect(automationSequencer).toBeInstanceOf(AutomationSequencer);
  });
});
