/**
 * Text-to-speech using the device's built-in voices (Web Speech API).
 * iPhone only allows speech after a tap, so the first word of a round is
 * spoken from the Start button.
 */
export type VoiceStatus = 'checking' | 'ok' | 'no-hebrew' | 'unsupported';

/** Languages the app can speak: Hebrew, plus the foreign languages of "איך אומרים?". */
export type VoiceLang = 'he' | 'ar' | 'en';

export interface Speaker {
  /** Resolves when speaking ends (or fails / times out). Never rejects. Hebrew unless `lang` says otherwise. */
  speak(text: string, lang?: VoiceLang): Promise<void>;
  cancel(): void;
  /** Resolves once the voice list has been checked (the Hebrew voice). */
  ready(): Promise<VoiceStatus>;
  /**
   * False when this device surely can't speak the language: no speech at all,
   * or a voice list without that language. True when it can, or can't tell
   * (some browsers list no voices yet still speak).
   */
  canSpeak(lang: VoiceLang): Promise<boolean>;
}

const LANG_TAGS: Record<VoiceLang, RegExp> = {
  he: /^(he|iw)([-_]|$)/i,
  ar: /^ar([-_]|$)/i,
  en: /^en([-_]|$)/i,
};

const DEFAULT_TAG: Record<VoiceLang, string> = { he: 'he-IL', ar: 'ar', en: 'en-US' };

export function createSpeaker(): Speaker {
  const synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;

  const findVoice = (lang: VoiceLang): SpeechSynthesisVoice | null => {
    if (!synth) return null;
    const voices = synth.getVoices().filter((v) => LANG_TAGS[lang].test(v.lang));
    return voices.find((v) => v.localService) ?? voices[0] ?? null;
  };

  // The voice list loads asynchronously; poll briefly as well as listening,
  // because not every browser fires `voiceschanged`.
  const readyPromise: Promise<VoiceStatus> = new Promise((resolve) => {
    if (!synth) return resolve('unsupported');
    if (findVoice('he')) return resolve('ok');
    let tries = 0;
    const check = () => {
      if (findVoice('he')) {
        cleanup();
        resolve('ok');
      } else if (++tries >= 15) {
        cleanup();
        resolve(synth.getVoices().length > 0 ? 'no-hebrew' : 'unsupported');
      }
    };
    const timer = window.setInterval(check, 200);
    const onChange = () => check();
    synth.addEventListener?.('voiceschanged', onChange);
    function cleanup() {
      window.clearInterval(timer);
      synth?.removeEventListener?.('voiceschanged', onChange);
    }
  });

  /** A known voice list without this language (an empty list can't tell, so it doesn't count). */
  const surelyMissing = (lang: VoiceLang) => !!synth && synth.getVoices().length > 0 && findVoice(lang) === null;

  return {
    ready: () => readyPromise,
    cancel: () => synth?.cancel(),
    async canSpeak(lang) {
      if (!synth) return false;
      await readyPromise;
      return !surelyMissing(lang);
    },
    speak(text: string, lang: VoiceLang = 'he') {
      return new Promise<void>((resolve) => {
        if (!synth) return resolve();
        synth.cancel();
        const voice = findVoice(lang);
        // A foreign word is never read by another language's voice: it would teach a wrong sound.
        if (lang !== 'he' && surelyMissing(lang)) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voice?.lang ?? DEFAULT_TAG[lang];
        if (voice) u.voice = voice;
        u.rate = 0.85;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(guard);
          resolve();
        };
        // Some engines never fire `end`; don't let the game wait forever.
        const guard = window.setTimeout(finish, Math.max(2500, text.length * 450));
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      });
    },
  };
}
