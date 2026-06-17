import type { DiceResolutionSchema } from '../types/index.js';

class Registry {
  #schemas: Map<string, DiceResolutionSchema> = new Map();

  register(schema: DiceResolutionSchema): void {
    if (this.#schemas.has(schema.id)) {
      console.warn(`[alea-core] SchemaRegistry: duplicate schema id "${schema.id}" — replacing existing entry.`);
    }
    this.#schemas.set(schema.id, schema);
  }

  get(id: string): DiceResolutionSchema | undefined {
    return this.#schemas.get(id);
  }

  has(id: string): boolean {
    return this.#schemas.has(id);
  }
}

export const SchemaRegistry = new Registry();
