import type { App } from '../app';
import { PLUGINS } from '../plugins/registry';
import type { AnyPlugin } from '../plugins/types';
import { buildShareLink } from '../platform/share-codec';
import { APP_VERSION } from '../platform/version';
import { NEWER_VERSION_MESSAGE } from '../platform/storage';
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
  const status = h('span', { class: 'save-status' });
  const voiceList = h('div', { class: 'voice-list' });

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'שמירה');
  const clearBtn = h('button', { class: 'btn', type: 'button' }, 'ניקוי');

  const isDirty = () => textarea.value.trim() !== savedText.trim();

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
    const empty = textarea.value.trim() === '';
    if (empty) {
      saveBtn.disabled = true;
    } else {
      const result = plugin.parse(textarea.value);
      for (const e of result.errors) feedback.appendChild(h('p', { class: 'msg error' }, e));
      for (const w of result.warnings) feedback.appendChild(h('p', { class: 'msg warning' }, w));
      if (result.errors.length === 0) feedback.appendChild(h('p', { class: 'msg ok' }, 'התוכן תקין'));
      saveBtn.disabled = result.data === null || !isDirty();
    }
    clearBtn.disabled = empty && savedText === '';
    status.textContent = isDirty() ? 'יש שינויים שלא נשמרו' : savedText ? 'נשמר' : '';
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

  textarea.addEventListener('input', update);
  renderVoiceList();
  update();

  const el = h(
    'section',
    { class: 'panel' },
    h('label', { class: 'panel-title', for: inputId }, plugin.editor.label),
    h('p', { class: 'muted' }, plugin.editor.hint),
    textarea,
    feedback,
    h('div', { class: 'actions' }, saveBtn, clearBtn, status),
    voiceList,
  );
  return { el, isDirty };
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
    const ok = await confirmDialog('להחליף את התוכן של השבוע במכשיר הזה?', 'להחליף');
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
