import { describe, it, expect, vi } from 'vitest';
import { PostRollActionRegistry } from '../../../src/registry/PostRollActionRegistry.js';
import type { PostRollAction } from '../../../src/types/index.js';

// The registry is a singleton — state persists across all tests in this file.
// Every test uses a unique id to avoid cross-test interference.
let counter = 0;
function uniqueId(): string {
  return `test-action-${++counter}`;
}

function makeAction(id: string, overrides: Partial<PostRollAction> = {}): PostRollAction {
  return {
    id,
    label: `Action ${id}`,
    availableOn: [],
    handler: async () => {},
    ...overrides,
  } satisfies PostRollAction;
}

describe('PostRollActionRegistry', () => {
  describe('register', () => {
    it('should store an action and make it retrievable by id', () => {
      const id = uniqueId();
      const action = makeAction(id);

      PostRollActionRegistry.register(action);

      expect(PostRollActionRegistry.get(id)).toBe(action);
    });

    it('should warn via console.warn when replacing an existing action', () => {
      const id = uniqueId();
      const first = makeAction(id);
      const second = makeAction(id);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      PostRollActionRegistry.register(first);
      PostRollActionRegistry.register(second);

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        `[alea-core] PostRollActionRegistry: replacing "${id}"`,
      );
      warnSpy.mockRestore();
    });

    it('should replace the stored action when the same id is registered twice', () => {
      const id = uniqueId();
      const first = makeAction(id);
      const second = makeAction(id);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      PostRollActionRegistry.register(first);
      PostRollActionRegistry.register(second);

      expect(PostRollActionRegistry.get(id)).toBe(second);
      vi.restoreAllMocks();
    });

    it('should not warn when registering an action for the first time', () => {
      const id = uniqueId();
      const action = makeAction(id);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      PostRollActionRegistry.register(action);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('get', () => {
    it('should return the action for a known id', () => {
      const id = uniqueId();
      const action = makeAction(id);

      PostRollActionRegistry.register(action);
      const result = PostRollActionRegistry.get(id);

      expect(result).toBe(action);
    });

    it('should return undefined for an unknown id', () => {
      const id = uniqueId();

      const result = PostRollActionRegistry.get(id);

      expect(result).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for a registered id', () => {
      const id = uniqueId();
      const action = makeAction(id);

      PostRollActionRegistry.register(action);

      expect(PostRollActionRegistry.has(id)).toBe(true);
    });

    it('should return false for an unregistered id', () => {
      const id = uniqueId();

      expect(PostRollActionRegistry.has(id)).toBe(false);
    });
  });

  describe('forSchema', () => {
    it('should return empty array for an empty id list', () => {
      const result = PostRollActionRegistry.forSchema([]);

      expect(result).toEqual([]);
    });

    it('should silently skip unknown action ids', () => {
      const knownId = uniqueId();
      const unknownId = uniqueId();
      const action = makeAction(knownId);

      PostRollActionRegistry.register(action);
      const result = PostRollActionRegistry.forSchema([unknownId]);

      expect(result).toEqual([]);
    });

    it('should return only actions whose ids are in the provided list', () => {
      const idA = uniqueId();
      const idB = uniqueId();
      const idC = uniqueId();
      const actionA = makeAction(idA);
      const actionB = makeAction(idB);
      const actionC = makeAction(idC);

      PostRollActionRegistry.register(actionA);
      PostRollActionRegistry.register(actionB);
      PostRollActionRegistry.register(actionC);
      const result = PostRollActionRegistry.forSchema([idA, idC]);

      expect(result).toEqual([actionA, actionC]);
      expect(result).not.toContain(actionB);
    });

    it('should return actions in the order of the provided id list', () => {
      const idA = uniqueId();
      const idB = uniqueId();
      const idC = uniqueId();
      const actionA = makeAction(idA);
      const actionB = makeAction(idB);
      const actionC = makeAction(idC);

      PostRollActionRegistry.register(actionA);
      PostRollActionRegistry.register(actionB);
      PostRollActionRegistry.register(actionC);
      const result = PostRollActionRegistry.forSchema([idC, idA, idB]);

      expect(result[0]).toBe(actionC);
      expect(result[1]).toBe(actionA);
      expect(result[2]).toBe(actionB);
    });

    it('should include registered actions and omit unregistered ids from a mixed list', () => {
      const knownId = uniqueId();
      const unknownId = uniqueId();
      const action = makeAction(knownId);

      PostRollActionRegistry.register(action);
      const result = PostRollActionRegistry.forSchema([unknownId, knownId]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(action);
    });
  });
});
