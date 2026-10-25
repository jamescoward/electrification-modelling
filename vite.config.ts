import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE || '/',
  test: { include: ['src/**/*.test.ts'] },
});
