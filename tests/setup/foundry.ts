import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  (globalThis as Record<string, unknown>).Hooks = {
    once:    vi.fn(),
    on:      vi.fn(),
    off:     vi.fn(),
    callAll: vi.fn(),
  };
  (globalThis as Record<string, unknown>).game = {
    settings: { get: vi.fn(), register: vi.fn() },
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Hooks;
  delete (globalThis as Record<string, unknown>).game;
  vi.restoreAllMocks();
});
