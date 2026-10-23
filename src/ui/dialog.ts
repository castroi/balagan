import { h } from './dom';

let dialogCount = 0;

/**
 * A yes/no dialog. Resolves true when the first (action) button is chosen.
 * Focus starts on the safe "cancel" button, Escape cancels, keyboard focus
 * stays inside the dialog, the page behind is inert (not reachable by touch,
 * keyboard or screen reader), and focus returns afterwards when possible.
 */
export function confirmDialog(message: string, okLabel: string, cancelLabel = 'ביטול'): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const app = document.getElementById('app');
    const id = `dialog-${++dialogCount}`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        // Only two buttons: Tab and Shift+Tab move between them, never out.
        e.preventDefault();
        (document.activeElement === cancel ? ok : cancel).focus();
      }
    };
    const close = (answer: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (app) app.inert = false;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      resolve(answer);
    };

    const ok = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close(true) }, okLabel);
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel);
    const overlay = h(
      'div',
      { class: 'overlay', role: 'presentation' },
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id },
        h('p', { class: 'dialog-text', id }, message),
        h('div', { class: 'dialog-actions' }, ok, cancel),
      ),
    );
    // A tap on the dimmed background keeps focus in the dialog.
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) e.preventDefault();
    });
    document.addEventListener('keydown', onKey, true);
    if (app) app.inert = true;
    document.body.appendChild(overlay);
    cancel.focus();
  });
}

let liveRegion: HTMLElement | null = null;
let pendingAnnouncement: number | undefined;

/** Creates the screen-reader live region early (one added late is often ignored). */
export function prepareAnnouncer(): HTMLElement {
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = h('div', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

/**
 * Reads a short message aloud to screen-reader users, through one live region
 * that stays on the page (regions recreated on every render aren't announced).
 */
export function announce(message: string): void {
  const region = prepareAnnouncer();
  window.clearTimeout(pendingAnnouncement);
  // Clear first so the same message is announced again when repeated.
  region.textContent = '';
  pendingAnnouncement = window.setTimeout(() => (region.textContent = message), 50);
}

let currentToast: HTMLElement | null = null;

/** Removes any visible toast (e.g. when the screen changes). */
export function clearToast(): void {
  currentToast?.remove();
  currentToast = null;
}

/** A short message at the bottom, with an optional action button (e.g. undo). */
export function toast(message: string, action?: { label: string; run: () => void }, ms = 3500): void {
  currentToast?.remove();
  const el = h('div', { class: 'toast' }, h('span', {}, message));
  if (action) {
    el.appendChild(
      h(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onclick: () => {
            el.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  }
  document.body.appendChild(el);
  currentToast = el;
  announce(message);
  window.setTimeout(() => {
    if (currentToast === el) currentToast = null;
    el.remove();
  }, ms);
}
