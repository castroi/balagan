type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/**
 * Creates an element. Strings become text nodes (never HTML), so user text is
 * always safe. Attributes starting with "on" are event listeners.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** Builds an inline SVG icon from trusted, hard-coded markup (see icons.ts). */
export function icon(svgMarkup: string, className = 'icon'): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = svgMarkup.trim();
  const svg = tpl.content.firstElementChild as SVGElement;
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

export const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
