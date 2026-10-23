/** Points for a finished word: 0 mistakes = 10, 1–2 = 7, 3 or more = 5. */
export function pointsForMistakes(mistakes: number): number {
  if (mistakes <= 0) return 10;
  if (mistakes <= 2) return 7;
  return 5;
}
