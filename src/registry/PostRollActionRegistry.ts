import type { PostRollAction } from '../types/index.js';

class Registry {
  readonly #actions: Map<string, PostRollAction> = new Map();

  register(action: PostRollAction): void {
    if (this.#actions.has(action.id)) {
      console.warn(`[alea-core] PostRollActionRegistry: replacing "${action.id}"`);
    }
    this.#actions.set(action.id, action);
  }

  get(id: string): PostRollAction | undefined {
    return this.#actions.get(id);
  }

  has(id: string): boolean {
    return this.#actions.has(id);
  }

  forSchema(actionIds: string[]): PostRollAction[] {
    return actionIds.flatMap(id => {
      const action = this.#actions.get(id);
      return action !== undefined ? [action] : [];
    });
  }
}

export const PostRollActionRegistry = new Registry();
