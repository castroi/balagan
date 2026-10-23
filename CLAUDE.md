# Balagan (בלגן) — project rules

Hebrew writing practice for one kid (up to age 10) on a phone. A parent pastes the week's content; the kid plays. Static site on Vercel, no server, no database.

Each rule has a one-line **why**. Don't change a rule without understanding its reason; if a rule must change, update this file in the same change.

## Git workflow

- **Every change gets its own branch** from `main`, named `<type>/<short-description>` (types: `feat`, `fix`, `chore`, `docs`, `test`). Why: `main` is what Vercel deploys to the kid.
- **Never commit directly to `main`.** Push the branch and open a pull request. Why: CI and a Vercel preview run on the branch before anything goes live.
- **Only the owner merges**, after CI is green and the preview has been checked on a phone when the change is visible. Why: the owner decides what reaches the kid.
- Small, focused commits with a clear message saying what changed and why.
- Run `npm run typecheck`, `npm test` and, for UI changes, `npm run test:e2e` before pushing.
- Commit `package-lock.json` with every dependency change; CI uses `npm ci`. Why: the same tool versions everywhere, so a tool release can't break the build. If `npm install` can't run locally, use the "Update lockfile" workflow in the Actions tab.

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
| Interface in Hebrew, right to left | It's for the kid |
| Version only on the edit screen, set in `package.json` | Not distracting during play; one place to change it |
| No PIN; Clear asks to confirm and offers undo | Simple for the parent, safe from accidental taps |
| Device text-to-speech only; no recordings in v1 | Recordings can't travel in a link |
| Voice-test buttons and a "no Hebrew voice" warning on the edit screen | Voice quality varies by phone |
| Practice only — nothing is sent anywhere | No accounts, no tracking |
| Data saved by a newer app version makes the app read-only (no save, import, Clear or points — not even in memory); it says to refresh | An old cached version opened offline must not wipe the week's words or show content that isn't saved |
| Messages (toasts) belong to their screen and disappear when the screen changes | An Undo shown on another screen would act on the wrong thing |

## Design rules (every activity)

| Rule | Why |
|---|---|
| Reuse the tokens in `src/styles.css` (colors, Rubik for UI, Noto Sans Hebrew for letters, yellow tiles with dark border) | One consistent, calm look |
| Touch targets at least 44px; letter tiles bigger | Kids' fingers are less precise (Apple's minimum is 44pt) |
| Icons and voice before text | Younger kids may not read well yet |
| Every game starts with a Start button | iPhone allows sound and speech only after a tap |
| Mistakes: orange + shake + soft sound, never red | A nudge, not a failure |
| Correct: green + ✓ icon + short sound | Color is never the only signal (color-blind kids) |
| No decoration that does nothing; no "coming soon" items | Distracts and frustrates kids |
| Respect "reduce motion" (already global in `styles.css`) | Accessibility |
| Confirmation dialogs start on the safe button; Escape cancels; the page behind is inert | A quick tap or Enter must not delete anything; focus can't wander behind the dialog |
| After a screen change, focus moves to the new screen's title | Keyboard and screen-reader users aren't left on an empty page |
| Screen-reader messages go through `announce()` (`src/ui/dialog.ts`), not new `aria-live` elements | Live regions recreated on every render aren't read aloud |
| Borders of empty slots and inputs use `--line` (at least 3:1 contrast) | Kids must see where letters go |
| Media "play" icon points right even in RTL | Media controls aren't mirrored |
| Save progress after each item; resume where the kid stopped | Kids close apps mid-game |

## Content and the share link

| Rule | Why |
|---|---|
| Store only compact source text (e.g. the word list), never computed state, audio or images | All content travels inside one link |
| Clean pasted text with `normalizeText` (`src/core/unicode.ts`) before validating or storing | The same word copied from different apps must produce identical characters |
| Every apostrophe (', ‘, ’) becomes the Hebrew geresh ׳; the editor allows at most 4 marks per letter, no repeated mark and one geresh | iPhone types curly apostrophes; repeated marks are pasting mistakes that bloat links |
| Saved and shared data is re-checked leniently (`deserialize` doesn't apply new editor-only rules) | Words saved before a rule existed must keep working |
| Error messages show invisible characters as a code point (e.g. `U+034F`) | The parent must be able to see what's wrong |
| Use content exactly as the parent typed it (niqqud, final letters) | The parent controls the content |
| Validate in the editor with clear Hebrew messages; block saving on errors | Bad content shouldn't reach the kid |
| Never change the link format without bumping `SHARE_FORMAT_VERSION` | Old links must fail with a friendly message, not break |
| Before releasing an activity, test a real link with a full week of content in WhatsApp | Messaging apps may cut long links |

## Adding a new activity

1. Create `src/plugins/<activity>/` and implement `AssignmentPlugin` (`src/plugins/types.ts`).
2. Register it in `PLUGINS` in `src/plugins/registry.ts`. The home screen, edit screen, saving, clearing and sharing pick it up automatically.
3. Follow `src/plugins/scrambled-words/` as the reference:
   - `parse.ts` — the editor's input format, validation and `deserialize`
   - `game-state.ts` — pure game logic, no DOM, so it can be unit-tested
   - `view.ts` — the game screen only
   - `index.ts` — the plugin object

| Rule | Why |
|---|---|
| Each activity has its own editor format and its own Save/Clear | Activities are independent; clearing one doesn't touch others |
| Never change an activity's `id` | It's the key in storage and in share links |
| Bump `dataVersion` when the data shape changes; `deserialize` keeps reading old versions | Saved data and old links keep working |
| Add points and save progress in one `ctx.commit(progress, points)` | Points are never counted twice after a reload |
| Words/items order random per round; never show the answer directly | Real practice, not memorizing positions |

**Required tests for each activity:** editor validation (`parse`), game logic, and `deserialize` of stored/shared data (Vitest in `tests/unit/`), plus one smoke test in `tests/e2e/` that plays one item.

**Release:** bump the version in `package.json` (new activity = minor, e.g. 1.0.0 → 1.1.0; fixes = patch), then run the "Manual checks on real phones" list in `README.md`.

## Scrambled Words (מילים מבולגנות) — decisions

| Rule | Why |
|---|---|
| Any number of words from 1 to 20, one per line; 21+ blocked | The parent decides the list size; the cap keeps share links short and guards against pasting a whole text |
| Progress dots for up to 10 words; above that a "4 / 20" counter | Dots for many words don't fit next to the buttons on a small phone |
| Up to 10 letters per word; a word whose letters are all identical is rejected | Tile size; it can't be scrambled |
| One tile = letter + all its marks (niqqud, dagesh, shin/sin dot, geresh) | Niqqud belongs to its letter |
| Tiles never in the correct order, and never the reversed word when another order exists | Reversed is an easy giveaway in RTL |
| Tap places the tile in the next slot; dropping a dragged tile anywhere outside the tray does the same; dropping it back on the tray cancels | One way of placing is clearer for young kids; dropping back lets the kid change their mind |
| Each letter is checked immediately; correct locks, wrong returns to the tray | The owner's choice: instant feedback |
| Identical-looking letters are interchangeable | Fair to the kid |
| Points per word: 0 mistakes = 10, 1–2 = 7, 3+ = 5 | Reward accuracy without punishing; chosen over hints |
| No hint, no skip button, no timer, no distractor letters | Kept simple; a kid can't get stuck with per-letter feedback |
| After a correct word: say it again, then the next word (tap skips the wait); skipping or leaving cancels the repeat | Reinforces the spelling; an old word must never play over the next one |
| Answer slots in one row (shrink to fit); letter tray wraps at 5 per row | Slots aren't tapped; tray tiles must stay big |

## Not done on purpose (possible later)

"Check at the end" mode for older kids, parental gate/PIN, hints, skip button, parent voice recordings, timer, distractor letters, update prompt, spoken instructions for non-readers, phone vibration, bundling fonts in the project (now loaded from Google Fonts; the service worker caches them on install, best effort).
