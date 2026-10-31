# Balagan (בלגן) — Hebrew writing practice

A small website for practising Hebrew spelling at home. A parent pastes the week's content; the kid plays on a phone. No server and no database — everything is saved on the device, and content moves between devices with a share link.

Assignment types:

- **Scrambled Words** (מילים מבולגנות): the word is spoken, the letters are scrambled, and the kid puts them back in order.
- **Confusing Letters** (אותיות מבלבלות): the same game, with letters that sound alike (ס/צ, ק/כ, א/ע/ה…) mixed into the tray. The parent writes each word followed by its confusing letters, e.g. `כַּעַס ק צ ה א`.
- **Choose Word** (בחרו את המילה): the word is spoken and the kid taps the correct spelling among 2–4 words. The parent writes the correct word first, then 1–3 wrong spellings, e.g. `כַּעַס קַעַס כַּאַס קַאַס`.
- **How do you say?** (איך אומרים?): flashcards for words in another language. The card shows a Hebrew word; a tap turns it over to the word in Arabic or English, spoken by that language's device voice. Then the kid answers "ידעתי" or "עוד לא"; "עוד לא" cards come back at the end. Each line: Hebrew `|` the word in its own letters `|` how to read it in Hebrew letters (optional), e.g. `דוד | خَال | חַ׳אל` or `ילד | child`.

On the edit screen, **הגדרות** sets how long the popup after a word stays when it shows a right/wrong pair — a letter pair in Confusing Letters or a word pair in Choose Word (1.5–8 seconds, default 3). Every other popup keeps its normal length. It's saved on that device only.

## Run it on your computer

Requires Node.js 22 (the same version CI and Vercel use).

```bash
npm install
npm run dev        # opens a local site with live reload
npm test           # unit tests
npm run test:coverage  # unit tests with a coverage report (coverage/index.html)
npm run test:e2e   # browser smoke tests (first time: npx playwright install chromium webkit)
npm run build      # type-check + tests + production build into dist/
```

Commit `package-lock.json` whenever dependencies change (CI uses `npm ci`). Without a local Node setup, run the **Update lockfile** workflow from the Actions tab on your branch.

**Project rules, decisions and the Git workflow (a branch and pull request for every change) are in [`CLAUDE.md`](CLAUDE.md).** Read it before adding a new activity.

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repository. Vercel detects Vite; keep the defaults.
3. Every merge to `main` deploys to the live site; every branch gets a preview link. The `build` script runs the type-check and the tests first, so a failing test stops the deploy.

GitHub Actions (`.github/workflows/ci.yml`) runs the checks on every pull request and on `main`. When a browser test fails, the test report is attached to the run as `playwright-report`.

## Version number

The version shown on the edit screen comes from `version` in `package.json`. Change it there when releasing (e.g. `1.0.0` → `1.1.0`).

## Project structure

```
src/
  core/        Hebrew text handling, foreign-language detection, shuffle, scoring (pure logic)
  platform/    storage, device settings, share links, text-to-speech (Hebrew, Arabic, English), sounds, version
  plugins/     assignment types — one folder per type
    registry.ts            list of all types
    shared/start-screen.ts the screen before a round, for every game: start, continue, or restart
    shared/letter-game/    letter-tile game shared by both types: round logic, progress, game screen
    scrambled-words/       parse + validation, plugin object (game-state.ts, view.ts, text.ts re-export the shared engine)
    confusing-letters/     parse + validation, editor preview, plugin object
    choose-word/           parse + validation, round logic, game screen, editor preview, plugin object
    flashcards/            "איך אומרים?": parse + validation, round logic (with repeats), card screen, preview, plugin object
  ui/          home screen, edit screen, dialogs
tests/unit/    unit tests (Vitest)
tests/e2e/     browser smoke tests on phone-sized screens (Playwright)
public/        icons, web app manifest
build/         offline service worker template + generator (dist/sw.js is built)
```

### Adding a new assignment type

1. Create `src/plugins/<new-type>/` with an object implementing `AssignmentPlugin` (`src/plugins/types.ts`): its editor text and validation, its data, and its game screen.
2. Add it to `PLUGINS` in `src/plugins/registry.ts`.

The home screen, edit screen, saving, clearing and share links pick it up automatically. Never change an existing type's `id`; bump its `dataVersion` if its data shape changes.

## Manual checks on real phones (before each release)

Automated tests can't cover these:

- [ ] iPhone and Android: the word is spoken in Hebrew, with acceptable pronunciation (use the voice-test buttons on the edit screen).
- [ ] iPhone and Android: "איך אומרים?" words are spoken by an Arabic voice and an English voice (voice-test buttons in that section). Without that voice: a warning on the edit screen, a line on the start screen, and no speaker on the card back.
- [ ] Arabic shows in the Arabic font, with readable harakat; niqqud on the Hebrew-letter readings renders correctly.
- [ ] iPhone with the silent switch on: do sounds and speech still play?
- [ ] Niqqud renders correctly on the tiles, including small tiles in 10-letter words.
- [ ] Confusing Letters with 15 tiles on the smallest phone you have: all tiles fit without scrolling and are easy to tap.
- [ ] Choose Word with 4 long words (8–10 letters with niqqud) on the smallest phone: one column, readable niqqud, no scrolling.
- [ ] Tap and drag both work; the page doesn't scroll while dragging.
- [ ] Edit screen → הגדרות: the time the letter pair stays after a word feels right for the kid.
- [ ] Share link with a full week of all four activities (20 words each, 4 options per Choose Word line, 30 three-part Arabic cards with harakat), sent and opened from WhatsApp, loads all four.
- [ ] Installed to the home screen: paste the share link into "קיבלתם קישור?" on the edit screen and the words load into the installed app.
- [ ] Close the app mid-round and reopen: it continues from the same word, with no extra points.
- [ ] In each game, mid-round: "מתחילים מהתחלה" on the start screen goes back to word 1 and keeps the total points; a quick tap on "ממשיכים" never hits it by mistake.
- [ ] Airplane mode after one online visit: the app still opens, with the Hebrew fonts. On iPhone, that visit must be made from the installed home-screen app (it has its own storage).
