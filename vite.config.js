import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: { port: 5173, open: false },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    globals: true
  }
});
