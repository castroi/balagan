/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildServiceWorker, findFontStylesheet, type BuildFile } from './build/service-worker';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** All files under a folder, with paths relative to it. */
function readFiles(dir: string): BuildFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(dir, full), content: readFileSync(full) };
    });
}

/** Writes dist/sw.js listing this build's files, so the app works offline. */
function serviceWorker(): Plugin {
  let root = process.cwd();
  let publicDir = '';
  return {
    name: 'balagan-service-worker',
    apply: 'build',
    // Run after Vite has added index.html and every asset to the bundle.
    enforce: 'post',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const built: BuildFile[] = Object.values(bundle).map((item) => ({
        path: item.fileName,
        content: item.type === 'chunk' ? item.code : item.source,
      }));
      const index = built.find((f) => f.path === 'index.html');
      const indexHtml =
        typeof index?.content === 'string' ? index.content : readFileSync(resolve(root, 'index.html'), 'utf8');
      const template = readFileSync(resolve(root, 'build/service-worker.template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildServiceWorker(template, [...built, ...(publicDir ? readFiles(publicDir) : [])], {
          appVersion: pkg.version,
          fontCss: findFontStylesheet(indexHtml),
        }),
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
    // `npm run test:coverage`: report for all app code; the pure logic of Choose Word must stay covered.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/plugins/choose-word/{parse,round}.ts': { lines: 95, functions: 95, branches: 95, statements: 95 },
      },
    },
  },
});
