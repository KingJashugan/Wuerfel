/**
 * Laedt und prueft die Lerninhalte (content/**\/*.json): Schema-Validierung je Datei und
 * Querpruefung gegen die Methodendatei. Kein cubing-Import. Die Lernansicht nutzt `loadMethode()`
 * und `eintrag(id)`; Tests nutzen `pruefeInhalt` auch mit Fixture-Dateien.
 *
 * Inhaltliche Pruefungen (Notation, Zugfolgen, Faelle) sind NICHT Teil des Laders, sondern von
 * tests/content.test.ts.
 */
import { validateEntry, validateMethode, type Eintrag, type Methode } from './schema';

export const METHODE_DATEI = 'methode-anfaenger.json';
export const ANZAHL_PHASEN = 7;

export interface Inhalt {
  /** null, wenn die Methodendatei fehlt oder ungueltig ist. */
  methode: Methode | null;
  /** Gueltige Eintraege in Phasenreihenfolge. */
  eintraege: Eintrag[];
  /** Alle Probleme; leer = Inhalt ist konsistent. */
  probleme: string[];
}

/**
 * Prueft einen Satz Dateien (Schluessel: Pfad relativ zu content/, z. B. "phase-3.json").
 * Fehlende oder verwaiste Dateien und ungueltige Eintraege sind Probleme (nie stillschweigend).
 */
export function pruefeInhalt(files: Readonly<Record<string, unknown>>): Inhalt {
  const probleme: string[] = [];
  const eintraege: Eintrag[] = [];
  const rawMethode = files[METHODE_DATEI];
  if (rawMethode === undefined) {
    probleme.push(`${METHODE_DATEI}: Methodendatei fehlt`);
    for (const path of Object.keys(files)) probleme.push(`${path}: verwaist (keine Methodendatei)`);
    return { methode: null, eintraege, probleme };
  }
  const m = validateMethode(rawMethode);
  if (!m.ok) {
    probleme.push(...m.fehler.map((f) => `${METHODE_DATEI}: ${f}`));
    return { methode: null, eintraege, probleme };
  }
  const methode = m.value;
  const nrs = methode.phasen.map((p) => p.nr).sort((a, b) => a - b);
  if (nrs.length !== ANZAHL_PHASEN || nrs.some((n, i) => n !== i + 1)) {
    probleme.push(`${METHODE_DATEI}: genau die Phasen 1..${ANZAHL_PHASEN} erwartet, gefunden: ${nrs.join(', ')}`);
  }
  const referenced = new Set<string>();
  const ids = new Set<string>();
  for (const p of [...methode.phasen].sort((a, b) => a.nr - b.nr)) {
    if (referenced.has(p.datei)) probleme.push(`${p.datei}: von mehreren Phasen referenziert`);
    referenced.add(p.datei);
    const raw = files[p.datei];
    if (raw === undefined) {
      probleme.push(`${p.datei}: Datei fehlt (Phase ${p.nr})`);
      continue;
    }
    const v = validateEntry(raw);
    if (!v.ok) {
      probleme.push(...v.fehler.map((f) => `${p.datei}: ${f}`));
      continue;
    }
    const e = v.value;
    if (e.id !== p.id) probleme.push(`${p.datei}: id "${e.id}" passt nicht zur Methode ("${p.id}")`);
    if (e.phase !== p.nr) probleme.push(`${p.datei}: phase ${e.phase} passt nicht zur Methode (${p.nr})`);
    if (e.typ !== p.typ) probleme.push(`${p.datei}: typ "${e.typ}" passt nicht zur Methode ("${p.typ}")`);
    if (ids.has(e.id)) probleme.push(`${p.datei}: id "${e.id}" doppelt`);
    ids.add(e.id);
    eintraege.push(e);
  }
  for (const path of Object.keys(files)) {
    if (path !== METHODE_DATEI && !referenced.has(path)) probleme.push(`${path}: verwaist (in keiner Phase der Methode genannt)`);
  }
  return { methode, eintraege, probleme };
}

const modules = import.meta.glob('./**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const files: Record<string, unknown> = Object.fromEntries(Object.entries(modules).map(([k, v]) => [k.replace(/^\.\//, ''), v]));

let cached: Inhalt | null = null;

/** Der tatsaechliche Inhalt (einmal geprueft). Wirft nicht; Probleme stehen in `probleme`. */
export function inhalt(): Inhalt {
  cached ??= pruefeInhalt(files);
  return cached;
}

/** Methode samt Eintraegen in Phasenreihenfolge. Wirft bei jedem Problem mit allen Meldungen. */
export function loadMethode(): { methode: Methode; eintraege: Eintrag[] } {
  const i = inhalt();
  if (i.probleme.length > 0 || i.methode === null) {
    throw new Error(`Inhalt ungueltig:\n${i.probleme.join('\n')}`);
  }
  return { methode: i.methode, eintraege: i.eintraege };
}

/** Eintrag zur ID (z. B. "phase-4-gelbes-kreuz"); wirft, wenn unbekannt oder Inhalt ungueltig. */
export function eintrag(id: string): Eintrag {
  const found = loadMethode().eintraege.find((e) => e.id === id);
  if (!found) throw new Error(`Unbekannter Eintrag: ${id}`);
  return found;
}
