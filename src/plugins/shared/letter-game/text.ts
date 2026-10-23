/** Hebrew wording that depends on a number. */

/** "מילה אחת" / "5 מילים" */
export const wordCountLabel = (n: number): string => (n === 1 ? 'מילה אחת' : `${n} מילים`);

/** "1 הושלמה" / "3 הושלמו" */
export const doneLabel = (n: number): string => `${n} ${n === 1 ? 'הושלמה' : 'הושלמו'}`;
