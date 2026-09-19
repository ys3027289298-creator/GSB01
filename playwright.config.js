import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5199',
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: true,
    timeout: 30000
  }
});
