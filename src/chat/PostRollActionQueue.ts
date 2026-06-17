import type { AleaApi, PostRollAction, ResultTier, RollContext, RollResult } from '../types/index.js';

export class PostRollActionQueue {
  static readonly ACCEPT: PostRollAction = {
    id:          'alea.accept',
    label:       'Accept',
    availableOn: [],
    handler:     async (_result: RollResult, _ctx: RollContext, _api: AleaApi): Promise<void> => { /* pipeline treats Accept as "proceed" */ },
  };

  static readonly REROLL: PostRollAction = {
    id:          'alea.reroll',
    label:       'Reroll',
    icon:        'fa-dice',
    availableOn: [],
    handler:     async (_result: RollResult, _ctx: RollContext, _api: AleaApi): Promise<void> => { /* wired by RollPipeline */ },
  };

  readonly result:  RollResult;
  readonly ctx:     RollContext;
  readonly actions: PostRollAction[];

  #resolve: ((action: PostRollAction) => void) | null = null;
  #reject:  ((reason: Error) => void) | null = null;
  #timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(result: RollResult, ctx: RollContext, actions: PostRollAction[]) {
    this.result  = result;
    this.ctx     = ctx;
    // Filter to actions available for result.tier; ACCEPT is appended in open()
    this.actions = actions.filter(
      (a) => a.availableOn.length === 0 || (a.availableOn as ResultTier[]).includes(result.tier),
    );
  }

  open(timeoutMs: number | null): Promise<PostRollAction> {
    return new Promise<PostRollAction>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject  = reject;

      if (timeoutMs !== null) {
        this.#timerId = setTimeout(() => {
          this.select('alea.accept');
        }, timeoutMs);
      }
    });
  }

  select(actionId: string): void {
    // Guard against double-resolution (timer fires after manual click)
    if (this.#resolve === null) return;

    const builtInIds = new Set([PostRollActionQueue.REROLL.id, PostRollActionQueue.ACCEPT.id]);
    const schemaActions = this.actions.filter((a) => !builtInIds.has(a.id));
    const all     = [...schemaActions, PostRollActionQueue.REROLL, PostRollActionQueue.ACCEPT];
    const action  = all.find((a) => a.id === actionId);

    if (action === undefined) {
      this.#reject?.(new Error(`Unknown action id: ${actionId}`));
      this.#clearTimer();
      this.#resolve = null;
      this.#reject  = null;
      return;
    }

    this.#clearTimer();
    const resolveRef = this.#resolve;
    this.#resolve    = null;
    this.#reject     = null;

    Hooks.callAll('alea.actionTaken', actionId, this.result, this.ctx);
    resolveRef(action);
  }

  cancel(): void {
    if (this.#reject === null) return;
    this.#clearTimer();
    const rejectRef = this.#reject;
    this.#resolve   = null;
    this.#reject    = null;
    rejectRef(new Error('Queue cancelled'));
  }

  #clearTimer(): void {
    if (this.#timerId !== null) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
  }
}
