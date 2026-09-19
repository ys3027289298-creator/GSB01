import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    open: true
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js']
  }
})
