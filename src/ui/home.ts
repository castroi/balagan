import type { App } from '../app';
import { PLUGINS } from '../plugins/registry';
import { h, icon } from './dom';
import { ICONS } from './icons';

export function renderHome(container: HTMLElement, app: App): void {
  const cards = PLUGINS.map((plugin) => {
    const data = app.getAssignment(plugin);
    const decor = h(
      'div',
      { class: 'card-tiles', 'aria-hidden': 'true' },
      ...plugin.cardTiles.map((t) => h('span', { class: 'mini-tile' }, t)),
    );

    if (data === null) {
      return h(
        'button',
        { class: 'card card-empty', type: 'button', onclick: () => app.showEdit() },
        decor,
        h('span', { class: 'card-title' }, plugin.title),
        h('span', { class: 'muted' }, 'עדיין אין תוכן — הוסיפו במסך העריכה'),
      );
    }

    const { line, fraction } = plugin.summary(data, app.data.progress[plugin.id]);
    return h(
      'button',
      { class: 'card', type: 'button', onclick: () => app.showGame(plugin) },
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
    );
  });

  container.appendChild(
    h(
      'div',
      { class: 'screen home' },
      h(
        'header',
        { class: 'topbar' },
        h('div', { class: 'points-chip' }, icon(ICONS.star, 'icon star'), h('span', {}, String(app.data.points))),
        h(
          'button',
          { class: 'icon-btn', type: 'button', 'aria-label': 'עריכת משימות', onclick: () => app.showEdit() },
          icon(ICONS.pencil),
        ),
      ),
      h('div', { class: 'greeting' }, h('h1', { class: 'title' }, 'שלום!'), h('p', { class: 'muted big' }, 'המשימות של השבוע')),
      h('div', { class: 'cards' }, ...cards),
    ),
  );
}
