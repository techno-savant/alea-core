import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostRollActionQueue } from '../../../src/chat/PostRollActionQueue.js';
import { makeCtx } from '../../helpers/fixtures.js';
import type { PostRollAction, RollResult, ResultTier } from '../../../src/types/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(tier: ResultTier = 'hit'): RollResult {
  return {
    resolutionId: 'test-schema',
    mechanicId:   'mock',
    tier,
    hits:         1,
    raw:          { rolls: [], modifier: 0 },
    modifiers:    [],
    interpreted:  { hits: 1, total: 4, raw: { rolls: [], modifier: 0 } },
    tiered:       { tier },
    timestamp:    0,
  };
}

function makeAction(
  id: string,
  availableOn: ResultTier[] = [],
): PostRollAction {
  return {
    id,
    label:       id,
    availableOn,
    handler:     async () => { /* no-op */ },
  };
}

// ─── Constructor / filtering ───────────────────────────────────────────────────

describe('PostRollActionQueue — constructor', () => {
  it('should filter schema actions to those available on result tier', () => {
    const hitAction  = makeAction('hit-only',  ['hit']);
    const missAction = makeAction('miss-only', ['miss']);
    const result     = makeResult('hit');
    const ctx        = makeCtx();

    const queue = new PostRollActionQueue(result, ctx, [hitAction, missAction]);

    expect(queue.actions).toContain(hitAction);
    expect(queue.actions).not.toContain(missAction);
  });

  it('should include actions with empty availableOn for any tier', () => {
    const always = makeAction('always', []);
    const result = makeResult('miss');
    const ctx    = makeCtx();

    const queue = new PostRollActionQueue(result, ctx, [always]);

    expect(queue.actions).toContain(always);
  });

  it('should include actions available on the exact result tier', () => {
    const strongHitAction = makeAction('strong-hit-only', ['strong-hit']);
    const result          = makeResult('strong-hit');
    const ctx             = makeCtx();

    const queue = new PostRollActionQueue(result, ctx, [strongHitAction]);

    expect(queue.actions).toContain(strongHitAction);
  });

  it('should store the result and ctx on the instance', () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();

    const queue = new PostRollActionQueue(result, ctx, []);

    expect(queue.result).toBe(result);
    expect(queue.ctx).toBe(ctx);
  });
});

// ─── Static constants ─────────────────────────────────────────────────────────

describe('PostRollActionQueue — static constants', () => {
  it('should expose ACCEPT static constant with id alea.accept', () => {
    expect(PostRollActionQueue.ACCEPT.id).toBe('alea.accept');
  });

  it('should expose REROLL static constant with id alea.reroll', () => {
    expect(PostRollActionQueue.REROLL.id).toBe('alea.reroll');
  });
});

// ─── open() — no timeout ───────────────────────────────────────────────────────

describe('PostRollActionQueue — open() with no timeout', () => {
  it('should resolve immediately on select when no timeout', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select('alea.accept');

    await expect(promise).resolves.toBe(PostRollActionQueue.ACCEPT);
  });

  it('should not auto-resolve when timeoutMs is null', async () => {
    const result   = makeResult('hit');
    const ctx      = makeCtx();
    const queue    = new PostRollActionQueue(result, ctx, []);
    let   resolved = false;

    const promise = queue.open(null);
    promise.then(() => { resolved = true; }).catch(() => { /* ignore */ });

    // Allow microtask queue to flush — promise must remain pending
    await Promise.resolve();

    expect(resolved).toBe(false);

    // Clean up — resolve so the Promise doesn't leak
    queue.select('alea.accept');
    await promise;
  });
});

// ─── open() — with timeout ─────────────────────────────────────────────────────

describe('PostRollActionQueue — open() with timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should auto-select alea.accept after timeoutMs elapses', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(1000);

    vi.advanceTimersByTime(1000);

    await expect(promise).resolves.toBe(PostRollActionQueue.ACCEPT);
  });

  it('should not auto-resolve before timeoutMs elapses', async () => {
    const result   = makeResult('hit');
    const ctx      = makeCtx();
    const queue    = new PostRollActionQueue(result, ctx, []);
    let   resolved = false;

    const promise = queue.open(1000);
    promise.then(() => { resolved = true; }).catch(() => { /* ignore */ });

    vi.advanceTimersByTime(999);
    await Promise.resolve();

    expect(resolved).toBe(false);

    // Clean up
    vi.advanceTimersByTime(1);
    await promise;
  });
});

// ─── select() ─────────────────────────────────────────────────────────────────

describe('PostRollActionQueue — select()', () => {
  it('should resolve the promise with the matching action', async () => {
    const action = makeAction('my-action', []);
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, [action]);

    const promise = queue.open(null);
    queue.select('my-action');

    await expect(promise).resolves.toBe(action);
  });

  it('should always include REROLL in selectable actions', async () => {
    const result = makeResult('miss');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select(PostRollActionQueue.REROLL.id);

    await expect(promise).resolves.toBe(PostRollActionQueue.REROLL);
  });

  it('should always include ACCEPT in selectable actions', async () => {
    const result = makeResult('miss');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select(PostRollActionQueue.ACCEPT.id);

    await expect(promise).resolves.toBe(PostRollActionQueue.ACCEPT);
  });

  it('should deduplicate consumer-registered alea.reroll id — built-in wins', async () => {
    // A schema action that duplicates the built-in REROLL id should be excluded
    // from schemaActions (builtInIds filter), so REROLL appears only once and
    // resolves to the static constant.
    const dupeReroll = makeAction(PostRollActionQueue.REROLL.id, []);
    const result     = makeResult('hit');
    const ctx        = makeCtx();
    const queue      = new PostRollActionQueue(result, ctx, [dupeReroll]);

    const promise = queue.open(null);
    queue.select(PostRollActionQueue.REROLL.id);

    const resolved = await promise;
    expect(resolved).toBe(PostRollActionQueue.REROLL);
  });

  it('should deduplicate consumer-registered alea.accept id — built-in wins', async () => {
    const dupeAccept = makeAction(PostRollActionQueue.ACCEPT.id, []);
    const result     = makeResult('hit');
    const ctx        = makeCtx();
    const queue      = new PostRollActionQueue(result, ctx, [dupeAccept]);

    const promise = queue.open(null);
    queue.select(PostRollActionQueue.ACCEPT.id);

    const resolved = await promise;
    expect(resolved).toBe(PostRollActionQueue.ACCEPT);
  });

  it('should fire alea.actionTaken hook before resolving', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select('alea.accept');
    await promise;

    expect(Hooks.callAll as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      'alea.actionTaken',
      'alea.accept',
      result,
      ctx,
    );
  });

  it('should reject the promise for an unknown action id', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select('no-such-action');

    await expect(promise).rejects.toThrow('Unknown action id: no-such-action');
  });

  it('should no-op when called after already resolved', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select('alea.accept');
    await promise;

    // Second call must not throw and must not call Hooks again
    const callCount = (Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length;
    queue.select('alea.accept');

    expect((Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
  });

  it('should clear the timeout timer on a manual select', async () => {
    vi.useFakeTimers();

    try {
      const result = makeResult('hit');
      const ctx    = makeCtx();
      const queue  = new PostRollActionQueue(result, ctx, []);

      const promise = queue.open(5000);
      queue.select('alea.accept');
      await promise;

      // Advancing past the original timeout must not cause a second resolution
      // (which would throw "resolve called after null guard"). If the timer were
      // not cleared this would call select() on an already-resolved queue — the
      // no-op guard covers it, but Hooks must not be called a second time.
      const callCount = (Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length;
      vi.advanceTimersByTime(5000);
      await Promise.resolve();

      expect((Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── cancel() ─────────────────────────────────────────────────────────────────

describe('PostRollActionQueue — cancel()', () => {
  it('should reject the promise with "Queue cancelled"', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.cancel();

    await expect(promise).rejects.toThrow('Queue cancelled');
  });

  it('should clear the timer on cancel', async () => {
    vi.useFakeTimers();

    try {
      const result = makeResult('hit');
      const ctx    = makeCtx();
      const queue  = new PostRollActionQueue(result, ctx, []);

      const promise = queue.open(2000);
      queue.cancel();

      // Swallow the rejection so the test runner doesn't treat it as unhandled
      await promise.catch(() => { /* expected */ });

      // After cancel, advancing time must not trigger select() (no-op guard covers
      // double-resolution, but Hooks must not be called).
      const callCount = (Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length;
      vi.advanceTimersByTime(2000);
      await Promise.resolve();

      expect((Hooks.callAll as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should no-op when called after already resolved', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.select('alea.accept');
    await promise;

    // Must not throw
    expect(() => queue.cancel()).not.toThrow();
  });

  it('should no-op when called a second time after first cancel', async () => {
    const result = makeResult('hit');
    const ctx    = makeCtx();
    const queue  = new PostRollActionQueue(result, ctx, []);

    const promise = queue.open(null);
    queue.cancel();
    await promise.catch(() => { /* expected */ });

    // Second cancel must not throw
    expect(() => queue.cancel()).not.toThrow();
  });
});
