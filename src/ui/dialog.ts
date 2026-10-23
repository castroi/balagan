import { h } from './dom';

/** A simple yes/no dialog. Resolves true when the first button is chosen. */
export function confirmDialog(message: string, okLabel: string, cancelLabel = 'ביטול'): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (answer: boolean) => {
      overlay.remove();
      resolve(answer);
    };
    const ok = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close(true) }, okLabel);
    const overlay = h(
      'div',
      { class: 'overlay', role: 'presentation' },
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': message },
        h('p', { class: 'dialog-text' }, message),
        h(
          'div',
          { class: 'dialog-actions' },
          ok,
          h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel),
        ),
      ),
    );
    document.body.appendChild(overlay);
    ok.focus();
  });
}

let currentToast: HTMLElement | null = null;

/** Removes any visible toast (e.g. so it doesn't cover the game's letter tray). */
export function clearToast(): void {
  currentToast?.remove();
  currentToast = null;
}

/** A short message at the bottom, with an optional action button (e.g. undo). */
export function toast(message: string, action?: { label: string; run: () => void }, ms = 3500): void {
  currentToast?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
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
  window.setTimeout(() => {
    if (currentToast === el) currentToast = null;
    el.remove();
  }, ms);
}
