# Balagan (בלגן) — project rules

Hebrew writing practice — and words in another language (Arabic, English) — for one kid (up to age 10) on a phone. A parent pastes the week's content; the kid plays. Static site on Vercel, no server, no database.

Each rule has a one-line **why**. Don't change a rule without understanding its reason; if a rule must change, update this file in the same change.

## Git workflow

- **Every change gets its own branch** from `main`, named `<type>/<short-description>` (types: `feat`, `fix`, `chore`, `docs`, `test`). Why: `main` is what Vercel deploys to the kid.
- **Never commit directly to `main`.** Push the branch and open a pull request. Why: CI and a Vercel preview run on the branch before anything goes live.
- **Only the owner merges**, after CI is green and the preview has been checked on a phone when the change is visible. Why: the owner decides what reaches the kid.
- Small, focused commits with a clear message saying what changed and why.
- Run `npm run typecheck`, `npm test` and, for UI changes, `npm run test:e2e` before pushing.
- Commit `package-lock.json` with every dependency change; CI uses `npm ci`. Why: the same tool versions everywhere, so a tool release can't break the build. If `npm install` can't run locally, use the "Update lockfile" workflow in the Actions tab on your branch (never on `main`; it refuses).

## Platform decisions

| Rule | Why |
|---|---|
| No server or database; data lives in `localStorage` (`src/platform/storage.ts`) | Simple, free, private |
| Content moves between devices only via the share link hash `#import=1.<base64url>` | The hash is never sent to the server |
| Keep the Import box on the edit screen | On iPhone, an installed home-screen app has separate storage and can't receive links directly |
| TypeScript + Vite, no UI framework | A few screens; type checks catch mistakes before the phone |
| `npm run build` runs type check (app, tests and config files) + unit tests before building | Vercel won't deploy a broken version |
| Offline service worker generated at build time (`build/service-worker.template.js`): caches every built file on install, one cache per build (version = hash of every file's content) | The app opens offline after a single visit; old versions don't pile up |
| Pages network-first with a 3-second timeout, **no update prompt** | The latest version loads automatically when online; a weak connection doesn't block the kid |
| Interface in Hebrew, right to left; foreign words (Arabic, English) get their own `lang` and `dir` on their element | It's for the kid; punctuation and screen readers need the word's real language |
| Version only on the edit screen, set in `package.json` | Not distracting during play; one place to change it |
| No PIN; Clear asks to confirm and offers undo | Simple for the parent, safe from accidental taps |
| Device text-to-speech only; no recordings in v1. `speak(text, lang)` speaks Hebrew, Arabic or English (`src/platform/tts.ts`) | Recordings can't travel in a link |
| A foreign word is never read by another language's voice: with no voice for it the word stays silent | A wrong voice teaches a wrong sound |
| Voice-test buttons and a "no Hebrew voice" warning on the edit screen; a "no Arabic/English voice" warning only for languages in the list | Voice quality varies by phone; Android often lacks the Arabic voice pack |
| Practice only — nothing is sent anywhere | No accounts, no tracking |
| Data saved by a newer app version makes the app read-only (no save, import, Clear or points — not even in memory); it says to refresh | An old cached version opened offline must not wipe the week's words or show content that isn't saved |
| Messages (toasts) belong to their screen and disappear when the screen changes | An Undo shown on another screen would act on the wrong thing |
| Device settings (e.g. how long the popup with a right/wrong pair stays) live under their own key `hebrew-practice:settings` (`src/platform/settings.ts`), never in the share link; read-only mode blocks changing them | Older app versions rewrite the main saved data and would drop new fields; settings belong to the device, not to the week's content |

## Design rules (every activity)

| Rule | Why |
|---|---|
| Reuse the tokens in `src/styles.css` (colors, Rubik for UI and English, Noto Sans Hebrew for letters, Noto Sans Arabic for Arabic via `:lang(ar)`, yellow tiles with dark border) | One consistent, calm look |
| Touch targets at least 44px; letter tiles bigger | Kids' fingers are less precise (Apple's minimum is 44pt) |
| Icons and voice before text | Younger kids may not read well yet |
| Every game starts with a Start button | iPhone allows sound and speech only after a tap |
| Every game uses the shared start screen (`startScreen` in `src/plugins/shared/start-screen.ts`): a round in progress shows "ממשיכים" and, under it, a smaller outlined "↻ מתחילים מהתחלה" (only when resuming, from word 2). Restart does what "לשחק שוב" does — new random order, round points 0, the total kept — with no confirmation and no undo, then focus goes to the speaker. No restart (or skip) button during play | Kids sometimes want a fresh start; having to leave and come back keeps it from becoming an escape from hard words; losing a round is small and shows at once |
| Mistakes: orange + shake + soft sound, never red | A nudge, not a failure |
| Correct: green + ✓ icon + short sound | Color is never the only signal (color-blind kids) |
| No decoration that does nothing; no "coming soon" items | Distracts and frustrates kids |
| Respect "reduce motion" (already global in `styles.css`) | Accessibility |
| Confirmation dialogs start on the safe button; Escape cancels; the page behind is inert | A quick tap or Enter must not delete anything; focus can't wander behind the dialog |
| After a screen change, focus moves to the new screen's title; inside a game, starting, restarting or playing a round again focuses the speaker button | Keyboard and screen-reader users aren't left on an empty page; the speaker is the first thing to use in a round |
| Screen-reader messages go through `announce()` (`src/ui/dialog.ts`), not new `aria-live` elements | Live regions recreated on every render aren't read aloud |
| Borders of empty slots and inputs use `--line` (at least 3:1 contrast) | Kids must see where letters go |
| Media "play" icon points right even in RTL | Media controls aren't mirrored |
| Save progress after each item; resume where the kid stopped | Kids close apps mid-game |

## Content and the share link

| Rule | Why |
|---|---|
| Store only compact source text (e.g. the word list), never computed state, audio or images | All content travels inside one link |
| Clean pasted text with `normalizeText` (`src/core/unicode.ts`) before validating or storing | The same word copied from different apps must produce identical characters |
| In Hebrew text every apostrophe (', ‘, ’) becomes the Hebrew geresh ׳; the editor allows at most 4 marks per letter, no repeated mark and one geresh. In English the curly ones become ASCII `'`; Arabic marks are never checked by the Hebrew rules (`cleanText` + `toGeresh` per part) | iPhone types curly apostrophes; repeated marks are pasting mistakes that bloat links; a geresh in "don't" is wrong |
| Saved and shared data is re-checked leniently (`deserialize` doesn't apply new editor-only rules) | Words saved before a rule existed must keep working |
| Error messages show invisible characters as a code point (e.g. `U+034F`) | The parent must be able to see what's wrong |
| Use content exactly as the parent typed it (niqqud, final letters) | The parent controls the content |
| Validate in the editor with clear Hebrew messages; block saving on errors | Bad content shouldn't reach the kid |
| Never change the link format without bumping `SHARE_FORMAT_VERSION` | Old links must fail with a friendly message, not break |
| Before releasing an activity, test a real link with a full week of content in WhatsApp | Messaging apps may cut long links |

## Adding a new activity

1. Create `src/plugins/<activity>/` and implement `AssignmentPlugin` (`src/plugins/types.ts`).
2. Register it in `PLUGINS` in `src/plugins/registry.ts`. The home screen, edit screen, saving, clearing and sharing pick it up automatically.
3. Follow `src/plugins/confusing-letters/` as the reference:
   - `parse.ts` — the editor's input format, validation and `deserialize`
   - `index.ts` — the plugin object
   - `preview.ts` — optional "מה הילד יראה" preview on the edit screen (`preview` in the plugin)
4. Use the shared start screen (`src/plugins/shared/start-screen.ts`) for the screen before a round, with `onRestart` doing the same as "לשחק שוב" — so every game can continue or restart a round in the same way.
5. A letter-tile game (hear a word, place its letters) reuses `src/plugins/shared/letter-game/`: `round.ts` (pure logic, no DOM), `progress.ts`, `view.ts` (`mountLetterGame` with options), `word.ts` (word rules). A different kind of game gets its own pure logic file + view.
6. Give its home card and edit section a `data-plugin` attribute (done by the platform) and scope e2e selectors to it — several activities share the same buttons.

| Rule | Why |
|---|---|
| Each activity has its own editor format and its own Save/Clear | Activities are independent; clearing one doesn't touch others |
| Edit sections collapse with a real button (`aria-expanded`); collapsed shows what's saved; a section with an error never collapses | Several activities make a long page; an error must never be hidden |
| Every activity's saved content goes into the share link automatically (`App.sharePayload` loops over `PLUGINS`) | One link carries the whole week |
| A link replaces only the activities it contains, and the question names them (`importedTitles`) | The parent knows what will change; other activities stay |
| Never change an activity's `id` | It's the key in storage and in share links |
| Bump `dataVersion` when the data shape changes; `deserialize` keeps reading old versions | Saved data and old links keep working |
| Add points and save progress in one `ctx.commit(progress, points)` | Points are never counted twice after a reload |
| Words/items order random per round; never show the answer directly (exception: flashcards turn over to the answer by design) | Real practice, not memorizing positions |

**Required tests for each activity:** editor validation (`parse`), game logic, and `deserialize` of stored/shared data (Vitest in `tests/unit/`), plus one smoke test in `tests/e2e/` that plays one item. Add the new game to `GAMES` in `tests/e2e/restart.spec.ts` (continue/restart on the start screen). `npm run test:coverage` prints the coverage report (CI uploads it as `coverage-report`); Choose Word's `parse.ts` and `round.ts` must stay at 95% or more.

**Release:** bump the version in `package.json` (new activity or feature = minor, e.g. 1.0.0 → 1.1.0; fixes = patch), then run the "Manual checks on real phones" list in `README.md`.

## Scrambled Words (מילים מבולגנות) — decisions

| Rule | Why |
|---|---|
| Any number of words from 1 to 20, one per line; 21+ blocked | The parent decides the list size; the cap keeps share links short and guards against pasting a whole text |
| Progress dots for up to 10 words; above that a "4 / 20" counter | Dots for many words don't fit next to the buttons on a small phone |
| Up to 10 letters per word; a word whose letters are all identical is rejected | Tile size; it can't be scrambled |
| One tile = letter + all its marks (niqqud, dagesh, shin/sin dot, geresh) | Niqqud belongs to its letter |
| Tiles never in the correct order, and never the reversed word when another order exists | Reversed is an easy giveaway in RTL |
| Tap places the tile in the next slot; dropping a dragged tile anywhere outside the tray does the same; dropping it back on the tray cancels | One way of placing is clearer for young kids; dropping back lets the kid change their mind |
| Each letter is checked immediately; correct locks, wrong returns to the tray after 0.55 s (0.3 s with reduce motion); taps during that moment are ignored | The owner's choice: instant feedback |
| Identical-looking letters are interchangeable | Fair to the kid |
| Points per word: 0 mistakes = 10, 1–2 = 7, 3+ = 5 | Reward accuracy without punishing; chosen over hints |
| No hint, no skip button, no timer, no extra letters (extra letters are the Confusing Letters activity) | Kept simple; a kid can't get stuck with per-letter feedback |
| After a correct word: say it again, then the next word after 1.6 s (or when the repeat ends; tap skips the wait); skipping or leaving cancels the repeat. The הגדרות time never applies here | Reinforces the spelling; an old word must never play over the next one |
| Answer slots in one row (shrink to fit); letter tray wraps at 5 per row | Slots aren't tapped; tray tiles must stay big |

## Confusing Letters (אותיות מבלבלות) — decisions

Same game and rules as Scrambled Words (shared engine), except:

| Rule | Why |
|---|---|
| Separate list in its own edit section; each line = the word, then its confusing letters, separated by spaces, commas, periods, `\|`, `;`, `/`, `-` or the maqaf | The parent chooses the confusions per word; any separator a parent might type works |
| Confusing letters shown exactly as typed (niqqud only if typed) | The parent controls the content |
| No limit on confusing letters per word; word + confusing letters ≤ 15 tiles per line, else an error and no saving | The owner's choice; 15 = 3 rows of 5 big tiles on a 360px phone |
| A confusing letter already in the word (same base letter: niqqud ignored, final = regular, שׁ ≠ שׂ but a plain ש equals both, ג ≠ ג׳) or repeated is dropped with a warning | Two identical-looking tiles where only one is right is unfair |
| One letter per token ("קצ" is an error); a niqqud mark alone is an error | Typos must be visible, not silently guessed |
| Preview "מה הילד יראה" with the count (e.g. 7/15) under valid content | The parent sees the tray before saving |
| Wrong tile: the same orange shake + "כמעט! נסו שוב"; then that letter is dimmed (diagonal line, readable text, `aria-disabled`) only for the current slot — every identical-looking tile dims together, and a dimmed tap isn't a mistake | No new symbols or spoken messages to learn; dimming stops repeated guessing without giving the answer away for later slots |
| After the word: if a confusing letter was tried, a card shows the right letter (✓) next to the confusing one crossed out, no text; each confusing letter once, at most 3 pairs | Shows the contrast that's the point of the activity, for kids who can't read yet; 3 pairs fit in one row |
| A popup with a letter pair (or a word pair in Choose Word) stays the time set in הגדרות (1.5 / 3 / 5 / 8 s, default 3), or until the word is said again if that's later; also with reduce motion; a tap still skips; without a pair it's the normal 1.6 s | The kid needs time to look at the pair; nothing else gets slower |
| The right letter is the word letter that sounds alike (groups א/ע/ה, ס/שׂ/צ, כ/ק/ח, ת/ט, ב/ו in `round.ts`), otherwise the letter that was needed | צ tried in כַּעַס must be shown next to ס, not next to כַּ |
| Points 10 / 7 / 5 as in Scrambled Words | One scoring system |
| Tiles at most 54px and a 104px speaker button in this game only (Scrambled Words: tiles up to 64px, 132px speaker) | 15 tiles and the contrast card must fit on a 360×640 screen without scrolling |
| Saved progress is keyed by the full lines (word + letters) | Changing a word's letters starts a fresh round |
| Home card tiles ס / צ | Shows what the activity is about |

## Choose Word (בחרו את המילה) — decisions

A different kind of game (not letter tiles): its own pure logic (`round.ts`) and view, reusing `progress.ts`, scoring, sounds and speech.

| Rule | Why |
|---|---|
| Each line = the correct word first (rightmost), then 1–3 wrong words, same separators as Confusing Letters; 0 or 4+ wrong words is an error | The parent chooses the confusions; the kid chooses between 2 and 4 words |
| One wrong word (2 options) is allowed with a warning — an accepted exception to "never show the answer directly", since after one mistake only the answer is left | The owner's choice: some words have only one real confusion |
| All words shown exactly as typed, niqqud included; a warning when only some words of a line have niqqud | The parent controls the content; mixed niqqud gives the answer away |
| A wrong word identical to the correct one (after `normalizeText`) or repeated is dropped with a warning; words differing only by niqqud are allowed | Two identical options where only one is right is unfair; vowel practice is useful |
| Up to 20 lines and 10 letters per word; one-letter words are fine (nothing is scrambled) | Same limits as the other activities; long words still fit one full-width button |
| Options in random order, never reshuffled after a mistake | Real practice; the kid can find the words they already tried |
| 2 columns (an odd last option centred, same width); 1 full-width column when any option has more than 7 letters (`TWO_COLUMN_MAX_LETTERS`) | Big buttons; long words with niqqud stay readable instead of shrinking |
| Wrong word: orange shake + "כמעט! נסו שוב", then dimmed (diagonal line, `aria-disabled`, "נוסתה" in its label); a dimmed tap isn't a mistake | Same signals as Confusing Letters |
| Option labels "אפשרות N: <word>" | Text-to-speech reads look-alike spellings the same; the number tells them apart |
| After the word: if a wrong word was tried, the correct word (✓) above the tried ones crossed out, no text, for the הגדרות time; otherwise "כל הכבוד!" for 1.6 s. With long words (one column) the card replaces the options while it shows | Shows the contrast, like the letter pair; long words and the card don't both fit 360×640 |
| Points 10 / 7 / 5 as in the other games (3+ mistakes only possible with 4 options) | One scoring system |
| 104px speaker button (compact, as Confusing Letters); option text 28px in two columns (7 wide letters fit), 32px in one | No scrolling or cut-off words on a small phone |
| Saved progress is keyed by the full lines (word + wrong words) | Changing a line starts a fresh round |
| Home card tiles כַּעַס / קַעַס | Shows what the activity is about |

## How do you say? (איך אומרים?) — decisions

Flashcards for words in another language. A different kind of game: its own pure logic (`round.ts`, with its own progress that adds the repeated cards) and view, reusing `progress.ts` (order and fingerprint), `text.ts`, sounds, speech and the start screen.

| Rule | Why |
|---|---|
| One activity for every foreign language (`id: flashcards`); title "איך אומרים?", home card tiles אבא / ? | Arabic now, English later; a fixed foreign tile would mislead when the list is in the other language |
| Each line: Hebrew `\|` the foreign word in its own letters `\|` its reading in Hebrew letters (optional). Only `\|` separates; `/`, `-` and the maqaf belong to words. Up to 20 lines, 20 characters per part (spaces and a note in parentheses count, marks don't) | The voice needs the real spelling; the kid reads Hebrew letters; "ילד קטן / תינוק" must stay one part |
| The foreign word's letters decide the voice: Arabic letters → Arabic, Latin letters → English. Hebrew letters, both scripts, or no letters there are errors | No setting for the parent. Known limit: another Latin-script language (e.g. French) needs a language tag in the data and a `dataVersion` bump, not a new guess |
| Back of the card: the reading in Hebrew letters when given, else the foreign word itself. English under its reading is also shown small; Arabic script never is when a reading exists | The owner's choice: young kids can't read Arabic letters; older kids benefit from seeing English spelling |
| Front: the Hebrew word (spoken in Hebrew), a note in parentheses shown smaller and not spoken, and "איך אומרים ב<שפה>?" | Voice before text; with mixed lists the kid must know which language is asked |
| Tapping the front turns the card (CSS animation only — never wait for `transitionend`, which reduce motion never fires) and speaks the foreign word; tapping the back says it again, never turns back | Instant with reduce motion; no endless flipping |
| Then "ידעתי ✓" (green) or "עוד לא ↻" (neutral, never orange — it isn't a mistake), both 64px | Self-check; the colors keep their meaning across games |
| Every first-pass card gives 5 points whatever the answer; "עוד לא" cards come back once at the end for 0 points | Points must never reward saying "ידעתי"; repeats must not double the points |
| No voice for the language on this device: no speaker button on the back and a line on the start screen | The kid often plays on another phone than the one the words were typed on |
| Saved progress is keyed by the full lines | Changing a card starts a fresh round |
| Progress dots only when every card repeated would still fit (5 cards or fewer, `order.length × 2 ≤ MAX_DOTS`), else the "4 / 20" counter; the home bar counts the repeated cards | The indicator never switches in the middle of a round; the bar is full only when the round is |
| After "ידעתי" the next Hebrew word waits 0.45 s (`NEXT_WORD_PAUSE_MS`) | The "correct" sound and the word don't play over each other |

## Not done on purpose (possible later)

"Check at the end" mode for older kids, a quiz mode for flashcards (hear the foreign word, choose the Hebrew meaning), languages other than Arabic and English, parental gate/PIN, hints, skip button, parent voice recordings, timer, distractor letters in Scrambled Words, update prompt, spoken instructions for non-readers, phone vibration, bundling fonts in the project (now loaded from Google Fonts; the service worker caches them on install, best effort).
