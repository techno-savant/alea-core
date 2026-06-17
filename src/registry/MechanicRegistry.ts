import type { DiceMechanic } from '../types/index.js';

class Registry {
  readonly #mechanics: Map<string, DiceMechanic> = new Map();

  register(mechanic: DiceMechanic): void {
    if (this.#mechanics.has(mechanic.id)) {
      console.warn(
        `[alea-core] MechanicRegistry: replacing existing mechanic "${mechanic.id}" — ` +
        'prior registration will be lost.',
      );
    }
    this.#mechanics.set(mechanic.id, mechanic);
  }

  get(id: string): DiceMechanic | undefined {
    return this.#mechanics.get(id);
  }

  has(id: string): boolean {
    return this.#mechanics.has(id);
  }

  all(): ReadonlyMap<string, DiceMechanic> {
    return this.#mechanics;
  }
}

export const MechanicRegistry = new Registry();
