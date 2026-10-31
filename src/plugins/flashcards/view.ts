/**
 * The "איך אומרים?" game screen: a card shows a Hebrew word (spoken in Hebrew);
 * tapping it turns it over to the word in the other language (spoken in that
 * language); then the kid answers "ידעתי" or "עוד לא".
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
import {
  answer,
  currentCard,
  isValidCardsProgress,
  newCardsProgress,
  roundLength,
  type CardsProgress,
} from './round';

type Phase = 'intro' | 'front' | 'back' | 'end';

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

  const saved = ctx.loadProgress();
  let progress: CardsProgress =
    isValidCardsProgress(saved, keys) && !saved.done ? saved : newCardsProgress(keys, defaultRng);
  if (progress !== saved) ctx.commit(progress);
  let phase: Phase = 'intro';

  const root = h('div', { class: 'screen game compact flash' });
  container.appendChild(root);

  for (const lang of new Set(cards.map(cardLang))) {
    void ctx.speaker.canSpeak(lang).then((ok) => {
      if (ok || destroyed) return;
      silent.add(lang);
      if (phase === 'intro' || phase === 'back') render();
    });
  }

  const card = (): Card => cards[currentCard(progress)];

  // ---------- actions ----------

  function speakSide() {
    const c = card();
    if (phase === 'front') {
      void ctx.speaker.speak(hebrewSpeech(frontParts(c[0]).main));
    } else if (phase === 'back' && !silent.has(cardLang(c))) {
      void ctx.speaker.speak(c[1], cardLang(c));
    }
  }

  const focusSpeaker = () => root.querySelector<HTMLElement>('.speaker-btn')?.focus({ preventScroll: true });

  function start() {
    ctx.sounds.unlock();
    phase = 'front';
    render();
    focusSpeaker();
    speakSide();
  }

  function onCard() {
    if (phase === 'front') {
      phase = 'back';
      justTurned = true;
      render();
      const c = card();
      announce(c[2] ?? c[1]);
    }
    // On the back, a tap says the word again (it never turns back: no endless flipping).
    speakSide();
  }

  function onAnswer(knew: boolean) {
    if (phase !== 'back') return;
    const result = answer(progress, knew);
    progress = result.progress;
    ctx.commit(progress, result.points);
    if (knew) ctx.sounds.play('correct');
    if (progress.done) {
      phase = 'end';
      ctx.speaker.cancel();
      render();
      return;
    }
    phase = 'front';
    render();
    root.querySelector<HTMLElement>('.flash-card')?.focus({ preventScroll: true });
    speakSide();
  }

  /** A new round (new order, round points 0; the total is kept): "לשחק שוב" at the end, or restart on the start screen. */
  function playAgain() {
    ctx.sounds.unlock();
    progress = newCardsProgress(keys, defaultRng);
    ctx.commit(progress);
    phase = 'front';
    render();
    focusSpeaker();
    speakSide();
  }

  function restart() {
    announce('מתחילים מהתחלה');
    playAgain();
  }

  // ---------- rendering ----------

  function progressIndicator() {
    const total = roundLength(progress);
    const current = Math.min(progress.index + 1, total);
    const label = `מילה ${current} מתוך ${total}`;
    if (total > MAX_DOTS) {
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
    const hidden = phase === 'back' && silent.has(cardLang(card()));
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
    if (phase === 'front') {
      return h(
        'button',
        {
          class: 'flash-card',
          type: 'button',
          'aria-label': `${main}${hint ? ` (${hint})` : ''}. איך אומרים ב${langName}? לחצו כדי להפוך`,
        },
        sideText(main, 'flash-main', 'he'),
        hint ? sideText(hint, 'flash-hint', 'he') : null,
        h('span', { class: 'flash-lang' }, `איך אומרים ב${langName}?`),
      );
    }
    const shown = read ?? word;
    const btn = h(
      'button',
      {
        class: `flash-card back${justTurned ? ' turn' : ''}`,
        type: 'button',
        'aria-label': `${shown}. ${main} ב${langName}${silent.has(lang) ? '' : '. לחצו כדי לשמוע שוב'}`,
      },
      sideText(main, 'flash-top', 'he'),
      sideText(shown, 'flash-main', read === undefined ? lang : 'he'),
      // English under its Hebrew-letter reading: older kids see the spelling. Arabic script isn't shown then.
      read !== undefined && lang === 'en' ? sideText(word, 'flash-sub', 'en') : null,
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
    // The kid may play on another phone than the one the words were typed on: say it here too.
    for (const lang of silent) {
      view.appendChild(h('p', { class: 'muted flash-novoice' }, `אין קול ב${LANGUAGES[lang].name} במכשיר הזה`));
    }
    return view;
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
    ctx.speaker.cancel();
    root.remove();
  };
}

