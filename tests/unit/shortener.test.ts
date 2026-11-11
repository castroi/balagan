import { describe, it, expect } from 'vitest';
import { createShortLink, expiryFrom, SHORT_LINK_DAYS, type ShortenerProvider } from '../../src/platform/shortener';
import { createTnyLv, findNonce, readShortUrl } from '../../src/platform/shorteners/tny-lv';

const NOW = new Date('2026-11-11T21:14:00Z');
const PAGE = '<form><input type="hidden" name="nonce" value="6bb3f85f93"></form>';

function fakeProvider(shorten: ShortenerProvider['shorten']): ShortenerProvider {
  return { name: 'fake', shorten, isShortLink: () => false };
}

describe('createShortLink', () => {
  it('expires 7 days after it was made, whatever the time zone', () => {
    expect(SHORT_LINK_DAYS).toBe(7);
    expect(expiryFrom(NOW).toISOString()).toBe('2026-11-18T21:14:00.000Z');
  });

  it('passes the link and the expiry to the provider', async () => {
    const calls: [string, Date][] = [];
    const provider = fakeProvider(async (url, expiresAt) => {
      calls.push([url, expiresAt]);
      return 'https://sho.rt/abc';
    });
    const link = await createShortLink('https://example.app/#import=1.x', provider, NOW);
    expect(link).toEqual({ url: 'https://sho.rt/abc', expiresAt: expiryFrom(NOW) });
    expect(calls).toEqual([['https://example.app/#import=1.x', expiryFrom(NOW)]]);
  });

  it('gives up after the timeout and aborts the request', async () => {
    let aborted = false;
    const provider = fakeProvider(
      (_url, _expiry, signal) =>
        new Promise<string>(() => signal.addEventListener('abort', () => (aborted = true))),
    );
    await expect(createShortLink('https://example.app/', provider, NOW, 20)).rejects.toThrow('timeout');
    expect(aborted).toBe(true);
  });

  it('passes a provider failure on', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('down');
    });
    await expect(createShortLink('https://example.app/', provider, NOW)).rejects.toThrow('down');
  });
});

describe('tny.lv provider', () => {
  type Call = { url: string; init?: RequestInit };

  /** A fake tny.lv: serves the page with `nonces` in turn, and answers posts with `answers` in turn. */
  function fakeFetch(nonces: string[], answers: unknown[]) {
    const calls: Call[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === 'POST') {
        const answer = answers.shift();
        return new Response(typeof answer === 'string' ? answer : JSON.stringify(answer), { status: 200 });
      }
      return new Response(`<input name="nonce" value="${nonces.shift()}">`, { status: 200 });
    }) as typeof fetch;
    return { impl, calls };
  }
  const signal = new AbortController().signal;
  const posts = (calls: Call[]) => calls.filter((c) => c.init?.method === 'POST');

  it('finds the nonce in the page', () => {
    expect(findNonce(PAGE)).toBe('6bb3f85f93');
    expect(findNonce(`var data = { nonce: '6bb3f85f93' };`)).toBe('6bb3f85f93');
    expect(findNonce(`{"nonce":"6bb3f85f93"}`)).toBe('6bb3f85f93');
    expect(findNonce('<p>no form</p>')).toBeNull();
  });

  it('accepts only an https tny.lv short link from the answer', () => {
    expect(readShortUrl({ shorturl: 'https://tny.lv/eJLj4' })).toBe('https://tny.lv/eJLj4');
    expect(readShortUrl({ shorturl: 'http://tny.lv/eJLj4' })).toBeNull();
    expect(readShortUrl({ shorturl: 'https://evil.example/eJLj4' })).toBeNull();
    expect(readShortUrl({ shorturl: 'https://tny.lv/' })).toBeNull();
    expect(readShortUrl({ status: 'fail' })).toBeNull();
    expect(readShortUrl(null)).toBeNull();
  });

  it('sends what the web form sends, with the expiry in Unix seconds', async () => {
    const { impl, calls } = fakeFetch(['6bb3f85f93'], [{ shorturl: 'https://tny.lv/eJLj4' }]);
    const url = await createTnyLv(impl).shorten('https://example.app/#import=1.x', expiryFrom(NOW), signal);
    expect(url).toBe('https://tny.lv/eJLj4');
    expect(calls[0].url).toBe('https://tny.lv/');
    const [post] = posts(calls);
    expect(post.url).toBe('https://tny.lv/?ajax=1');
    expect(post.init?.credentials).toBe('omit');
    const body = new URLSearchParams(String(post.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      nonce: '6bb3f85f93',
      url: 'https://example.app/#import=1.x',
      keyword: '',
      af_expiry_ts: '1795036440',
      af_password: '',
    });
  });

  it('reuses the nonce, and gets a fresh one once when the old one stops working', async () => {
    const { impl, calls } = fakeFetch(
      ['aaaaaaaaaa', 'bbbbbbbbbb'],
      [{ shorturl: 'https://tny.lv/one' }, { status: 'fail' }, { shorturl: 'https://tny.lv/two' }],
    );
    const provider = createTnyLv(impl);
    expect(await provider.shorten('https://example.app/1', expiryFrom(NOW), signal)).toBe('https://tny.lv/one');
    expect(await provider.shorten('https://example.app/2', expiryFrom(NOW), signal)).toBe('https://tny.lv/two');
    const nonces = posts(calls).map((c) => new URLSearchParams(String(c.init?.body)).get('nonce'));
    expect(nonces).toEqual(['aaaaaaaaaa', 'aaaaaaaaaa', 'bbbbbbbbbb']);
  });

  it('fails without a loop when the service keeps refusing', async () => {
    const { impl, calls } = fakeFetch(['aaaaaaaaaa', 'bbbbbbbbbb'], ['not json', 'not json', 'not json']);
    const provider = createTnyLv(impl);
    await expect(provider.shorten('https://example.app/', expiryFrom(NOW), signal)).rejects.toThrow();
    expect(posts(calls)).toHaveLength(1);
  });

  it('fails when the page has no nonce', async () => {
    const impl = (async () => new Response('<p>maintenance</p>', { status: 200 })) as typeof fetch;
    await expect(createTnyLv(impl).shorten('https://example.app/', expiryFrom(NOW), signal)).rejects.toThrow();
  });

  it('recognises its own short links only', () => {
    const provider = createTnyLv();
    for (const text of ['https://tny.lv/eJLj4', ' tny.lv/eJLj4\n', 'http://www.tny.lv/eJLj4/']) {
      expect(provider.isShortLink(text)).toBe(true);
    }
    for (const text of ['https://tny.lv/', 'https://example.app/#import=1.x', 'https://tny.lv.evil/abc']) {
      expect(provider.isShortLink(text)).toBe(false);
    }
  });
});
