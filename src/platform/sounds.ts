/**
 * Short sound effects generated with Web Audio (no sound files to load).
 * `unlock()` must be called from a tap before sounds can play on iPhone.
 */
export type SoundName = 'correct' | 'wrong' | 'success';

export interface Sounds {
  unlock(): void;
  play(name: SoundName): void;
}

type Note = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };

const PATTERNS: Record<SoundName, Note[]> = {
  correct: [
    { freq: 660, start: 0, dur: 0.09 },
    { freq: 880, start: 0.08, dur: 0.12 },
  ],
  wrong: [{ freq: 196, start: 0, dur: 0.22, type: 'triangle', gain: 0.22 }],
  success: [
    { freq: 523, start: 0, dur: 0.12 },
    { freq: 659, start: 0.11, dur: 0.12 },
    { freq: 784, start: 0.22, dur: 0.12 },
    { freq: 1047, start: 0.33, dur: 0.28 },
  ],
};

export function createSounds(): Sounds {
  let ctx: AudioContext | null = null;

  const getCtx = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  return {
    unlock() {
      const c = getCtx();
      if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
    },
    play(name) {
      const c = getCtx();
      if (!c) return;
      if (c.state === 'suspended') void c.resume().catch(() => undefined);
      const now = c.currentTime + 0.01;
      for (const n of PATTERNS[name]) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = n.type ?? 'sine';
        osc.frequency.value = n.freq;
        const peak = n.gain ?? 0.18;
        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(peak, now + n.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
        osc.connect(gain).connect(c.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    },
  };
}
