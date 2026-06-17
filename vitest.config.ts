import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup/foundry.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/declarations.d.ts',
        'src/index.ts',
        'src/api.ts',
        'src/pipeline/RollPipeline.ts',
        'src/mechanics/index.ts',
        'src/lex/**',
      ],
    },
  },
});
