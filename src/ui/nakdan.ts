import { fetchNakdan, nakdanText, NAKDAN_NAME, parseNakdanInput, type NakdanWord } from '../platform/nakdan';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { announce, toast } from './dialog';

/**
 * "הוספת ניקוד" on the edit screen: the parent types plain words, Dicta
 * suggests niqqud, the parent picks one option per word and copies the result
 * into an activity. Nothing here is saved; the words are sent only on a tap.
 */
export function nakdanSection(): HTMLElement {
  const inputId = 'nakdan-input';
  const hintId = 'nakdan-hint';
  const textarea = h('textarea', {
    id: inputId,
    class: 'words-input',
    rows: 6,
    dir: 'rtl',
    placeholder: 'עדיין\nעכשיו\nלפעמים',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-describedby': hintId,
  });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const info = h('div', { class: 'share-fallback' });
  const label = h('span', {}, 'ניקוד');
  const button = h('button', { class: 'btn btn-wide', type: 'button', onclick: () => void onTap() }, label);

  let busy = false;
  // The last answer, kept while the words stay the same: reopening doesn't ask Dicta again.
  let cache: { key: string; results: NakdanWord[]; chosen: number[] } | null = null;

  function update() {
    feedback.replaceChildren();
    if (!busy) {
      info.replaceChildren();
      label.textContent = 'ניקוד';
    }
    const empty = textarea.value.trim() === '';
    const { errors } = parseNakdanInput(textarea.value);
    if (!empty) for (const e of errors) feedback.appendChild(h('p', { class: 'msg error' }, e));
    button.disabled = empty || errors.length > 0;
  }

  function fail(message: string) {
    busy = false;
    button.removeAttribute('aria-disabled');
    label.textContent = 'לנסות שוב';
    info.replaceChildren(h('p', { class: 'msg warning' }, message));
    announce(message);
  }

  async function onTap() {
    if (busy) return;
    const { words } = parseNakdanInput(textarea.value);
    if (!words || words.length === 0) return;
    const key = words.join('\n');
    if (cache?.key === key) {
      openSheet(cache.results, cache.chosen, button);
      return;
    }
    info.replaceChildren();
    if (!navigator.onLine) {
      fail('אין חיבור לאינטרנט — הניקוד צריך רשת.');
      return;
    }
    busy = true;
    label.textContent = 'מנקדים…';
    button.setAttribute('aria-disabled', 'true');
    announce('מנקדים…');
    try {
      const results = await fetchNakdan(words);
      // The parent left the edit screen while waiting: its messages belong to that screen.
      if (!button.isConnected) return;
      busy = false;
      button.removeAttribute('aria-disabled');
      label.textContent = 'ניקוד';
      cache = { key, results, chosen: results.map(() => 0) };
      // The words were changed while waiting: these results belong to the old ones.
      if (parseNakdanInput(textarea.value).words?.join('\n') !== key) return;
      openSheet(cache.results, cache.chosen, button);
    } catch {
      if (!button.isConnected) return;
      fail('הניקוד לא הצליח כרגע. אפשר לנסות שוב.');
    }
  }

  textarea.addEventListener('input', update);
  update();

  return h(
    'section',
    { class: 'panel', 'data-section': 'nakdan' },
    h('label', { class: 'panel-title', for: inputId }, 'הוספת ניקוד'),
    h('p', { class: 'muted', id: hintId }, 'מילה אחת בכל שורה, בלי ניקוד. אחרי הבחירה מעתיקים ומדביקים בתיבה של המשחק.'),
    textarea,
    feedback,
    h('p', { class: 'muted' }, `בלחיצה, המילים נשלחות לשירות הניקוד של ${NAKDAN_NAME}. שום דבר אחר לא נשלח.`),
    button,
    info,
  );
}

let sheetCount = 0;

/** Two options per row fit at 36px on a 360px phone up to this many letters (with the ✓). */
export const NK_TWO_COLUMN_MAX_LETTERS = 5;
const letterCount = (text: string) => (text.match(/[\u05D0-\u05EA]/g) ?? []).length;

/**
 * Full-screen sheet with one row per word. `chosen` is updated in place, so the
 * choices are still there when the sheet is opened again for the same words.
 * Escape and the close button close it; the page behind is inert.
 */
function openSheet(results: NakdanWord[], chosen: number[], returnFocus: HTMLElement): void {
  const app = document.getElementById('app');
  const id = `sheet-${++sheetCount}`;
  const toChoose = results.filter((r) => r.options.length > 1).length;
  const summary =
    toChoose === 0
      ? 'לכל מילה נמצא ניקוד אחד — אפשר להעתיק.'
      : toChoose === 1
        ? 'למילה אחת יש כמה אפשרויות — בחרו את הנכונה.'
        : `ל־${toChoose} מילים יש כמה אפשרויות — בחרו את הנכונות.`;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (app) app.inert = false;
    if (returnFocus.isConnected) returnFocus.focus();
  };

  const rows = results.map((r, i) => wordRow(r, i, chosen, id));
  const fallback = h('div', { class: 'share-fallback' });
  const copy = async () => {
    const text = nakdanText(results, chosen);
    try {
      await navigator.clipboard.writeText(text);
      close();
      toast('הניקוד הועתק — הדביקו בתיבה של המשחק');
    } catch {
      const box = h('textarea', { class: 'words-input', rows: 4, readonly: true, dir: 'rtl', 'aria-label': 'המילים המנוקדות' });
      box.value = text;
      fallback.replaceChildren(h('p', { class: 'muted' }, 'העתקו מכאן:'), box);
      box.select();
    }
  };

  const title = h('h2', { class: 'sheet-title', id, tabindex: -1 }, 'בחירת ניקוד');
  const overlay = h(
    'div',
    { class: 'overlay sheet-overlay', role: 'presentation' },
    h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
      h(
        'header',
        { class: 'sheet-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'סגירה', onclick: close }, icon(ICONS.back)),
        title,
      ),
      h('div', { class: 'sheet-body' }, h('p', { class: 'muted' }, summary), ...rows),
      h(
        'div',
        { class: 'sheet-foot' },
        fallback,
        h('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: () => void copy() }, 'העתקה'),
      ),
    ),
  );
  document.addEventListener('keydown', onKey, true);
  if (app) app.inert = true;
  document.body.appendChild(overlay);
  title.focus();
  announce(summary);
}

/** One word: its options as a radio group, a single option as text, none as a warning. */
function wordRow(result: NakdanWord, i: number, chosen: number[], sheetId: string): HTMLElement {
  const n = i + 1;
  const head = h('p', { class: 'nk-label' }, `${n}. ${result.word}`);
  if (result.options.length === 0) {
    return h('div', { class: 'nk-row' }, head, h('p', { class: 'msg warning' }, 'לא נמצא ניקוד — יועתק כמו שנכתב'));
  }
  if (result.options.length === 1) {
    return h(
      'div',
      { class: 'nk-row' },
      head,
      h('p', { class: 'nk-single' }, icon(ICONS.check), h('span', {}, result.options[0])),
    );
  }
  const name = `${sheetId}-w${n}`;
  const wide = letterCount(result.word) > NK_TWO_COLUMN_MAX_LETTERS;
  const group = h('div', {
    class: wide ? 'seg nk-options nk-wide' : 'seg nk-options',
    role: 'radiogroup',
    'aria-label': `מילה ${n}: ${result.word}`,
  });
  result.options.forEach((option, j) => {
    const input = h('input', {
      type: 'radio',
      name,
      value: String(j),
      checked: (chosen[i] ?? 0) === j,
      'aria-label': `אפשרות ${j + 1}: ${option}`,
    });
    input.addEventListener('change', () => {
      if (input.checked) chosen[i] = j;
    });
    group.appendChild(h('label', { class: 'seg-option' }, input, h('span', {}, icon(ICONS.check), option)));
  });
  return h('div', { class: 'nk-row' }, head, group);
}
