/**
 * Runs the real service worker template in a small fake browser environment
 * (caches, fetch, events) to check its behavior: install, activate, offline page,
 * timeouts, and what it refuses to store.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildServiceWorker } from '../../build/service-worker';

const ORIGIN = 'https://balagan.test';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Rubik';
const FONT_FILE = 'https://fonts.gstatic.com/s/rubik/v1/rubik.woff2';
const TIMEOUT_MS = 30;

const template = readFileSync(new URL('../../build/service-worker.template.js', import.meta.url), 'utf8')
  // Short network timeout so tests run fast.
  .replace('const NETWORK_TIMEOUT_MS = 3000;', `const NETWORK_TIMEOUT_MS = ${TIMEOUT_MS};`);

type Handler = () => Response | Promise<Response>;
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a fake request looks like to the worker. */
interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}
const keyOf = (req: string | FakeRequest) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).href;

class FakeCache {
  readonly entries = new Map<string, Response>();
  constructor(private readonly fetchImpl: (url: string) => Promise<Response>) {}
  async match(req: string | FakeRequest) {
    return this.entries.get(keyOf(req))?.clone();
  }
  async put(req: string | FakeRequest, res: Response) {
    this.entries.set(keyOf(req), res);
  }
  async addAll(urls: string[]) {
    for (const url of urls) {
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new Error(`addAll failed for ${url}`);
      await this.put(url, res);
    }
  }
  async text(req: string) {
    return (await this.match(req))?.text();
  }
}

function setup(files: string[] = ['index.html', 'assets/app-1.js', 'manifest.webmanifest']) {
  const routes = new Map<string, Handler>([
    [`${ORIGIN}/`, () => html('page v1')],
    [`${ORIGIN}/assets/app-1.js`, () => new Response('js v1')],
    [`${ORIGIN}/manifest.webmanifest`, () => new Response('{}', { headers: { 'content-type': 'application/manifest+json' } })],
    [FONT_CSS, () => new Response(`@font-face { src: url(${FONT_FILE}) format('woff2'); }`)],
    [FONT_FILE, () => new Response('font bytes')],
  ]);
  const fetchImpl = async (req: string | FakeRequest) => {
    const handler = routes.get(keyOf(req));
    if (!handler) return new Response('not found', { status: 404 });
    return handler();
  };
  const stores = new Map<string, FakeCache>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache(fetchImpl));
      return stores.get(name)!;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const listeners: Record<string, (event: unknown) => void> = {};
  let skipped = false;
  let claimed = false;
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    skipWaiting: async () => void (skipped = true),
    clients: { claim: async () => void (claimed = true) },
    location: { origin: ORIGIN },
  };

  const source = buildServiceWorker(
    template,
    files.map((path) => ({ path, content: path })),
    { appVersion: '1.0.0', fontCss: FONT_CSS },
  );
  new Function('self', 'caches', 'fetch', source)(self, caches, fetchImpl);

  async function lifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = [];
    listeners[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  /** Sends a fetch through the worker. Returns the response, or null when the worker ignores it. */
  async function request(url: string, mode = 'no-cors') {
    let responded = null as Promise<Response> | null;
    const waits: Promise<unknown>[] = [];
    listeners.fetch({
      request: { url, method: 'GET', mode },
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = responded ? await responded : null;
    return { response, settled: () => Promise.all(waits) };
  }

  const appCacheName = () => [...stores.keys()].find((k) => k.startsWith('balagan-') && !k.includes('fonts'))!;
  return {
    routes,
    stores,
    lifecycle,
    request,
    appCache: () => stores.get(appCacheName())!,
    fontCache: () => stores.get([...stores.keys()].find((k) => k.includes('fonts'))!)!,
    state: () => ({ skipped, claimed }),
  };
}

describe('service worker at runtime', () => {
  it('install caches the page, every build file and the fonts, then activates at once', async () => {
    const sw = setup();
    await sw.lifecycle('install');
    expect([...sw.appCache().entries.keys()].sort()).toEqual(
      [`${ORIGIN}/`, `${ORIGIN}/assets/app-1.js`, `${ORIGIN}/manifest.webmanifest`].sort(),
    );
    expect([...sw.fontCache().entries.keys()].sort()).toEqual([FONT_CSS, FONT_FILE].sort());
    expect(sw.state().skipped).toBe(true);
  });

  it('install still succeeds when the fonts cannot be downloaded', async () => {
    const sw = setup();
    sw.routes.set(FONT_CSS, () => Promise.reject(new TypeError('offline')));
    await sw.lifecycle('install');
    expect(sw.appCache().entries.size).toBe(3);
  });

  it('activate deletes caches of older builds but keeps fonts and other sites’ caches', async () => {
    const sw = setup();
    const open = (name: string) => sw.stores.set(name, new FakeCache(async () => new Response('')));
    open('balagan-oldversion');
    open('other-app-cache');
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    const names = [...sw.stores.keys()];
    expect(names).not.toContain('balagan-oldversion');
    expect(names).toContain('other-app-cache');
    expect(names.filter((n) => n.startsWith('balagan-'))).toHaveLength(2); // this build + fonts
    expect(sw.state().claimed).toBe(true);
  });

  describe('the page (navigation)', () => {
    it('online: serves the newest page and stores it', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/`, () => html('page v2'));
      const { response, settled } = await sw.request(`${ORIGIN}/`, 'navigate');
      expect(await response!.text()).toBe('page v2');
      await settled();
      expect(await sw.appCache().text('/')).toBe('page v2');
    });

    it('offline: serves the cached page', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/`, () => Promise.reject(new TypeError('offline')));
      const { response } = await sw.request(`${ORIGIN}/`, 'navigate');
      expect(await response!.text()).toBe('page v1');
    });

    it('server error: serves the cached page instead of the error', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/`, () => new Response('oops', { status: 500 }));
      const { response, settled } = await sw.request(`${ORIGIN}/`, 'navigate');
      expect(await response!.text()).toBe('page v1');
      await settled();
      expect(await sw.appCache().text('/')).toBe('page v1');
    });

    it('slow network: serves the cached page after the timeout, then stores the late page', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/`, () => sleep(TIMEOUT_MS * 4).then(() => html('page v2')));
      const { response, settled } = await sw.request(`${ORIGIN}/`, 'navigate');
      expect(await response!.text()).toBe('page v1');
      await settled();
      expect(await sw.appCache().text('/')).toBe('page v2');
    });

    it('a file opened as a page (e.g. the manifest) never replaces the cached app page', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      const { settled } = await sw.request(`${ORIGIN}/manifest.webmanifest`, 'navigate');
      await settled();
      expect(await sw.appCache().text('/')).toBe('page v1');
    });
  });

  describe('files', () => {
    it('serves build files from the cache, even offline', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/assets/app-1.js`, () => Promise.reject(new TypeError('offline')));
      const { response } = await sw.request(`${ORIGIN}/assets/app-1.js`);
      expect(await response!.text()).toBe('js v1');
    });

    it('does not store files that are not part of this build', async () => {
      const sw = setup();
      await sw.lifecycle('install');
      sw.routes.set(`${ORIGIN}/assets/old-0.js`, () => new Response('old js'));
      const { settled } = await sw.request(`${ORIGIN}/assets/old-0.js`);
      await settled();
      expect(await sw.appCache().match(`${ORIGIN}/assets/old-0.js`)).toBeUndefined();
    });

    it('does not store a failed font response', async () => {
      const sw = setup();
      sw.routes.set(FONT_CSS, () => Promise.reject(new TypeError('offline')));
      await sw.lifecycle('install');
      const missing = 'https://fonts.gstatic.com/s/missing.woff2';
      const { settled } = await sw.request(missing, 'cors');
      await settled();
      expect(await sw.fontCache().match(missing)).toBeUndefined();
    });

    it('ignores requests to other sites', async () => {
      const sw = setup();
      const { response } = await sw.request('https://example.com/x.js');
      expect(response).toBeNull();
    });
  });
});
