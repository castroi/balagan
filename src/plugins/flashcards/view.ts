/**
 * The "איך אומרים?" game screen: a card shows one side (spoken); tapping it turns
 * it over to the other side (spoken in its language); then the kid answers
 * "ידעתי" or "עוד לא". The start screen switches the direction: Hebrew first
 * (the default) or the foreign word first.
 */
import { h, icon } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { announce } from '../../ui/dialog';
import { defaultRng } from '../../core/rng';
import { LANGUAGES, type ForeignLang } from '../../core/scripts';
import type { GameContext } from '../types';
import { startScreen } from '../shared/start-screen';
import { MAX_DOTS } from '../shared/letter-game/view';
import { wordCountLabel } from '../shared/letter-game/text';
import { cardLang, frontParts, type Card } from './parse';
import { answer, currentCard, newCardsProgress, roundLength, type CardsProgress } from './round';
import { activeRound, DIRECTIONS, readFlash, withRound, writeFlash, type Direction, type FlashState } from './direction';

type Phase = 'intro' | 'front' | 'back' | 'end';

/** After "ידעתי", the next word waits for the short "correct" sound. */
export const NEXT_WORD_PAUSE_MS = 450;

/** Above this many letters a side uses a smaller font, so 20 characters still fit the card. */
const LONG_TEXT = 10;

const letters = (text: string) => [...text.replace(/\p{M}/gu, '')].length;

/** What the Hebrew voice says for the front: the word without its note, "/" read as a pause. */
const hebrewSpeech = (main: string) => main.replace(/\s*\/\s*/g, ', ');

/** One side's text element, in its own language and direction. */
function sideText(text: string, cls: string, lang: 'he' | ForeignLang) {
  const dir = lang === 'he' ? 'rtl' : LANGUAGES[lang].dir;
  const long = letters(text) > LONG_TEXT ? ' long' : '';
  return h('span', { class: `${cls}${long}`, lang, dir }, text);
}

/** `keys` identify the content for saved progress (one per card); progress resets when they change. */
export function mountFlashcards(
  container: HTMLElement,
  cards: readonly Card[],
  keys: readonly string[],
  ctx: GameContext,
): () => void {
  let destroyed = false;
  let justTurned = false;
  /** Languages the device can't speak: their cards are shown silently, with no speaker button. */
  const silent = new Set<ForeignLang>();

  // Both directions' rounds and the last direction played; the current direction's round is `progress`.
  let state: FlashState = readFlash(ctx.loadProgress(), keys);
  let progress: CardsProgress = activeRound(state, keys, defaultRng);
  state = withRound(state, progress, keys, defaultRng);
  /** Saves both rounds and the direction, adding points in the same write. */
  const save = (points = 0) => ctx.commit(writeFlash(state, keys, defaultRng), points);
  save();
  let phase: Phase = 'intro';

  const reverse = () => state.dir === 'to-hebrew';
  /** True when the side on screen is the foreign word (spoken by the foreign voice). */
  const foreignShown = () => (phase === 'front' && reverse()) || (phase === 'back' && !reverse());
  const langs = [...new Set(cards.map(cardLang))];

  const root = h('div', { class: 'screen game compact flash' });
  container.appendChild(root);

  for (const lang of new Set(cards.map(cardLang))) {
    void ctx.speaker.canSpeak(lang).then((ok) => {
      if (ok || destroyed) return;
      silent.add(lang);
      // The voice list can arrive seconds later: on the start screen only add the line, so the
      // Start button (and its focus, or a tap in progress) stays where it is.
      if (phase === 'intro') {
        const stage = root.querySelector('.stage.center');
        stage?.querySelector('.flash-notes')?.remove();
        const notes = voiceNotes();
        if (notes) stage?.appendChild(notes);
      }
      else if (foreignShown()) render();
    });
  }

  /** Pending speech of the next card's word, waiting for the "correct" sound to end. */
  let nextWordTimer: number | null = null;
  const cancelNextWord = () => {
    if (nextWordTimer !== null) window.clearTimeout(nextWordTimer);
    nextWordTimer = null;
  };

  const card = (): Card => cards[currentCard(progress)];

  // ---------- actions ----------

  function speakSide() {
    if (phase !== 'front' && phase !== 'back') return;
    const c = card();
    if (!foreignShown()) void ctx.speaker.speak(hebrewSpeech(frontParts(c[0]).main));
    else if (!silent.has(cardLang(c))) void ctx.speaker.speak(c[1], cardLang(c));
  }

  /** The speaker, or the card when this side has no voice (no speaker button). */
  const focusSpeaker = () =>
    (root.querySelector<HTMLElement>('.speaker-btn') ?? root.querySelector<HTMLElement>('.flash-card'))?.focus({
      preventScroll: true,
    });

  function start() {
    ctx.sounds.unlock();
    phase = 'front';
    render();
    focusSpeaker();
    speakSide();
  }

  function onCard() {
    cancelNextWord();
    if (phase === 'front') {
      phase = 'back';
      justTurned = true;
      // Screen readers hear the back through the card's label when it gets focus; no extra announce.
      render();
    }
    // On the back, a tap says the word again (it never turns back: no endless flipping).
    speakSide();
  }

  function onAnswer(knew: boolean) {
    if (phase !== 'back') return;
    const result = answer(progress, knew);
    progress = result.progress;
    state = withRound(state, progress, keys, defaultRng);
    save(result.points);
    ctx.speaker.cancel();
    if (knew) ctx.sounds.play('correct');
    if (progress.done) {
      phase = 'end';
      render();
      return;
    }
    phase = 'front';
    render();
    root.querySelector<HTMLElement>('.flash-card')?.focus({ preventScroll: true });
    // Let the short "correct" sound finish first, so it doesn't muddy the next word.
    nextWordTimer = window.setTimeout(() => {
      nextWordTimer = null;
      if (!destroyed && phase === 'front') speakSide();
    }, knew ? NEXT_WORD_PAUSE_MS : 0);
  }

  /** A new round (new order, round points 0; the total is kept): "לשחק שוב" at the end, or restart on the start screen. */
  function playAgain() {
    cancelNextWord();
    ctx.sounds.unlock();
    progress = newCardsProgress(keys, defaultRng);
    state = withRound(state, progress, keys, defaultRng);
    save();
    phase = 'front';
    render();
    focusSpeaker();
    speakSide();
  }

  function restart() {
    announce('מתחילים מהתחלה');
    playAgain();
  }

  /** The start screen's switch: each direction keeps its own round; the choice is saved for next time. */
  function setDirection(dir: Direction) {
    ctx.sounds.unlock();
    if (dir !== state.dir && !ctx.readOnly) {
      state = { ...state, dir };
      progress = activeRound(state, keys, defaultRng);
      state = withRound(state, progress, keys, defaultRng);
      save();
      render();
      root.querySelector<HTMLElement>(`.flash-dir[data-dir="${dir}"]`)?.focus({ preventScroll: true });
    }
    void ctx.speaker.speak(directionSpeech(dir));
  }

  /** "מעברית לערבית" / "מערבית לעברית"; with mixed languages just "מעברית" / "לעברית". */
  function directionSpeech(dir: Direction) {
    const name = langs.length === 1 ? LANGUAGES[langs[0]].name : null;
    if (dir === 'to-foreign') return name ? `מעברית ל${name}` : 'מעברית';
    return name ? `מ${name} לעברית` : 'לעברית';
  }

  // ---------- rendering ----------

  function progressIndicator() {
    const total = roundLength(progress);
    const current = Math.min(progress.index + 1, total);
    const label = `מילה ${current} מתוך ${total}`;
    // Decided by the most the round can grow to (every card repeated), so it never switches mid-round.
    if (progress.order.length * 2 > MAX_DOTS) {
      return h('div', { class: 'counter', role: 'img', 'aria-label': label, dir: 'ltr' }, `${current} / ${total}`);
    }
    const dots = h('div', { class: 'dots', role: 'img', 'aria-label': label });
    for (let i = 0; i < total; i++) {
      const cls = i < progress.index ? 'dot done' : i === progress.index && phase !== 'end' ? 'dot current' : 'dot';
      dots.appendChild(h('span', { class: cls }));
    }
    return dots;
  }

  function topBar() {
    return h(
      'header',
      { class: 'topbar' },
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה לבית', onclick: () => ctx.exit() },
        icon(ICONS.home),
      ),
      progressIndicator(),
      h('div', { class: 'points-chip' }, icon(ICONS.star, 'icon star'), h('span', {}, String(ctx.totalPoints()))),
    );
  }

  function speakerButton() {
    // No voice for this language on the device: no button that does nothing.
    const hidden = foreignShown() && silent.has(cardLang(card()));
    return h(
      'div',
      { class: 'speaker-wrap' },
      hidden
        ? null
        : h(
            'button',
            { class: 'speaker-btn', type: 'button', 'aria-label': 'לשמוע את המילה', onclick: speakSide },
            icon(ICONS.speaker, 'icon speaker-icon'),
          ),
      hidden ? null : h('span', { class: 'speaker-label' }, 'לשמוע שוב'),
    );
  }

  function cardFace() {
    const [he, word, read] = card();
    const lang = cardLang(card());
    const { main, hint } = frontParts(he);
    const langName = LANGUAGES[lang].name;
    // The foreign side as the kid sees it: the reading in Hebrew letters when given, else the word itself.
    const shown = read ?? word;
    const shownLang = read === undefined ? lang : 'he';
    // English under its Hebrew-letter reading: older kids see the spelling. Arabic script isn't shown then.
    const spelling = read !== undefined && lang === 'en' ? sideText(word, 'flash-sub', 'en') : null;
    const canHear = !silent.has(lang) || !foreignShown();
    if (phase === 'front') {
      const prompt = reverse() ? 'מה זה בעברית?' : `איך אומרים ב${langName}?`;
      return h(
        'button',
        {
          class: 'flash-card',
          type: 'button',
          'aria-label': reverse()
            ? `${shown}. ${prompt} לחצו כדי להפוך`
            : `${main}${hint ? ` (${hint})` : ''}. ${prompt} לחצו כדי להפוך`,
        },
        ...(reverse()
          ? [sideText(shown, 'flash-main', shownLang), spelling]
          : [sideText(main, 'flash-main', 'he'), hint ? sideText(hint, 'flash-hint', 'he') : null]),
        h('span', { class: 'flash-lang' }, prompt),
      );
    }
    const again = canHear ? '. לחצו כדי לשמוע שוב' : '';
    const btn = h(
      'button',
      {
        class: `flash-card back${justTurned ? ' turn' : ''}`,
        type: 'button',
        'aria-label': reverse()
          ? `${main}${hint ? ` (${hint})` : ''}. ${shown} בעברית${again}`
          : `${shown}. ${main} ב${langName}${again}`,
      },
      // The side the kid started from stays small on top, so the pair is seen together.
      ...(reverse()
        ? [
            sideText(shown, 'flash-top', shownLang),
            sideText(main, 'flash-main', 'he'),
            hint ? sideText(hint, 'flash-hint', 'he') : null,
          ]
        : [sideText(main, 'flash-top', 'he'), sideText(shown, 'flash-main', shownLang), spelling]),
    );
    justTurned = false;
    return btn;
  }

  function actions() {
    if (phase !== 'back') {
      return h('div', { class: 'flash-actions' }, h('p', { class: 'flash-tip' }, 'אמרו בקול, ואז הפכו את הכרטיס'));
    }
    return h(
      'div',
      { class: 'flash-actions' },
      h(
        'button',
        { class: 'btn flash-knew', type: 'button', onclick: () => onAnswer(true) },
        icon(ICONS.check),
        h('span', {}, 'ידעתי'),
      ),
      h(
        'button',
        { class: 'btn flash-again', type: 'button', onclick: () => onAnswer(false) },
        icon(ICONS.again),
        h('span', {}, 'עוד לא'),
      ),
    );
  }

  function introView() {
    const view = startScreen({
      index: progress.index,
      total: roundLength(progress),
      onStart: start,
      onRestart: restart,
    });
    // The direction switch sits above the Start button; "התחלה" / "ממשיכים" belong to the chosen direction.
    view.prepend(directionSwitch());
    const notes = voiceNotes();
    if (notes) view.appendChild(notes);
    return view;
  }

  /**
   * The kid may play on another phone than the one the words were typed on: missing voices are
   * said on the start screen too, in one compact block (it must fit next to everything else).
   */
  function voiceNotes() {
    if (silent.size === 0) return null;
    const names = langs.filter((l) => silent.has(l)).map((l) => LANGUAGES[l].name);
    const unreadable = unreadableNote();
    return h(
      'div',
      { class: 'flash-notes' },
      h('p', { class: 'muted flash-novoice' }, `אין קול ב${names.join(' וב')} במכשיר הזה`),
      unreadable,
    );
  }

  /**
   * Foreign word first, on a phone without that voice: a card with no reading in Hebrew letters
   * shows only the foreign script, silently — a young kid can't read it. Say so on the start screen.
   */
  function unreadableNote() {
    if (!reverse()) return null;
    const count = cards.filter((c) => c[2] === undefined && silent.has(cardLang(c))).length;
    if (count === 0) return null;
    return h(
      'p',
      { class: 'muted flash-novoice', 'data-unreadable': count },
      count === 1 ? 'בכיוון הזה מילה אחת בלי קול ובלי קריאה בעברית' : `בכיוון הזה ${count} מילים בלי קול ובלי קריאה בעברית`,
    );
  }

  /** Two buttons that work as a switch: a picture (א ← ? / ? ← א) before the short label, spoken when tapped. */
  function directionSwitch() {
    return h(
      'div',
      { class: 'flash-dirs', role: 'group', 'aria-label': 'כיוון' },
      ...DIRECTIONS.map((dir) => {
        const done = state.finished.includes(dir);
        const pressed = dir === state.dir;
        const tiles = dir === 'to-foreign' ? ['א', '?'] : ['?', 'א'];
        return h(
          'button',
          {
            class: `flash-dir${pressed ? ' on' : ''}`,
            type: 'button',
            'data-dir': dir,
            'aria-pressed': String(pressed),
            'aria-label': `${directionSpeech(dir)}${done ? ', הושלם' : ''}`,
            disabled: ctx.readOnly && !pressed,
            onclick: () => setDirection(dir),
          },
          h(
            'span',
            { class: 'flash-dir-pic', 'aria-hidden': 'true' },
            h('span', { class: 'mini-tile' }, tiles[0]),
            h('span', { class: 'flash-dir-arrow' }, '←'),
            h('span', { class: 'mini-tile' }, tiles[1]),
          ),
          h('span', { class: 'flash-dir-label' }, dir === 'to-foreign' ? 'מעברית' : 'לעברית'),
          done ? h('span', { class: 'check-badge' }, icon(ICONS.check)) : null,
        );
      }),
    );
  }

  function endView() {
    return h(
      'div',
      { class: 'stage center end' },
      icon(ICONS.star, 'icon end-star'),
      h('h1', { class: 'title', tabindex: -1 }, 'כל הכבוד!'),
      h('p', { class: 'muted big' }, cards.length === 1 ? 'עברת על המילה' : `עברת על כל ${wordCountLabel(cards.length)}`),
      h(
        'div',
        { class: 'points-chip large' },
        icon(ICONS.star, 'icon star'),
        h('span', {}, `${progress.roundPoints} נקודות`),
      ),
      h(
        'div',
        { class: 'end-actions' },
        h(
          'button',
          { class: 'btn btn-primary btn-big', type: 'button', onclick: playAgain },
          icon(ICONS.again),
          h('span', {}, 'לשחק שוב'),
        ),
        h(
          'button',
          { class: 'btn btn-big', type: 'button', onclick: () => ctx.exit() },
          icon(ICONS.home),
          h('span', {}, 'חזרה לבית'),
        ),
      ),
    );
  }

  function render() {
    if (destroyed) return;
    // Re-rendering replaces the buttons; keep keyboard focus on the card (or the speaker) when it was there.
    const active = document.activeElement;
    const hadFocus = root.contains(active);
    const onSpeaker = hadFocus && active instanceof HTMLElement && active.classList.contains('speaker-btn');
    root.replaceChildren(topBar());
    if (phase === 'intro') {
      root.appendChild(introView());
      return;
    }
    if (phase === 'end') {
      root.appendChild(endView());
      root.querySelector<HTMLElement>('.end .title')?.focus({ preventScroll: true });
      return;
    }
    const face = cardFace();
    face.addEventListener('click', onCard);
    root.appendChild(h('div', { class: 'stage flash-stage' }, speakerButton(), face, actions()));
    if (hadFocus) {
      const speaker = onSpeaker ? root.querySelector<HTMLElement>('.speaker-btn') : null;
      (speaker ?? face).focus({ preventScroll: true });
    }
  }

  render();

  return () => {
    destroyed = true;
    cancelNextWord();
    ctx.speaker.cancel();
    root.remove();
  };
}

