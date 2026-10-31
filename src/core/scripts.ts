/**
 * Foreign languages in "איך אומרים?": which language a word is in, judged by
 * its letters. Arabic letters mean Arabic and Latin letters mean English —
 * a known limit: another Latin-script language (e.g. French) would need a
 * language tag in the data (and a `dataVersion` bump), not a new guess here.
 */
/** Languages the app can speak: Hebrew, plus the foreign languages of "איך אומרים?". */
export type VoiceLang = 'he' | 'ar' | 'en';

export type ForeignLang = Exclude<VoiceLang, 'he'>;

export interface LanguageInfo {
  /** The language's name in Hebrew ("ערבית"). */
  name: string;
  dir: 'rtl' | 'ltr';
}

export const LANGUAGES: Record<ForeignLang, LanguageInfo> = {
  ar: { name: 'ערבית', dir: 'rtl' },
  en: { name: 'אנגלית', dir: 'ltr' },
};

const HEBREW_LETTER = /[א-ת]/;
// Arabic letters, harakat and Arabic punctuation (main block + supplement + extended-A).
// Not U+0600–0605 (invisible number signs) or U+061C (a direction mark, removed by cleanText).
const ARABIC_CHAR = /[؆-؛؝-ۿݐ-ݿࢠ-ࣿ]/;
// Letters only: not the tatweel (U+0640), which stretches a word but isn't a letter.
const ARABIC_LETTER = /[ؠ-ؿف-يٮ-ۓەۮۯۺ-ۼۿݐ-ݿࢠ-ࣉ]/;
// Latin letters, without × (U+00D7) and ÷ (U+00F7).
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ɏ]/;
/** Arabic presentation forms: letter shapes that come from copying out of PDFs. */
const ARABIC_PRESENTATION = /[ﭐ-﷿ﹰ-﻿]/g;
/** Presentation forms of the harakat: NFKC gives a space or a tatweel before the mark. */
const PRESENTATION_HARAKA = /^[ﹰ-ﹿ]$/;
/** Tatweel: a line that stretches Arabic words; not a letter. */
export const TATWEEL = 'ـ';

export const hasHebrewLetter = (text: string): boolean => HEBREW_LETTER.test(text);

/** The language of a foreign word: 'ar', 'en', 'mixed' (both), or null (neither, e.g. Hebrew or digits). */
export function detectLang(text: string): ForeignLang | 'mixed' | null {
  const ar = ARABIC_LETTER.test(text);
  const en = LATIN_LETTER.test(text);
  if (ar && en) return 'mixed';
  return ar ? 'ar' : en ? 'en' : null;
}

/**
 * Arabic presentation forms become the regular letters and marks (the same word
 * from any app gives the same characters); NFC then recombines e.g. alef + hamza.
 */
export const normalizeArabic = (text: string): string =>
  text
    .replace(ARABIC_PRESENTATION, (c) => {
      const plain = c.normalize('NFKC');
      return PRESENTATION_HARAKA.test(c) ? plain.replace(/^[ ـ]/, '') : plain;
    })
    .normalize('NFC');

/** Curly apostrophes become the ASCII one in English ("don’t" = "don't"). */
export const normalizeLatinApostrophes = (text: string): string => text.replace(/[‘’]/g, "'");

// Punctuation allowed in a foreign word, besides spaces.
const PUNCT = /[\s'.,!?\-/]/;
const ARABIC_PUNCT = /[،؟؛]/;

/** True when the character belongs in a word of this language (letters, its marks, spaces, light punctuation). */
export function allowedIn(lang: ForeignLang, char: string): boolean {
  if (PUNCT.test(char)) return true;
  if (lang === 'ar') return ARABIC_CHAR.test(char) || ARABIC_PUNCT.test(char);
  return LATIN_LETTER.test(char);
}
