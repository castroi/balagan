import { h } from './dom';

/**
 * A yes/no dialog. Resolves true when the first (action) button is chosen.
 * Focus starts on the safe "cancel" button, Escape cancels, Tab stays inside
 * the dialog, and focus returns to where it was afterwards.
 */
export function confirmDialog(message: string, okLabel: string, cancelLabel = 'ביטול'): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const close = (answer: boolean) => {
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(answer);
    };
    const ok = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close(true) }, okLabel);
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel);
    const overlay = h(
      'div',
      { class: 'overlay', role: 'presentation' },
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': message },
        h('p', { class: 'dialog-text' }, message),
        h('div', { class: 'dialog-actions' }, ok, cancel),
      ),
    );
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        // Only two buttons: Tab and Shift+Tab move between them.
        e.preventDefault();
        (document.activeElement === ok ? cancel : ok).focus();
      }
    });
    document.body.appendChild(overlay);
    cancel.focus();
  });
}

let liveRegion: HTMLElement | null = null;

/**
 * Reads a short message aloud to screen-reader users, through one live region
 * that stays on the page (regions recreated on every render aren't announced).
 */
export function announce(message: string): void {
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = h('div', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  const region = liveRegion;
  // Clear first so the same message is announced again when repeated.
  region.textContent = '';
  window.setTimeout(() => (region.textContent = message), 50);
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
