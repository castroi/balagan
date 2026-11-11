import { describe, it, expect } from 'vitest';
import { handleShorten } from '../../src/platform/shorten-server';
import type { ShortenerProvider } from '../../src/platform/shortener';
import { viaServer } from '../../src/platform/shorteners/via-server';
import { createService } from '../../src/platform/shorteners/service';

const NOW = new Date('2026-11-11T21:14:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const WEEK_S = 7 * 24 * 60 * 60;
const LINK = 'https://balagan.example/?s=abc#import=1.xyz';

function fakeService(answer: () => Promise<string>) {
  const calls: [string, Date][] = [];
  const service: ShortenerProvider = {
    name: 'fake',
    isShortLink: () => false,
    shorten: (url, expiresAt) => {
      calls.push([url, expiresAt]);
      return answer();
    },
  };
  return { service, calls };
}

const post = (body: unknown, host = 'balagan.example', method = 'POST', origin?: string) =>
  new Request(`https://${host}/api/shorten`, {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

describe('POST /api/shorten', () => {
  it('shortens this site’s share link with the expiry it was given', async () => {
    const { service, calls } = fakeService(async () => 'https://tny.lv/eJLj4');
    const fromApp = post({ url: LINK, expiresAt: NOW_S + WEEK_S }, 'balagan.example', 'POST', 'https://balagan.example');
    const response = await handleShorten(fromApp, service, NOW);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shorturl: 'https://tny.lv/eJLj4' });
    expect(calls).toEqual([[LINK, new Date((NOW_S + WEEK_S) * 1000)]]);
  });

  it('refuses other sites, other links and bad input, without calling the service', async () => {
    const { service, calls } = fakeService(async () => 'https://tny.lv/x');
    const bad = [
      post({ url: 'https://evil.example/#import=1.xyz', expiresAt: NOW_S + WEEK_S }),
      post({ url: 'https://balagan.example/some/page', expiresAt: NOW_S + WEEK_S }),
      post({ url: 'http://balagan.example/#import=1.xyz', expiresAt: NOW_S + WEEK_S }),
      post({ url: 'https://balagan.example/other/#import=1.xyz', expiresAt: NOW_S + WEEK_S }),
      post({ url: 'https://balagan.example/#import=2.xyz', expiresAt: NOW_S + WEEK_S }),
      post({ url: LINK, expiresAt: NOW_S + WEEK_S }, 'evil.example'),
      post({ url: 'not a url', expiresAt: NOW_S + WEEK_S }),
      post({ url: LINK + 'x'.repeat(64_001), expiresAt: NOW_S + WEEK_S }),
      post({ url: LINK, expiresAt: NOW_S - 1 }),
      post({ url: LINK, expiresAt: NOW_S + 9 * 24 * 60 * 60 }),
      post({ url: LINK, expiresAt: '1795036440' }),
      post('{not json'),
      post(null),
    ];
    for (const request of bad) expect((await handleShorten(request, service, NOW)).status).toBe(400);
    expect((await handleShorten(post(null, 'balagan.example', 'GET'), service, NOW)).status).toBe(405);
    // A page on another site posting to this function.
    const fromElsewhere = post({ url: LINK, expiresAt: NOW_S + WEEK_S }, 'balagan.example', 'POST', 'https://evil.example');
    expect((await handleShorten(fromElsewhere, service, NOW)).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('answers 502 when the service fails', async () => {
    const { service } = fakeService(async () => {
      throw new Error('down');
    });
    const response = await handleShorten(post({ url: LINK, expiresAt: NOW_S + WEEK_S }), service, NOW);
    expect(response.status).toBe(502);
  });
});

describe('viaServer (the app side)', () => {
  const service = createService();
  const signal = new AbortController().signal;

  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { impl, calls };
  }

  it('posts the link and the expiry in Unix seconds to its own server', async () => {
    const { impl, calls } = fakeFetch(200, { shorturl: 'https://tny.lv/eJLj4' });
    const url = await viaServer(service, '/api/shorten', impl).shorten(LINK, new Date((NOW_S + WEEK_S) * 1000), signal);
    expect(url).toBe('https://tny.lv/eJLj4');
    expect(calls[0].url).toBe('/api/shorten');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ url: LINK, expiresAt: NOW_S + WEEK_S });
  });

  it('fails on a server error or an answer that is not the service’s https link', async () => {
    for (const [status, body] of [
      [502, { error: 'service' }],
      [200, { shorturl: 'https://evil.example/x' }],
      [200, { shorturl: 'http://tny.lv/eJLj4' }],
      [200, {}],
    ] as const) {
      const { impl } = fakeFetch(status, body);
      await expect(viaServer(service, '/api/shorten', impl).shorten(LINK, NOW, signal)).rejects.toThrow();
    }
  });

  it('keeps the service’s name and link recognition', () => {
    const provider = viaServer(service);
    expect(provider.name).toBe('tny.lv');
    expect(provider.isShortLink('https://tny.lv/eJLj4')).toBe(true);
  });
});
