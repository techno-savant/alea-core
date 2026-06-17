declare module '*.css';

// Foundry VTT ambient globals — minimal surface needed by alea-core.
// Extend as the implementation requires additional Foundry APIs.

declare const Hooks: {
  once(event: string, fn: () => void): number;
  on(event: string, fn: (...args: unknown[]) => void): number;
  off(event: string, id: number): void;
  callAll(event: string, ...args: unknown[]): boolean;
};

declare const game: {
  modules: {
    get<T extends Record<string, unknown> = Record<string, unknown>>(id: string): T | undefined;
  };
  settings: {
    register(
      namespace: string,
      key: string,
      data: Record<string, unknown>,
    ): void;
    get<T>(namespace: string, key: string): T;
  };
  i18n: {
    localize(key: string): string;
    format(key: string, data: Record<string, unknown>): string;
  };
  socket: {
    emit(event: string, data: unknown): void;
    on(event: string, fn: (data: unknown) => void): void;
  };
  user: {
    id: string;
    isGM: boolean;
  } | null;
};

declare const ui: {
  notifications: {
    warn(message: string): void;
    error(message: string): void;
    info(message: string): void;
  };
};

declare const CONFIG: Record<string, unknown>;
