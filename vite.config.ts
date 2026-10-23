/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildServiceWorker } from './build/service-worker';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** All files under a folder, as paths relative to it. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/** Writes dist/sw.js with the list of this build's files, so the app works offline. */
function serviceWorker(): Plugin {
  return {
    name: 'balagan-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const template = readFileSync('build/service-worker.template.js', 'utf8');
      const files = [...Object.keys(bundle), ...listFiles('public')];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildServiceWorker(template, files, pkg.version),
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
