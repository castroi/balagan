/** Test word lists (Hebrew with niqqud), shared by unit and browser tests. */
export const TEN_WORDS = ['כַּעַס', 'עַקְשָׁן', 'מִצְטַעֵר', 'עֶלְבּוֹן', 'הֶעֱלִיב', 'פָּגַע', 'עָיֵף', 'צַעַר', 'רָשָׁע', 'עָצוּב'];

export const TWENTY_WORDS = [
  ...TEN_WORDS,
  'שָׁלוֹם',
  'בַּיִת',
  'סֵפֶר',
  'יֶלֶד',
  'כֶּלֶב',
  'חָתוּל',
  'שֶׁמֶשׁ',
  'יָרֵחַ',
  'פֶּרַח',
  'עֵץ',
];

/** One more than the maximum. */
export const TWENTY_ONE_WORDS = [...TWENTY_WORDS, 'מַיִם'];
