import { describe, it, expect } from 'vitest';
import { allowedIn, detectLang, normalizeArabic, normalizeLatinApostrophes } from '../../src/core/scripts';
import { cleanText, hebrewRuns, normalizeText, toGeresh } from '../../src/core/unicode';

describe('detectLang', () => {
  it('tells Arabic and English letters apart', () => {
    expect(detectLang('خَال')).toBe('ar');
    expect(detectLang('uncle')).toBe('en');
    expect(detectLang('café')).toBe('en');
    expect(detectLang('خال uncle')).toBe('mixed');
    expect(detectLang('דוד')).toBeNull();
    expect(detectLang('12')).toBeNull();
    // × and ÷ sit among the Latin letters in Unicode but aren't letters; a tatweel isn't an Arabic letter.
    expect(detectLang('×÷')).toBeNull();
    expect(detectLang('ـ')).toBeNull();
  });
});

describe('allowedIn', () => {
  it('allows letters, marks and light punctuation of the language', () => {
    for (const c of [...'عَمَّة', ' ', '،', '؟']) expect(allowedIn('ar', c)).toBe(true);
    for (const c of [..."don't ice-cream."]) expect(allowedIn('en', c)).toBe(true);
    expect(allowedIn('en', 'خ')).toBe(false);
    expect(allowedIn('ar', 'a')).toBe(false);
    expect(allowedIn('en', 'א')).toBe(false);
    expect(allowedIn('en', '#')).toBe(false);
  });
});

describe('foreign text cleaning', () => {
  it('turns Arabic presentation forms into regular letters', () => {
    expect(normalizeArabic('ﺧﺎﻝ')).toBe('خال');
    expect(normalizeArabic('uncle')).toBe('uncle');
    // Harakat forms: the bare mark, without the space (FE76) or tatweel (FE77) NFKC adds.
    expect(normalizeArabic('بﹶ')).toBe('بَ');
    expect(normalizeArabic('بﹷ')).toBe('بَ');
    // Then NFC: a presentation alef followed by a hamza above becomes أ.
    expect(normalizeArabic('ﺍٔ')).toBe('أ');
  });

  it('turns curly apostrophes into the ASCII one', () => {
    expect(normalizeLatinApostrophes('don’t ‘x')).toBe("don't 'x");
  });
});

describe('cleanText', () => {
  it('cleans like normalizeText but keeps apostrophes', () => {
    expect(cleanText("‏don't\r\n")).toBe("don't\n");
    expect(cleanText('؜خال')).toBe('خال');
    expect(toGeresh(cleanText("ג'ירפה"))).toBe(normalizeText("ג'ירפה"));
  });

  it('finds the Hebrew words inside a longer text', () => {
    expect(hebrewRuns('בן (צאצא) / ג׳ x')).toEqual(['בן', 'צאצא', 'ג׳']);
  });
});
