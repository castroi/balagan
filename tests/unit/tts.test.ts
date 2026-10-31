import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker } from '../../src/platform/tts';

interface FakeVoice {
  lang: string;
  name: string;
  localService: boolean;
}
interface Said {
  text: string;
  lang: string;
  voice?: string;
}

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: FakeVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

let said: Said[] = [];

/** A window whose device has these voices (or no speech at all when `voices` is null). */
function device(voices: FakeVoice[] | null) {
  said = [];
  const synth = {
    getVoices: () => voices ?? [],
    speak(u: FakeUtterance) {
      said.push({ text: u.text, lang: u.lang, ...(u.voice ? { voice: u.voice.name } : {}) });
      queueMicrotask(() => u.onend?.());
    },
    cancel() {},
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal('window', {
    ...(voices === null ? {} : { speechSynthesis: synth }),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
}

const voice = (lang: string, localService = true): FakeVoice => ({ lang, name: lang, localService });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('speaker languages', () => {
  it('speaks each language with its own voice', async () => {
    device([voice('he-IL'), voice('ar-SA'), voice('en-US')]);
    const s = createSpeaker();
    await s.speak('דוד');
    await s.speak('خال', 'ar');
    await s.speak('uncle', 'en');
    expect(said).toEqual([
      { text: 'דוד', lang: 'he-IL', voice: 'he-IL' },
      { text: 'خال', lang: 'ar-SA', voice: 'ar-SA' },
      { text: 'uncle', lang: 'en-US', voice: 'en-US' },
    ]);
  });

  it('prefers the usual English accent (en-US) over another local English voice', async () => {
    device([voice('he-IL'), voice('en-IN'), voice('en-US', false)]);
    await createSpeaker().speak('uncle', 'en');
    expect(said[0].voice).toBe('en-US');
  });

  it('a listed device without the language stays silent: never another language’s voice', async () => {
    device([voice('he-IL'), voice('en-US')]);
    const s = createSpeaker();
    expect(await s.canSpeak('ar')).toBe(false);
    expect(await s.canSpeak('en')).toBe(true);
    await s.speak('خال', 'ar');
    expect(said).toEqual([]);
  });

  it('an empty voice list can’t tell: it still tries, with the language tag', async () => {
    device([]);
    const s = createSpeaker();
    const can = s.canSpeak('ar');
    // The Hebrew check polls the voice list for about 3 seconds first.
    await vi.advanceTimersByTimeAsync(3500);
    expect(await can).toBe(true);
    expect(await s.ready()).toBe('unsupported');
    await s.speak('خال', 'ar');
    expect(said).toEqual([{ text: 'خال', lang: 'ar' }]);
  });

  it('Hebrew is still spoken when no Hebrew voice is listed (as before)', async () => {
    device([voice('en-US')]);
    const s = createSpeaker();
    const status = s.ready();
    await vi.advanceTimersByTimeAsync(3500);
    expect(await status).toBe('no-hebrew');
    await s.speak('דוד');
    expect(said).toEqual([{ text: 'דוד', lang: 'he-IL' }]);
  });

  it('without speech at all: nothing can be spoken and nothing waits', async () => {
    device(null);
    const s = createSpeaker();
    expect(await s.ready()).toBe('unsupported');
    expect(await s.canSpeak('ar')).toBe(false);
    await s.speak('خال', 'ar');
    expect(said).toEqual([]);
  });
});
