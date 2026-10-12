import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const apiPort = process.env.PORT ?? '3001';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/uploads': `http://localhost:${apiPort}`,
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
