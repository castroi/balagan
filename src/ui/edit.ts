import type { App } from '../app';
import { PLUGINS } from '../plugins/registry';
import type { AnyPlugin } from '../plugins/types';
import { buildShareLink } from '../platform/share-codec';
import { APP_VERSION } from '../platform/version';
import { NEWER_VERSION_MESSAGE } from '../platform/storage';
import { importedTitles } from '../platform/import';
import { PAIR_SECONDS } from '../platform/settings';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { confirmDialog, toast } from './dialog';

interface Section {
  el: HTMLElement;
  isDirty(): boolean;
}

export function renderEdit(container: HTMLElement, app: App): void {
  const sections = PLUGINS.map((p) => pluginSection(app, p));
  app.setUnsavedCheck(() => sections.some((s) => s.isDirty()));

  // Saved data is from a newer version: show why nothing can be changed here.
  const readOnlyBanner = app.readOnly
    ? h('div', { class: 'banner', role: 'status' }, icon(ICONS.alert), h('span', {}, NEWER_VERSION_MESSAGE))
    : null;

  const goBack = async () => {
    if (sections.some((s) => s.isDirty())) {
      const leave = await confirmDialog('יש שינויים שלא נשמרו. לצאת בלי לשמור?', 'לצאת', 'להישאר');
      if (!leave) return;
    }
    app.showHome();
  };

  const voiceBanner = h('div', { class: 'banner', hidden: true, role: 'status' });
  void app.speaker.ready().then((status) => {
    if (status === 'ok') return;
    voiceBanner.replaceChildren(
      icon(ICONS.alert),
      h(
        'span',
        {},
        status === 'unsupported'
          ? 'הדפדפן הזה לא תומך בהקראה. המשחק יעבוד, אבל בלי קול.'
          : 'לא נמצא קול בעברית במכשיר. אפשר להוסיף קול עברי בהגדרות ההקראה (טקסט לדיבור) של המכשיר.',
      ),
    );
    voiceBanner.hidden = false;
  });

  container.appendChild(
    h(
      'div',
      { class: 'screen edit' },
      h(
        'header',
        { class: 'topbar edit-topbar' },
        h(
          'button',
          { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה', onclick: () => void goBack() },
          icon(ICONS.back),
        ),
        h('h1', { class: 'edit-title' }, 'עריכת משימות'),
        h('span', { class: 'version', dir: 'ltr' }, `גרסה ${APP_VERSION}`),
      ),
      readOnlyBanner,
      voiceBanner,
      ...sections.map((s) => s.el),
      settingsSection(app),
      shareSection(app, sections),
      importSection(app),
    ),
  );
}

function pluginSection(app: App, plugin: AnyPlugin): Section {
  const inputId = `input-${plugin.id}`;
  let savedText = (() => {
    const data = app.getAssignment(plugin);
    return data === null ? '' : plugin.toText(data);
  })();

  const textarea = h('textarea', {
    id: inputId,
    class: 'words-input',
    rows: 10,
    dir: 'rtl',
    placeholder: plugin.editor.placeholder,
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
  });
  textarea.value = savedText;

  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const preview = h('div', { class: 'preview-wrap' });
  const status = h('span', { class: 'save-status' });
  const voiceList = h('div', { class: 'voice-list' });

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'שמירה');
  const clearBtn = h('button', { class: 'btn', type: 'button' }, 'ניקוי');

  const isDirty = () => textarea.value.trim() !== savedText.trim();
  let hasErrors = false;

  // Collapsible section: a real button with aria-expanded; collapsed shows what's saved.
  const bodyId = `section-${plugin.id}`;
  const headSummary = h('span', { class: 'panel-summary' });
  const toggle = h(
    'button',
    {
      class: 'panel-toggle',
      type: 'button',
      'aria-expanded': 'true',
      'aria-controls': bodyId,
      onclick: () => setExpanded(!expanded || hasErrors),
    },
    icon(ICONS.chevron, 'icon chevron'),
    h('span', { class: 'panel-title' }, plugin.editor.label),
    headSummary,
  );
  let expanded = true;
  function setExpanded(open: boolean) {
    expanded = open;
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    renderHeadSummary();
  }
  function renderHeadSummary() {
    const data = savedText ? app.getAssignment(plugin) : null;
    const n = data === null ? 0 : plugin.speakItems(data).length;
    const saved = n === 0 ? '· אין תוכן' : n === 1 ? '· מילה אחת שמורה' : `· ${n} מילים שמורות`;
    headSummary.textContent = expanded ? '' : isDirty() ? `${saved} · יש שינויים שלא נשמרו` : saved;
  }

  function renderVoiceList() {
    const data = app.getAssignment(plugin);
    voiceList.replaceChildren();
    if (data === null) return;
    voiceList.appendChild(h('span', { class: 'voice-title' }, 'בדיקת הקראה — לחצו על מילה כדי לשמוע:'));
    const chips = h('div', { class: 'chips' });
    for (const item of plugin.speakItems(data)) {
      chips.appendChild(
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-label': `השמעת ${item}`,
            onclick: () => {
              app.sounds.unlock();
              void app.speaker.speak(item);
            },
          },
          icon(ICONS.speaker),
          h('span', {}, item),
        ),
      );
    }
    voiceList.appendChild(chips);
  }

  function update() {
    feedback.replaceChildren();
    preview.replaceChildren();
    const empty = textarea.value.trim() === '';
    hasErrors = false;
    if (empty) {
      saveBtn.disabled = true;
    } else {
      const result = plugin.parse(textarea.value);
      for (const e of result.errors) feedback.appendChild(h('p', { class: 'msg error' }, e));
      for (const w of result.warnings) feedback.appendChild(h('p', { class: 'msg warning' }, w));
      if (result.errors.length === 0) feedback.appendChild(h('p', { class: 'msg ok' }, 'התוכן תקין'));
      if (result.data !== null && plugin.preview) preview.appendChild(plugin.preview(result.data));
      hasErrors = result.errors.length > 0;
      saveBtn.disabled = result.data === null || !isDirty();
    }
    clearBtn.disabled = empty && savedText === '';
    status.textContent = isDirty() ? 'יש שינויים שלא נשמרו' : savedText ? 'נשמר' : '';
    // A section with an error always stays open, so the error is never hidden.
    if (hasErrors) setExpanded(true);
    renderHeadSummary();
  }

  saveBtn.addEventListener('click', () => {
    const result = plugin.parse(textarea.value);
    if (result.data === null) return;
    // Not saved (device refused, or newer data must not be overwritten): the message says why.
    if (app.setAssignment(plugin, result.data) !== 'saved') return;
    savedText = plugin.toText(result.data);
    textarea.value = savedText;
    renderVoiceList();
    update();
    toast('נשמר');
  });

  clearBtn.addEventListener('click', async () => {
    if (app.refuseIfReadOnly()) return;
    const ok = await confirmDialog(`למחוק את התוכן של "${plugin.title}"?`, 'מחיקה');
    if (!ok) return;
    const prevAssignment = app.data.assignments[plugin.id];
    const prevProgress = app.data.progress[plugin.id];
    const prevText = textarea.value;
    if (app.setAssignment(plugin, null) !== 'saved') return;
    savedText = '';
    textarea.value = '';
    renderVoiceList();
    update();
    toast(
      'התוכן נמחק',
      {
        label: 'ביטול',
        run: () => {
          if (app.refuseIfReadOnly()) return;
          if (prevAssignment) app.data.assignments[plugin.id] = prevAssignment;
          if (prevProgress !== undefined) app.data.progress[plugin.id] = prevProgress;
          app.save();
          const data = app.getAssignment(plugin);
          savedText = data === null ? '' : plugin.toText(data);
          textarea.value = prevText;
          renderVoiceList();
          update();
        },
      },
      7000,
    );
  });

  const body = h(
    'div',
    { class: 'panel-body', id: bodyId },
    h('p', { class: 'muted', id: `hint-${plugin.id}` }, plugin.editor.hint),
    textarea,
    feedback,
    preview,
    h('div', { class: 'actions' }, saveBtn, clearBtn, status),
    voiceList,
  );
  textarea.setAttribute('aria-label', plugin.editor.label);
  textarea.setAttribute('aria-describedby', `hint-${plugin.id}`);

  textarea.addEventListener('input', update);
  renderVoiceList();
  update();

  const el = h('section', { class: 'panel', 'data-plugin': plugin.id }, h('h2', { class: 'panel-head' }, toggle), body);
  return { el, isDirty };
}

/** Device settings (not in the share link). Saved as soon as a value is chosen. */
function settingsSection(app: App): HTMLElement {
  const name = 'pair-seconds';
  const legendId = `${name}-legend`;
  const hintId = `${name}-hint`;
  const options = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': legendId, 'aria-describedby': hintId });
  for (const seconds of PAIR_SECONDS) {
    const input = h('input', {
      type: 'radio',
      name,
      value: String(seconds),
      id: `${name}-${seconds}`,
      checked: app.settings.pairSeconds === seconds,
      disabled: app.readOnly,
      'aria-label': `${seconds} שניות`,
    });
    input.addEventListener('change', () => {
      if (!input.checked) return;
      if (app.setSettings({ ...app.settings, pairSeconds: seconds })) {
        toast('נשמר');
      } else {
        // Not saved: show the value the game will really use.
        options
          .querySelectorAll<HTMLInputElement>('input')
          .forEach((i) => (i.checked = Number(i.value) === app.settings.pairSeconds));
      }
    });
    options.appendChild(
      h('label', { class: 'seg-option', for: input.id }, input, h('span', { dir: 'ltr' }, String(seconds))),
    );
  }
  return h(
    'section',
    { class: 'panel', 'data-section': 'settings' },
    h('h2', { class: 'panel-title' }, 'הגדרות'),
    h('p', { class: 'setting-label', id: legendId }, 'כמה זמן מוצג הזוג (הנכון מול השגוי) אחרי מילה (שניות)'),
    h('p', { class: 'muted', id: hintId }, 'באותיות מבלבלות ובבחרו את המילה, רק כשהילד טעה. בשאר המקרים "כל הכבוד" מוצג כרגיל.'),
    options,
    h('p', { class: 'muted' }, 'ההגדרה נשמרת במכשיר הזה בלבד ולא נשלחת בקישור.'),
  );
}

function shareSection(app: App, sections: Section[]): HTMLElement {
  const fallback = h('div', { class: 'share-fallback' });

  async function share() {
    fallback.replaceChildren();
    const payload = app.sharePayload();
    if (!payload) {
      toast('אין עדיין תוכן שמור לשיתוף');
      return;
    }
    if (sections.some((s) => s.isDirty())) {
      toast('שימו לב: הקישור כולל רק את מה שנשמר');
    }
    const link = buildShareLink(window.location.href, payload);

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'משימות השבוע', url: link });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast('הקישור הועתק — אפשר להדביק אותו בהודעה');
    } catch {
      const box = h('textarea', { class: 'link-box', rows: 3, readonly: true, dir: 'ltr', 'aria-label': 'קישור לשיתוף' });
      box.value = link;
      fallback.replaceChildren(h('p', { class: 'muted' }, 'העתיקו את הקישור:'), box);
      box.select();
    }
  }

  return h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'שיתוף למכשיר אחר'),
    h('p', { class: 'muted' }, 'הקישור כולל את כל המשימות השמורות של השבוע.'),
    h(
      'button',
      { class: 'btn btn-wide', type: 'button', onclick: () => void share() },
      icon(ICONS.link),
      h('span', {}, 'שיתוף קישור'),
    ),
    fallback,
  );
}

function importSection(app: App): HTMLElement {
  const inputId = 'import-input';
  const input = h('textarea', {
    id: inputId,
    class: 'link-box',
    rows: 3,
    dir: 'ltr',
    placeholder: 'https://…#import=…',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
  });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });

  async function runImport() {
    feedback.replaceChildren();
    if (app.refuseIfReadOnly()) return;
    const result = app.readImport(input.value);
    if ('error' in result) {
      feedback.appendChild(h('p', { class: 'msg error' }, result.error));
      return;
    }
    const ok = await confirmDialog(`להחליף במכשיר הזה את התוכן של: ${importedTitles(result.entries)}?`, 'להחליף');
    if (!ok) return;
    if (app.applyImport(result.entries) !== 'saved') return;
    app.showEdit();
    toast(result.skipped ? 'המשימות נטענו (חלק מהתוכן לא נתמך בגרסה הזו)' : 'המשימות נטענו');
  }

  return h(
    'section',
    { class: 'panel' },
    h('label', { class: 'panel-title', for: inputId }, 'קיבלתם קישור?'),
    h('p', { class: 'muted' }, 'אם האתר מותקן במסך הבית, הדביקו כאן את הקישור כדי לטעון את המשימות לתוכו.'),
    input,
    feedback,
    h('button', { class: 'btn btn-wide', type: 'button', onclick: () => void runImport() }, 'טעינה מהקישור'),
  );
}
