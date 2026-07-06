import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function getBuildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    return String(Date.now());
  }
}

// Emits dist/version.json so the running app can detect that a newer build
// has been deployed even when Cloudflare (or any other layer we don't
// control) keeps serving a cached index.html/bundle.
function buildInfoPlugin(buildId: string): Plugin {
  return {
    name: 'aquamind-build-info',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      fs.writeFileSync(
        path.join(outDir, 'version.json'),
        JSON.stringify({ buildId, builtAt: new Date().toISOString() }),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');
  const buildId = getBuildId();

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), buildInfoPlugin(buildId)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
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
