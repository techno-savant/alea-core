import type { ResultTier, TierLabelKey } from '../types/index.js';

class Registry {
  #labels: Partial<Record<TierLabelKey, string>> = {};

  register(labels: Partial<Record<TierLabelKey, string>>): void {
    this.#labels = { ...this.#labels, ...labels };
  }

  resolve(key: TierLabelKey): string | undefined {
    return this.#labels[key];
  }

  resolveWithFallback(tier: ResultTier, flags: { glitch?: boolean; critical?: boolean }): string {
    if (flags.glitch) {
      const composite = this.#labels[`${tier}+glitch`];
      if (composite !== undefined) return composite;
    }
    if (flags.critical) {
      const composite = this.#labels[`${tier}+critical`];
      if (composite !== undefined) return composite;
    }
    return this.#labels[tier] ?? tier;
  }
}

export const TierLabelRegistry = new Registry();
