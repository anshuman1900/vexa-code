import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  base: './',
  build: { outDir: 'dist-gui', target: 'chrome110' },
});
