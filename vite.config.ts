import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'build'
      ? [
          {
            name: 'production-csp',
            transformIndexHtml(html: string) {
              return html.replace(
                '<head>',
                "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.octopus.energy; object-src 'none'; base-uri 'self'; form-action 'none'\"/>",
              );
            },
          },
        ]
      : []),
  ],
  base: process.env.PAGES_BASE || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('/node_modules/zod/')) return 'validation';
          if (
            id.includes('/node_modules/@js-temporal/') ||
            id.includes('/node_modules/decimal.js/') ||
            id.includes('/node_modules/jsbi/')
          )
            return 'calculation';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          )
            return 'react';
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
}));
