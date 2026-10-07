/** Kleine DOM-Helfer (nur textContent, nie innerHTML). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function link(parent: HTMLElement, href: string, text: string, className = ''): HTMLAnchorElement {
  const a = el('a', className, parent, text);
  a.href = href;
  return a;
}

/** Absaetze aus Text mit Leerzeile (\n\n) als Trenner. */
export function paragraphs(parent: HTMLElement, text: string, className = ''): void {
  for (const part of text.split(/\n\s*\n/)) {
    if (part.trim() !== '') el('p', className, parent, part.trim());
  }
}
