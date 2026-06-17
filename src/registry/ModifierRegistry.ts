import type { StaticModifierDeclaration } from '../types/index.js';

class Registry {
  readonly #modifiers: Map<string, StaticModifierDeclaration> = new Map();

  register(modifier: StaticModifierDeclaration): void {
    if (this.#modifiers.has(modifier.id)) {
      console.warn(
        `[alea-core] ModifierRegistry: replacing existing modifier "${modifier.id}" — ` +
        'prior registration will be lost.',
      );
    }
    this.#modifiers.set(modifier.id, modifier);
  }

  get(id: string): StaticModifierDeclaration | undefined {
    return this.#modifiers.get(id);
  }

  has(id: string): boolean {
    return this.#modifiers.has(id);
  }

  bySchema(schemaId: string): StaticModifierDeclaration[] {
    const results: StaticModifierDeclaration[] = [];
    for (const modifier of this.#modifiers.values()) {
      if (modifier.schemaId === schemaId) {
        results.push(modifier);
      }
    }
    return results;
  }
}

export const ModifierRegistry = new Registry();
