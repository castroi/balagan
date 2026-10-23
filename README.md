# Balagan (בלגן) — Hebrew writing practice

A small website for practising Hebrew spelling at home. A parent pastes the week's content; the kid plays on a phone. No server and no database — everything is saved on the device, and content moves between devices with a share link.

First assignment type: **Scrambled Words** (מילים מבולגנות). The word is spoken, the letters are scrambled, and the kid puts them back in order.

## Run it on your computer

Requires Node.js 22 (the same version CI and Vercel use).

```bash
npm install
npm run dev        # opens a local site with live reload
npm test           # unit tests
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
  core/        Hebrew text handling, shuffle, scoring (pure logic)
  platform/    storage, share links, text-to-speech, sounds, version
  plugins/     assignment types — one folder per type
    registry.ts            list of all types
    scrambled-words/       parse + validation, game logic, game screen
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
- [ ] iPhone with the silent switch on: do sounds and speech still play?
- [ ] Niqqud renders correctly on the tiles, including small tiles in 10-letter words.
- [ ] Tap and drag both work; the page doesn't scroll while dragging.
- [ ] Share link opened from WhatsApp loads the words.
- [ ] Installed to the home screen: paste the share link into "קיבלתם קישור?" on the edit screen and the words load into the installed app.
- [ ] Close the app mid-round and reopen: it continues from the same word, with no extra points.
- [ ] Airplane mode after one online visit: the app still opens, with the Hebrew fonts. On iPhone, that visit must be made from the installed home-screen app (it has its own storage).
