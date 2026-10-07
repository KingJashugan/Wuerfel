/**
 * Seiten der Lernansicht (Start, Phase, Fall/Beispiel). Nutzt nur den Adapter (ueber player-view
 * und parseMoves/caseSetup) und den Content-Loader; nie `cubing` direkt.
 */
import { caseSetup, parseMoves } from '../cube/adapter';
import type { PlayerState } from '../cube/adapter';
import { loadMethode } from '../../content/loader';
import { ABLAUF_PRAEFIX } from '../../content/schema';
import type {
  AlgorithmischerEintrag,
  Algorithmus,
  Beispiel,
  Eintrag,
  Fall,
  IntuitiverEintrag,
  Methode,
  Schritt,
} from '../../content/schema';
import { el, link, paragraphs } from './dom';
import { activeMoveIndex, mountPlayer } from './player-view';
import type { PlayerHandle } from './player-view';
import { caseHref, homeHref, phaseHref } from './router';

/** Eine gemountete Seite. `destroy` raeumt Player und Listener auf. */
export interface View {
  title: string;
  destroy(): void;
}

const NOOP = (): void => undefined;

function section(parent: HTMLElement, heading: string, className = ''): HTMLElement {
  const s = el('section', `block ${className}`.trim(), parent);
  el('h2', '', s, heading);
  return s;
}

function moves(parent: HTMLElement, zuege: string, className = ''): HTMLElement {
  return el('code', `moves ${className}`.trim(), parent, zuege);
}

function normalized(zuege: string): string {
  try {
    return parseMoves(zuege).join(' ');
  } catch {
    return zuege.trim();
  }
}

/** Die Zuege des Schritt-Bereichs aus der (expandierten) Zugfolge. */
function slice(zuege: string, s: Schritt): string {
  try {
    return parseMoves(zuege).slice(s.bereich.von, s.bereich.bis).join(' ');
  } catch {
    return '';
  }
}

export function findEintrag(methode: Methode, eintraege: Eintrag[], nr: number): Eintrag | undefined {
  const phase = methode.phasen.find((p) => p.nr === nr);
  return phase ? eintraege.find((e) => e.id === phase.id) : undefined;
}

function crumbs(parent: HTMLElement, items: Array<{ href: string; text: string }>): void {
  const nav = el('nav', 'crumbs', parent);
  nav.setAttribute('aria-label', 'Navigation');
  for (const it of items) link(nav, it.href, it.text, 'crumb');
}

function heading(parent: HTMLElement, text: string): HTMLElement {
  const h = el('h1', '', parent, text);
  h.tabIndex = -1;
  return h;
}

// ---------------------------------------------------------------------------
// Startseite
// ---------------------------------------------------------------------------

export function homeView(page: HTMLElement): View {
  const { methode } = loadMethode();
  heading(page, 'Cube Trainer – Anfängermethode');
  el(
    'p',
    'lead',
    page,
    'Lerne den 3x3-Zauberwürfel Schritt für Schritt: die Anfängermethode in sieben Phasen, jede mit Erklärung und 3D-Würfel zum Nachvollziehen.',
  );
  const intro = section(page, 'Orientierung und Notation');
  el('p', '', intro, methode.orientierung);

  const list = section(page, 'Die sieben Phasen');
  const ol = el('ol', 'cards', list);
  ol.dataset['testid'] = 'phase-list';
  for (const p of [...methode.phasen].sort((a, b) => a.nr - b.nr)) {
    const li = el('li', '', ol);
    const a = link(li, phaseHref(p.nr), '', 'card');
    a.dataset['testid'] = `phase-link-${p.nr}`;
    el('span', 'card-nr', a, String(p.nr));
    const body = el('span', 'card-body', a);
    el('span', 'card-title', body, p.titel);
    el('span', 'card-sub', body, p.typ === 'algorithmisch' ? 'Mit Algorithmus' : 'Intuitiv, ohne festen Algorithmus');
  }
  return { title: 'Cube Trainer – Anfängermethode', destroy: NOOP };
}

// ---------------------------------------------------------------------------
// Phasenseite
// ---------------------------------------------------------------------------

function groupFaelle(faelle: Fall[]): Array<{ name: string | null; faelle: Fall[] }> {
  const groups: Array<{ name: string | null; faelle: Fall[] }> = [];
  for (const f of faelle) {
    const name = f.gruppe ?? null;
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, faelle: [] };
      groups.push(g);
    }
    g.faelle.push(f);
  }
  return groups;
}

function algorithmusBlock(page: HTMLElement, a: Algorithmus): void {
  const s = section(page, `Algorithmus: ${a.name}`, 'algorithmus');
  s.dataset['testid'] = 'algorithmus';
  moves(s, a.zuege, 'big');
  if (a.trigger.length > 0) {
    el('h3', '', s, 'Trigger (Bausteine)');
    const dl = el('dl', 'defs', s);
    for (const t of a.trigger) {
      const dt = el('dt', '', dl, `${t.name}: `);
      moves(dt, t.zuege);
      el('dd', '', dl, t.erklaerung);
    }
  }
  el('h3', '', s, 'Schritt für Schritt');
  const ol = el('ol', 'steps', s);
  for (const st of a.schritte) {
    const li = el('li', '', ol);
    moves(li, slice(a.zuege, st), 'step-moves');
    el('span', 'step-text', li, st.text);
  }
  if (a.varianten && a.varianten.length > 0) {
    el('h3', '', s, 'Varianten');
    const dl = el('dl', 'defs', s);
    for (const v of a.varianten) {
      const dt = el('dt', '', dl, `${v.name}: `);
      moves(dt, v.zuege);
      if (v.schritte && v.schritte.length > 0) {
        const dd = el('dd', '', dl);
        for (const st of v.schritte) el('p', 'step-text', dd, `${slice(v.zuege, st)}: ${st.text}`);
      }
    }
  }
}

function caseCard(parent: HTMLElement, nr: number, id: string, name: string, lines: string[]): void {
  const li = el('li', '', parent);
  const a = link(li, caseHref(nr, id), '', 'card');
  a.dataset['testid'] = `case-link-${id}`;
  const body = el('span', 'card-body', a);
  el('span', 'card-title', body, name);
  for (const l of lines) el('span', 'card-sub', body, l);
}

export function phaseView(page: HTMLElement, nr: number): View | null {
  const { methode, eintraege } = loadMethode();
  const e = findEintrag(methode, eintraege, nr);
  if (!e) return null;
  crumbs(page, [{ href: homeHref(), text: '← Alle Phasen' }]);
  heading(page, `Phase ${e.phase}: ${e.titel}`);
  el('p', 'badge', page, e.typ === 'algorithmisch' ? 'Mit Algorithmus' : 'Intuitiv, ohne festen Algorithmus');

  const ziel = section(page, 'Ziel');
  el('p', '', ziel, e.ziel.text);

  if (e.typ === 'intuitiv') {
    const pr = section(page, 'Prinzip');
    paragraphs(pr, e.prinzip);
    const bs = section(page, 'Beispiele');
    const ul = el('ul', 'cards', bs);
    ul.dataset['testid'] = 'example-list';
    e.beispiele.forEach((b, i) => caseCard(ul, e.phase, b.id, `Beispiel ${i + 1}`, [b.beschreibung]));
  } else {
    algorithmusBlock(page, e.algorithmus);
    const fs = section(page, 'Fälle');
    el('p', 'hint', fs, 'Wähle den Fall, der zu deinem Würfel passt. Im Fall siehst du die Lösung als Animation.');
    const groups = groupFaelle(e.faelle);
    const named = groups.some((g) => g.name !== null);
    for (const g of groups) {
      const box = el('div', 'group', fs);
      box.dataset['testid'] = 'case-group';
      if (named) el('h3', '', box, g.name ?? 'Weitere Fälle');
      const ul = el('ul', 'cards', box);
      for (const f of g.faelle) {
        const lines = [f.erkennung];
        if (f.hinweis) lines.push(f.hinweis);
        caseCard(ul, e.phase, f.id, f.name, lines);
      }
    }
  }
  return { title: `Phase ${e.phase}: ${e.titel}`, destroy: NOOP };
}

// ---------------------------------------------------------------------------
// Fallseite
// ---------------------------------------------------------------------------

interface Part {
  label: string;
  zuege: string;
  note?: string;
}

const ART_LABEL = {
  vorbereitung: 'Vorbereitung',
  zwischen: 'Zwischenzug',
  nachbereitung: 'Nachbereitung',
} as const;

/** Ablauf eines Falls als Liste von Teilen (aus `teile`, sonst aus vorbereitung/Algorithmus/nachbereitung). */
export function ablaufTeile(fall: Fall, algo: Algorithmus): Part[] {
  const times = (n: number | undefined): string | undefined => ((n ?? 1) > 1 ? `${n}× nacheinander` : undefined);
  if (fall.teile && fall.teile.length > 0) {
    return fall.teile.map((t): Part => {
      if (t.art === 'algorithmus') {
        const note = times(t.durchgaenge);
        return { label: algo.name, zuege: algo.zuege, ...(note ? { note } : {}) };
      }
      if (t.art === 'variante') {
        const v = algo.varianten?.find((x) => x.name === t.variante);
        const note = times(t.durchgaenge);
        return { label: t.variante ?? 'Variante', zuege: v?.zuege ?? t.zuege, ...(note ? { note } : {}) };
      }
      return { label: ART_LABEL[t.art], zuege: t.zuege };
    });
  }
  const all = parseMoves(fall.loesung);
  const pre = fall.vorbereitung ? parseMoves(fall.vorbereitung).length : 0;
  const post = fall.nachbereitung ? parseMoves(fall.nachbereitung).length : 0;
  const middle = all.slice(pre, all.length - post).join(' ');
  const variant = algo.varianten?.find((v) => normalized(v.zuege) === middle);
  const name = normalized(algo.zuege) === middle ? algo.name : (variant?.name ?? 'Algorithmus');
  const parts: Part[] = [];
  if (fall.vorbereitung) parts.push({ label: ART_LABEL.vorbereitung, zuege: fall.vorbereitung });
  parts.push({ label: name, zuege: middle });
  if (fall.nachbereitung) parts.push({ label: ART_LABEL.nachbereitung, zuege: fall.nachbereitung });
  return parts;
}

function pager(page: HTMLElement, nr: number, items: Array<{ id: string; name: string }>, index: number): void {
  const nav = el('nav', 'pager', page);
  nav.setAttribute('aria-label', 'Vorheriger und nächster Fall');
  const prev = items[index - 1];
  const next = items[index + 1];
  if (prev) {
    const a = link(nav, caseHref(nr, prev.id), '', 'pager-link prev');
    a.dataset['testid'] = 'prev-case';
    el('span', 'pager-dir', a, '← Vorheriger');
    el('span', 'pager-name', a, prev.name);
  } else {
    el('span', 'pager-gap', nav);
  }
  if (next) {
    const a = link(nav, caseHref(nr, next.id), '', 'pager-link next');
    a.dataset['testid'] = 'next-case';
    el('span', 'pager-dir', a, 'Nächster →');
    el('span', 'pager-name', a, next.name);
  } else {
    el('span', 'pager-gap', nav);
  }
}

/** Fall bzw. Beispiel `id` der Phase `nr`; null, wenn unbekannt. */
export function caseView(page: HTMLElement, nr: number, id: string): View | null {
  const { methode, eintraege } = loadMethode();
  const e = findEintrag(methode, eintraege, nr);
  if (!e) return null;
  return e.typ === 'algorithmisch' ? algorithmicCase(page, e, id) : intuitiveCase(page, e, id);
}

function playerHost(page: HTMLElement): HTMLElement {
  const host = el('div', 'player-host', page);
  host.dataset['testid'] = 'player-host';
  return host;
}

function algorithmicCase(page: HTMLElement, e: AlgorithmischerEintrag, id: string): View | null {
  const index = e.faelle.findIndex((f) => f.id === id);
  const fall = e.faelle[index];
  if (!fall) return null;
  crumbs(page, [
    { href: homeHref(), text: '← Alle Phasen' },
    { href: phaseHref(e.phase), text: `Phase ${e.phase}: ${e.titel}` },
  ]);
  heading(page, fall.name);
  if (fall.gruppe) el('p', 'badge', page, fall.gruppe);

  const handle = mountPlayer(playerHost(page), { setup: fall.setup ?? caseSetup(fall.loesung), alg: fall.loesung });

  const erk = section(page, 'Erkennung');
  el('p', '', erk, fall.erkennung);
  if (fall.hinweis && !fall.hinweis.startsWith(ABLAUF_PRAEFIX)) el('p', 'hint', erk, fall.hinweis);

  const ab = section(page, 'Ablauf');
  ab.dataset['testid'] = 'ablauf';
  const ol = el('ol', 'parts', ab);
  for (const part of ablaufTeile(fall, e.algorithmus)) {
    const li = el('li', '', ol);
    el('span', 'part-label', li, part.note ? `${part.label} (${part.note})` : part.label);
    moves(li, part.zuege);
  }
  const a = e.algorithmus;
  el('p', 'hint', ab, `Der Algorithmus „${a.name}“ steht mit Erklärung auf der Seite der Phase.`);

  pager(page, e.phase, e.faelle, index);
  return { title: `${fall.name} – Phase ${e.phase}`, destroy: () => handle.destroy() };
}

function intuitiveCase(page: HTMLElement, e: IntuitiverEintrag, id: string): View | null {
  const index = e.beispiele.findIndex((b) => b.id === id);
  const bsp: Beispiel | undefined = e.beispiele[index];
  if (!bsp) return null;
  crumbs(page, [
    { href: homeHref(), text: '← Alle Phasen' },
    { href: phaseHref(e.phase), text: `Phase ${e.phase}: ${e.titel}` },
  ]);
  heading(page, `Beispiel ${index + 1}`);
  el('p', '', page, bsp.beschreibung);

  const steps: Array<{ li: HTMLElement; s: Schritt }> = [];
  const onState = (s: PlayerState): void => {
    const active = activeMoveIndex(s);
    for (const st of steps) {
      const on = active >= st.s.bereich.von && active < st.s.bereich.bis;
      st.li.classList.toggle('active', on);
      if (on) st.li.setAttribute('aria-current', 'step');
      else st.li.removeAttribute('aria-current');
    }
  };
  const handle: PlayerHandle = mountPlayer(playerHost(page), { setup: bsp.setup, alg: bsp.loesung, onState });

  if (bsp.schritte && bsp.schritte.length > 0) {
    const sec = section(page, 'Schritt für Schritt');
    sec.dataset['testid'] = 'schritte';
    const ol = el('ol', 'steps', sec);
    for (const s of bsp.schritte) {
      const li = el('li', '', ol);
      moves(li, slice(bsp.loesung, s), 'step-moves');
      el('span', 'step-text', li, s.text);
      steps.push({ li, s });
    }
  }
  const ziel = section(page, 'Ziel der Phase');
  el('p', '', ziel, e.ziel.text);

  pager(page, e.phase, e.beispiele.map((b, i) => ({ id: b.id, name: `Beispiel ${i + 1}` })), index);
  return { title: `Beispiel ${index + 1} – Phase ${e.phase}`, destroy: () => handle.destroy() };
}
