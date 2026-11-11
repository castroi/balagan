import { describe, it, expect } from 'vitest';
import {
  createShortLink,
  expiryFrom,
  SHORT_LINK_DAYS,
  uniqueLink,
  type ShortenerProvider,
} from '../../src/platform/shortener';
import { decodeShare } from '../../src/platform/share-codec';
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

  it('passes the link, made unique, and the expiry to the provider', async () => {
    const calls: [string, Date][] = [];
    const provider = fakeProvider(async (url, expiresAt) => {
      calls.push([url, expiresAt]);
      return 'https://sho.rt/abc';
    });
    const link = await createShortLink('https://example.app/#import=1.x', provider, NOW);
    expect(link).toEqual({ url: 'https://sho.rt/abc', expiresAt: expiryFrom(NOW) });
    expect(calls).toEqual([[uniqueLink('https://example.app/#import=1.x', NOW), expiryFrom(NOW)]]);
  });

  it('makes every request a new link, and the content still loads from it', () => {
    const code = 'eyJhIjp7InNjcmFtYmxlZC13b3JkcyI6eyJ2IjoxLCJkIjp7IndvcmRzIjpbIteQIl19fX19';
    const unique = uniqueLink(`https://example.app/#import=1.${code}`, NOW);
    expect(unique).toBe(`https://example.app/?s=${NOW.getTime().toString(36)}#import=1.${code}`);
    expect(uniqueLink('https://example.app/#import=1.x', new Date(NOW.getTime() + 1))).not.toBe(
      uniqueLink('https://example.app/#import=1.x', NOW),
    );
    expect(decodeShare(unique)).toEqual(decodeShare(`https://example.app/#import=1.${code}`));
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
      return new Response(`<input name="nonce" value="${nonces.shift()}">`, {
        status: 200,
        headers: { 'set-cookie': 'PHPSESSID=abc123; path=/; HttpOnly' },
      });
    }) as typeof fetch;
    return { impl, calls };
  }
  const signal = new AbortController().signal;
  const posts = (calls: Call[]) => calls.filter((c) => c.init?.method === 'POST');

  it('finds the nonce in the page', () => {
    expect(findNonce(PAGE)).toBe('6bb3f85f93');
    expect(findNonce(`var data = { nonce: '6bb3f85f93' };`)).toBe('6bb3f85f93');
    expect(findNonce(`{"nonce":"6bb3f85f93"}`)).toBe('6bb3f85f93');
    expect(findNonce(`<input value="6bb3f85f93" name="nonce" type="hidden">`)).toBe('6bb3f85f93');
    expect(findNonce(`var nonce = "6bb3f85f93";`)).toBe('6bb3f85f93');
    expect(findNonce('<p>no form</p>')).toBeNull();
    expect(findNonce('<div data-nonce="6bb3f85f93"></div>')).toBe('6bb3f85f93');
    expect(findNonce('fetch("/?ajax=1&nonce=6bb3f85f93")')).toBe('6bb3f85f93');
    expect(findNonce(`nonce='6bb3f85f93'`)).toBe('6bb3f85f93');
    expect(findNonce(`data.append('nonce', '6bb3f85f93');`)).toBe('6bb3f85f93');
    expect(findNonce(`{\\"nonce\\":\\"6bb3f85f93\\"}`)).toBe('6bb3f85f93');
    // A script's (base64) CSP nonce, or a hex-looking file name, is not the form's nonce.
    expect(findNonce('<script nonce="rAnd0mB4se64Valu3Xy==" src="app.abcdef0123.js"></script>')).toBeNull();
    expect(
      findNonce('<script nonce="rAnd0mB4se64Valu3Xy=="></script><input type="hidden" name="nonce" value="6bb3f85f93">'),
    ).toBe('6bb3f85f93');
  });

  it('accepts only an https tny.lv short link from the answer', () => {
    expect(readShortUrl({ shorturl: 'https://tny.lv/eJLj4' })).toBe('https://tny.lv/eJLj4');
    expect(readShortUrl({ shorturl: 'http://tny.lv/eJLj4' })).toBeNull();
    expect(readShortUrl({ shorturl: 'https://evil.example/eJLj4' })).toBeNull();
    expect(readShortUrl({ shorturl: 'https://tny.lv/' })).toBeNull();
    expect(readShortUrl({ status: 'fail' })).toBeNull();
    // An existing link comes back with "fail" and its old expiry: not used.
    expect(readShortUrl({ status: 'fail', shorturl: 'https://tny.lv/old' })).toBeNull();
    expect(readShortUrl({ status: 'success', shorturl: 'https://tny.lv/new' })).toBe('https://tny.lv/new');
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

  it('sends the page’s cookies back and the headers of the site’s own form', async () => {
    const { impl, calls } = fakeFetch(['6bb3f85f93'], [{ shorturl: 'https://tny.lv/eJLj4' }]);
    await createTnyLv(impl).shorten('https://example.app/', expiryFrom(NOW), signal);
    const headers = posts(calls)[0].init?.headers as Record<string, string>;
    expect(headers.cookie).toBe('PHPSESSID=abc123');
    expect(headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(headers.referer).toBe('https://tny.lv/');
  });

  it('says why it failed (for the server log), without the link', async () => {
    const { impl } = fakeFetch(['6bb3f85f93'], [{ status: 'fail', code: 'error:nonce', message: 'Unauthorized' }]);
    const error = await createTnyLv(impl)
      .shorten('https://example.app/#import=1.secret', expiryFrom(NOW), signal)
      .catch((e: Error) => e);
    expect(String(error)).toContain('status=fail code=error:nonce message=Unauthorized');
    expect(String(error)).not.toContain('secret');
    const noNonce = (async () => new Response('<p>maintenance</p>')) as typeof fetch;
    const error2 = await createTnyLv(noNonce).shorten('https://example.app/', expiryFrom(NOW), signal).catch((e: Error) => e);
    expect(String(error2)).toContain('no nonce found');
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
