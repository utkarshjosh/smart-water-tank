import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'next/link': path.resolve(__dirname, 'src/shims/next/link.tsx'),
        'next/image': path.resolve(__dirname, 'src/shims/next/image.tsx'),
        'next/navigation': path.resolve(__dirname, 'src/shims/next/navigation.ts'),
      },
    },
    server: {
      port: 3001,
    },
    preview: {
      port: 4173,
    },
  };
});
