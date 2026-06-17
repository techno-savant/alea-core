import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'alea-core',
      fileName: 'alea-core',
      formats: ['es'],
    },
    outDir: 'dist',
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: (info) => (info.name === 'style.css' ? 'alea-core.css' : (info.name ?? 'asset')),
      },
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
  },
});
