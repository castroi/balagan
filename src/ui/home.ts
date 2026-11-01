import type { App } from '../app';
import { PLUGINS } from '../plugins/registry';
import { h, icon } from './dom';
import { ICONS } from './icons';

/** Shown on home when the saved data is from a newer app version (everything looks empty, and nothing can be added). */
export const HOME_NEWER_VERSION = 'יש גרסה חדשה של האפליקציה. רעננו את הדף';

export function renderHome(container: HTMLElement, app: App): void {
  // Only activities with saved content, in registry order: an empty card would send the kid to the editor.
  const cards = PLUGINS.flatMap((plugin) => {
    const data = app.getAssignment(plugin);
    if (data === null) return [];
    const decor = h(
      'div',
      { class: 'card-tiles', 'aria-hidden': 'true' },
      // "/" is drawn as a separator between tiles, not as a tile.
      ...plugin.cardTiles.map((t) => h('span', { class: t === '/' ? 'mini-sep' : 'mini-tile' }, t)),
    );

    const { line, fraction } = plugin.summary(data, app.data.progress[plugin.id]);
    return [
      h(
        'button',
        { class: 'card', type: 'button', 'data-plugin': plugin.id, onclick: () => app.showGame(plugin) },
        decor,
        h(
          'span',
          { class: 'card-row' },
          h(
            'span',
            { class: 'card-text' },
            h('span', { class: 'card-title' }, plugin.title),
            h('span', { class: 'muted' }, line),
          ),
          h('span', { class: 'card-play', 'aria-hidden': 'true' }, icon(ICONS.play)),
        ),
        h(
          'span',
          { class: 'progress', 'aria-hidden': 'true' },
          h('span', { class: 'progress-fill', style: `width: ${Math.round(fraction * 100)}%` }),
        ),
      ),
    ];
  });

  // Saved by a newer version: the data looks empty but can't be changed, so don't ask the parent to add words.
  const readOnly = app.readOnly;
  const subtitle = cards.length > 0 ? 'המשימות של השבוע' : 'עוד אין משימות השבוע';
  // The same warning look as the edit screen's banner (icon + text, not colour alone); it stays, unlike the toast.
  const newerBanner = readOnly
    ? h('div', { class: 'banner home-newer', id: 'home-newer' }, icon(ICONS.alert), h('span', {}, HOME_NEWER_VERSION))
    : null;

  const emptyState =
    cards.length === 0 && !readOnly
      ? h(
          'div',
          { class: 'home-empty' },
          h('p', { class: 'muted' }, 'הורים: הוסיפו מילים או הדביקו קישור במסך העריכה'),
          h(
            'button',
            { class: 'btn', type: 'button', onclick: () => app.showEdit() },
            icon(ICONS.pencil),
            h('span', {}, 'למסך העריכה'),
          ),
        )
      : null;

  container.appendChild(
    h(
      'div',
      { class: 'screen home' },
      h(
        'header',
        { class: 'topbar' },
        // Points are blocked in read-only mode (not even in memory): no chip then.
        readOnly
          ? h('span', { 'aria-hidden': 'true' })
          : h('div', { class: 'points-chip' }, icon(ICONS.star, 'icon star'), h('span', {}, String(app.data.points))),
        h(
          'button',
          { class: 'icon-btn', type: 'button', 'aria-label': 'עריכת משימות', onclick: () => app.showEdit() },
          icon(ICONS.pencil),
        ),
      ),
      h(
        'div',
        { class: 'greeting' },
        // Focus lands on the title after a screen change: in read-only mode it also reads the warning.
        h('h1', { class: 'title', ...(readOnly ? { 'aria-describedby': 'home-newer' } : {}) }, 'שלום!'),
        readOnly ? null : h('p', { class: 'muted big' }, subtitle),
      ),
      newerBanner,
      cards.length > 0 ? h('div', { class: 'cards' }, ...cards) : emptyState,
    ),
  );
}
