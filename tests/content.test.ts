import { describe, expect, it } from 'vitest';
import {
  caseSetup,
  checkSolvesCase,
  invert,
  parseMoves,
  regionsSatisfied,
  stateKey,
  upperLayerInfo,
  withOrientation,
} from '../src/cube/adapter';
import { ANZAHL_PHASEN, METHODE_DATEI, inhalt, pruefeInhalt } from '../content/loader';
import {
  ABLAUF_PRAEFIX,
  hinweisAusTeilen,
  validateEntry,
  voraussetzungVon,
  type AlgorithmischerEintrag,
  type Fall,
  type IntuitiverEintrag,
  type Schritt,
  type Trigger,
  type Vollstaendigkeit,
} from '../content/schema';

// ---------------------------------------------------------------------------
// Pruefungen je Eintrag (auch auf Fixtures angewendet, damit der Checker selbst getestet ist)
// ---------------------------------------------------------------------------

function parseOrProblem(label: string, alg: string, problems: string[]): string[] | null {
  try {
    return parseMoves(alg);
  } catch (e) {
    problems.push(`${label}: Notation ungueltig (${(e as Error).message})`);
    return null;
  }
}

const spaced = (moves: readonly string[]): string => ` ${moves.join(' ')} `;
/** Kommt `needle` als zusammenhaengende Zugfolge (ganze Zuege) in `hay` vor? */
function containsMoves(hay: readonly string[], needle: readonly string[]): boolean {
  return needle.length > 0 && spaced(hay).includes(spaced(needle));
}

function checkSchritteEnd(label: string, schritte: readonly Schritt[], total: number, problems: string[]): void {
  const last = schritte[schritte.length - 1];
  if (last && last.bereich.bis !== total) {
    problems.push(`${label}: Schritte enden bei ${last.bereich.bis}, der Algorithmus hat aber ${total} Zuege`);
  }
}

const repeat = (alg: string, n: number): string => Array(n).fill(alg).join(' ');

interface ParsedVariant {
  name: string;
  zuege: string;
  moves: string[] | null;
}

/** Zerlegung in Trigger und Schritte gegen die Zugfolge pruefen (Algorithmus und Varianten). */
function checkDecomposition(
  label: string,
  moves: readonly string[],
  trigger: readonly Trigger[] | undefined,
  schritte: readonly Schritt[] | undefined,
  problems: string[],
): void {
  if (schritte) checkSchritteEnd(`${label} schritte`, schritte, moves.length, problems);
  if (trigger && trigger.length > 0) {
    const parts = trigger.map((t) => parseOrProblem(`${label} trigger ${t.name}`, t.zuege, problems));
    if (parts.every((p): p is string[] => p !== null) && parts.flat().join(' ') !== moves.join(' ')) {
      problems.push(`${label}: Trigger zusammengesetzt (${parts.flat().join(' ')}) ist nicht die Zugfolge (${moves.join(' ')})`);
    }
  }
}

/** Fläche/Familie eines normalisierten Zuges: "R2" -> "R", "Rw'" -> "Rw". */
const faceOf = (move: string): string => move.replace(/[0-9']+$/, '');

/**
 * Unmittelbar aufeinanderfolgende Zuege auf derselben Flaeche sind nicht kanonisch: sie heben
 * sich auf (U U', U2 U2) oder lassen sich zusammenfassen (U U -> U2). Liefert Beschreibungen mit
 * 1-basierter Stelle.
 */
function mergeableNeighbours(moves: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < moves.length; i++) {
    const a = moves[i] as string;
    const b = moves[i + 1] as string;
    if (faceOf(a) === faceOf(b)) out.push(`"${a} ${b}" (Zug ${i + 1} und ${i + 2})`);
  }
  return out;
}

/** Der Algorithmus (periode-mal) und jede Variante muessen geschuetzte Bereiche erhalten. */
async function checkProtection(
  e: AlgorithmischerEintrag,
  algs: ReadonlyArray<{ label: string; zuege: string }>,
  problems: string[],
): Promise<void> {
  const periode = e.algorithmus.periode ?? 1;
  const setups = [{ label: 'geloester Wuerfel', setup: 'z2' }];
  for (const f of e.faelle) {
    try {
      setups.push({ label: `fall ${f.id}`, setup: f.setup ?? caseSetup(f.loesung) });
    } catch {
      /* ungueltige Notation wird je Fall gemeldet */
    }
  }
  for (const a of algs) {
    for (const s of setups) {
      const broken = await regionsSatisfied(s.setup, repeat(a.zuege, periode), e.ziel.erhalten);
      if (broken.length > 0) {
        problems.push(`${e.id}: ${a.label} (${periode}x) zerstoert auf ${s.label} dauerhaft: ${broken.join(', ')}`);
      }
    }
  }
}

/** Kanonische Form: benachbarte Zuege auf derselben Flaeche zusammenfassen (Summe mod 4), wiederholt. */
function normalizeMoves(moves: readonly string[]): string[] {
  const out: Array<{ face: string; q: number }> = [];
  for (const m of moves) {
    const face = faceOf(m);
    const q = m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1;
    const top = out[out.length - 1];
    if (top && top.face === face) {
      top.q = (top.q + q) % 4;
      if (top.q === 0) out.pop();
    } else {
      out.push({ face, q });
    }
  }
  return out.map(({ face, q }) => (q === 1 ? face : q === 2 ? `${face}2` : `${face}'`));
}

/**
 * Pruefung von `teile`: jedes Teil kanonisch, Algorithmus-/Variantenteile stimmen mit den Zuegen
 * des Eintrags ueberein, die Verkettung (Durchgaenge ausgeschrieben, an den Teilgrenzen
 * kanonisch zusammengefasst) ist genau `loesung`.
 */
function checkTeile(
  e: AlgorithmischerEintrag,
  f: Fall,
  sol: readonly string[],
  moves: readonly string[] | null,
  variants: readonly ParsedVariant[],
  problems: string[],
): void {
  const label = `${e.id} fall ${f.id}`;
  const teile = f.teile;
  if (!teile) return;
  const joined: string[] = [];
  const parsed: Array<string[] | null> = [];
  teile.forEach((t, i) => {
    const tl = `${label} teile[${i}] (${t.art})`;
    const tm = parseOrProblem(`${tl} zuege`, t.zuege, problems);
    parsed.push(tm);
    if (!tm) return;
    for (const n of mergeableNeighbours(tm)) problems.push(`${tl}: aufhebende oder zusammenfassbare Nachbarzuege ${n}`);
    let expected: readonly string[] | null | undefined;
    if (t.art === 'algorithmus') expected = moves;
    if (t.art === 'variante') {
      const v = variants.find((x) => x.name === t.variante);
      if (!v) problems.push(`${tl}: unbekannte variante "${t.variante}"`);
      expected = v?.moves;
    }
    if ((t.art === 'algorithmus' || t.art === 'variante') && expected && expected.join(' ') !== tm.join(' ')) {
      problems.push(`${tl}: zuege (${tm.join(' ')}) entsprechen nicht ${t.art === 'algorithmus' ? 'algorithmus.zuege' : `der Variante "${t.variante}"`} (${expected.join(' ')})`);
    }
    for (let k = 0; k < (t.durchgaenge ?? 1); k++) joined.push(...tm);
  });
  if (parsed.every((p) => p !== null)) {
    const normal = normalizeMoves(joined);
    if (normal.join(' ') !== sol.join(' ')) {
      problems.push(`${label}: Verkettung der teile (${normal.join(' ')}) ergibt nicht die loesung (${sol.join(' ')})`);
    }
  }
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (f.vorbereitung !== undefined) {
    const prep = parseMoves(f.vorbereitung);
    if (teile[0]?.art !== 'vorbereitung' || !first || first.join(' ') !== prep.join(' ')) {
      problems.push(`${label}: vorbereitung (${prep.join(' ')}) passt nicht zum ersten Teil (art vorbereitung)`);
    }
  }
  if (f.nachbereitung !== undefined) {
    const post = parseMoves(f.nachbereitung);
    if (teile[teile.length - 1]?.art !== 'nachbereitung' || !last || last.join(' ') !== post.join(' ')) {
      problems.push(`${label}: nachbereitung (${post.join(' ')}) passt nicht zum letzten Teil (art nachbereitung)`);
    }
  }
}

/** `hinweis` darf nur dann mit "Ablauf:" beginnen, wenn er genau dem aus `teile` erzeugten Text entspricht. */
function checkAblaufHinweis(e: AlgorithmischerEintrag, f: Fall, problems: string[]): void {
  if (f.hinweis === undefined || !f.hinweis.trim().startsWith(ABLAUF_PRAEFIX)) return;
  const label = `${e.id} fall ${f.id}`;
  const generated = hinweisAusTeilen(f, e.algorithmus);
  if (generated === null) {
    problems.push(`${label}: hinweis beginnt mit "${ABLAUF_PRAEFIX}", der Fall hat aber keine teile (Ablauftext entfernen; die Oberflaeche erzeugt ihn aus teile)`);
  } else if (f.hinweis.trim() !== generated) {
    problems.push(`${label}: hinweis weicht vom erzeugten Ablauftext ab ("${generated}"); Ablauftext entfernen oder exakt uebernehmen`);
  }
}

/** Ohne `teile` muss die Loesung genau [vorbereitung] + ein Algorithmus-/Variantendurchgang + [nachbereitung] sein. */
function checkTeilePflicht(
  e: AlgorithmischerEintrag,
  f: Fall,
  sol: readonly string[],
  moves: readonly string[] | null,
  variants: readonly ParsedVariant[],
  problems: string[],
): void {
  if (f.teile) return;
  const label = `${e.id} fall ${f.id}`;
  const prep = f.vorbereitung !== undefined ? parseMoves(f.vorbereitung) : [];
  const post = f.nachbereitung !== undefined ? parseMoves(f.nachbereitung) : [];
  const core = sol.slice(prep.length, sol.length - post.length).join(' ');
  const known = [moves, ...variants.map((v) => v.moves)].filter((m): m is string[] => m !== null);
  if (!known.some((m) => m.join(' ') === core)) {
    problems.push(`${label}: teile fehlen (die Loesung ist mehr als ein Algorithmusdurchgang mit Vor- und Nachbereitung)`);
  }
}

/** Ein Fall: Notation, Struktur (Vor-/Nachbereitung, teile), Ausgangszustand und Loesung. Liefert Setup und Befunde. */
async function checkCase(
  e: AlgorithmischerEintrag,
  f: Fall,
  moves: readonly string[] | null,
  variants: readonly ParsedVariant[],
  problems: string[],
): Promise<{ setup: string | null; usedVariant: string | null; realistic: boolean }> {
  const label = `${e.id} fall ${f.id}`;
  const result = { setup: null as string | null, usedVariant: null as string | null, realistic: false };
  const sol = parseOrProblem(`${label} loesung`, f.loesung, problems);
  if (!sol) return result;
  for (const n of mergeableNeighbours(sol)) problems.push(`${label}: aufhebende oder zusammenfassbare Nachbarzuege ${n}`);
  const prep = f.vorbereitung !== undefined ? parseOrProblem(`${label} vorbereitung`, f.vorbereitung, problems) : null;
  const post = f.nachbereitung !== undefined ? parseOrProblem(`${label} nachbereitung`, f.nachbereitung, problems) : null;
  if (prep && sol.slice(0, prep.length).join(' ') !== prep.join(' ')) {
    problems.push(`${label}: vorbereitung (${prep.join(' ')}) ist nicht der Anfang der loesung`);
  }
  if (post && sol.slice(sol.length - post.length).join(' ') !== post.join(' ')) {
    problems.push(`${label}: nachbereitung (${post.join(' ')}) ist nicht das Ende der loesung`);
  }
  if (prep && post && prep.length + post.length > sol.length) {
    problems.push(`${label}: vorbereitung und nachbereitung ueberlappen sich in der loesung`);
  }
  checkTeile(e, f, sol, moves, variants, problems);
  checkTeilePflicht(e, f, sol, moves, variants, problems);
  checkAblaufHinweis(e, f, problems);

  const main = moves !== null && containsMoves(sol, moves);
  const variant = variants.find((v) => v.moves && containsMoves(sol, v.moves));
  if (variant) result.usedVariant = variant.name;
  if (!main && !variant) problems.push(`${label}: loesung enthaelt weder den Algorithmus noch eine Variante`);

  let setup: string;
  try {
    setup = f.setup ?? caseSetup(f.loesung);
    if (f.setup !== undefined) parseMoves(f.setup);
  } catch (err) {
    problems.push(`${label}: Setup ungueltig (${(err as Error).message})`);
    return result;
  }
  result.setup = setup;
  const missing = await regionsSatisfied(setup, '', e.ziel.erhalten);
  if (missing.length > 0) problems.push(`${label}: vorher nicht erfuellt: ${missing.join(', ')}`);
  const voraussetzung = await regionsSatisfied(setup, '', voraussetzungVon(e));
  if (voraussetzung.length > 0) problems.push(`${label}: voraussetzung vor der Loesung nicht erfuellt: ${voraussetzung.join(', ')}`);
  const r = await checkSolvesCase({ setup, alg: f.loesung, erhalten: e.ziel.erhalten, erreicht: e.ziel.erreicht, aufTolerant: e.ziel.aufTolerant });
  if (r.vorherSchonErreicht) problems.push(`${label}: Ziel war schon vor der Loesung erreicht (kein echter Fall)`);
  if (!r.ok) {
    problems.push(`${label}: Loesung scheitert, verletzt: ${r.verletzt.join(', ')}`);
  } else if (f.setup !== undefined) {
    result.realistic = (await regionsSatisfied(setup, `${f.loesung} ${r.auf}`, ['geloest'])).length > 0;
  }
  return result;
}

/** Ausgangszustaende aller Faelle muessen paarweise verschieden sein. */
async function checkDistinctStates(e: AlgorithmischerEintrag, setups: ReadonlyMap<string, string>, problems: string[]): Promise<void> {
  const seen = new Map<string, string>();
  for (const [id, setup] of setups) {
    const key = await stateKey(setup);
    const other = seen.get(key);
    if (other !== undefined) problems.push(`${e.id}: Faelle "${other}" und "${id}" haben denselben Ausgangszustand`);
    else seen.set(key, id);
  }
}

const isEven = (perm: readonly number[]): boolean => {
  let inversions = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if ((perm[i] as number) > (perm[j] as number)) inversions++;
  return inversions % 2 === 0;
};

const permutationsOf4 = (): number[][] => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]): void => {
    if (rest.length === 0) out.push(cur);
    for (const r of rest) rec([...cur, r], rest.filter((x) => x !== r));
  };
  rec([], [0, 1, 2, 3]);
  return out;
};

/** Kleinste Drehung einer Ziffernfolge: macht Eckenmuster unabhaengig von der Drehung der oberen Schicht (U). */
const canonicalRotation = (s: string): string =>
  [...s].map((_, i) => s.slice(i) + s.slice(0, i)).reduce((a, b) => (b < a ? b : a));

/** Alle Eckendreh-Muster oben (Summe durch 3 teilbar, nicht geloest) bis auf Drehung: es sind genau 7. */
const eckenMuster = (): string[] => {
  const out = new Set<string>();
  for (let n = 1; n < 81; n++) {
    const digits = n.toString(3).padStart(4, '0');
    if ([...digits].reduce((a, d) => a + Number(d), 0) % 3 === 0) out.add(canonicalRotation(digits));
  }
  return [...out];
};

/** Namen der Lagen des gelben Musters oben; Schluessel = Orientierung der oberen Kanten (1 = Gelb zeigt nicht nach oben). */
const GELBE_LAGEN: Readonly<Record<string, string>> = {
  '1111': 'Punkt',
  '0101': 'Linie (Platz 0 und 2)',
  '1010': 'Linie (Platz 1 und 3)',
  '0011': 'Winkel 0',
  '1001': 'Winkel 1',
  '1100': 'Winkel 2',
  '0110': 'Winkel 3',
};

/**
 * Vollstaendigkeit anhand der Ausgangszustaende: Es zaehlen nur Faelle, bei denen auf den oberen
 * Plaetzen ausschliesslich obere Teile sitzen (die unteren Schichten also nicht veraendert sind).
 */
async function checkVollstaendigkeit(e: AlgorithmischerEintrag, setups: ReadonlyMap<string, string>, problems: string[]): Promise<void> {
  if (!e.vollstaendigkeit) return;
  const infos = [];
  for (const setup of setups.values()) infos.push(await upperLayerInfo(setup));
  const missing: string[] = [];
  if (e.vollstaendigkeit === 'kantenpermutation-oben') {
    const have = new Set(infos.filter((i) => !i.edgePermutation.includes(-1) && i.edgeOrientation.every((o) => o === 0)).map((i) => i.edgePermutation.join('')));
    for (const p of permutationsOf4()) if (p.join('') !== '0123' && !have.has(p.join(''))) missing.push(p.join(''));
  } else if (e.vollstaendigkeit === 'eckenpermutation-oben-gerade') {
    const have = new Set(infos.filter((i) => !i.cornerPermutation.includes(-1)).map((i) => i.cornerPermutation.join('')));
    for (const p of permutationsOf4()) if (isEven(p) && p.join('') !== '0123' && !have.has(p.join(''))) missing.push(p.join(''));
  } else if (e.vollstaendigkeit === 'eckenorientierung-oben') {
    // Nur Faelle mit allen oberen Ecken am richtigen Platz; Muster gelten bis auf Drehung der oberen Schicht.
    const have = new Set(
      infos.filter((i) => i.cornerPermutation.join('') === '0123').map((i) => canonicalRotation(i.cornerOrientation.join(''))),
    );
    for (const pattern of eckenMuster()) if (!have.has(pattern)) missing.push(pattern);
  } else {
    const have = new Set(infos.filter((i) => !i.edgePermutation.includes(-1)).map((i) => i.edgeOrientation.join('')));
    for (const [mask, name] of Object.entries(GELBE_LAGEN)) if (!have.has(mask)) missing.push(`${name} (${mask})`);
  }
  if (missing.length > 0) problems.push(`${e.id}: unvollstaendig (${e.vollstaendigkeit}), es fehlen: ${missing.join(', ')}`);
}

/** Ergebnis der Fallpruefung. */
async function checkCases(
  e: AlgorithmischerEintrag,
  moves: readonly string[] | null,
  variants: readonly ParsedVariant[],
  problems: string[],
): Promise<{ usedVariants: Set<string>; realistic: number }> {
  const usedVariants = new Set<string>();
  const setups = new Map<string, string>();
  let realistic = 0;
  for (const f of e.faelle) {
    const r = await checkCase(e, f, moves, variants, problems);
    if (r.usedVariant) usedVariants.add(r.usedVariant);
    if (r.realistic) realistic++;
    if (r.setup !== null) setups.set(f.id, r.setup);
  }
  await checkDistinctStates(e, setups, problems);
  await checkVollstaendigkeit(e, setups, problems);
  return { usedVariants, realistic };
}

async function problemsOfAlgorithmic(e: AlgorithmischerEintrag): Promise<string[]> {
  const problems: string[] = [];
  const moves = parseOrProblem(`${e.id} algorithmus`, e.algorithmus.zuege, problems);
  const variants: ParsedVariant[] = (e.algorithmus.varianten ?? []).map((v) => {
    const vmoves = parseOrProblem(`${e.id} variante ${v.name}`, v.zuege, problems);
    if (vmoves) checkDecomposition(`${e.id} variante ${v.name}`, vmoves, v.trigger, v.schritte, problems);
    return { name: v.name, zuege: v.zuege, moves: vmoves };
  });
  if (moves) checkDecomposition(e.id, moves, e.algorithmus.trigger, e.algorithmus.schritte, problems);

  await checkProtection(
    e,
    [
      ...(moves ? [{ label: 'algorithmus', zuege: e.algorithmus.zuege }] : []),
      ...variants.filter((v) => v.moves).map((v) => ({ label: `variante ${v.name}`, zuege: v.zuege })),
    ],
    problems,
  );
  const { usedVariants, realistic } = await checkCases(e, moves, variants, problems);
  for (const v of variants) {
    if (v.moves && !usedVariants.has(v.name)) problems.push(`${e.id}: Variante "${v.name}" wird von keinem Fall genutzt`);
  }
  if (!e.ziel.erreicht.includes('geloest') && realistic === 0) {
    problems.push(
      `${e.id}: Teilziel, aber kein Fall mit eigenem setup, bei dem nach der Loesung der Wuerfel noch nicht geloest ist (realistischer Fall fehlt)`,
    );
  }
  return problems;
}

async function problemsOfIntuitive(e: IntuitiverEintrag): Promise<string[]> {
  const problems: string[] = [];
  for (const b of e.beispiele) {
    const label = `${e.id} beispiel ${b.id}`;
    const setup = parseOrProblem(`${label} setup`, b.setup, problems);
    const loesung = parseOrProblem(`${label} loesung`, b.loesung, problems);
    if (!setup || !loesung) continue;
    for (const [what, moves] of [['setup', setup], ['loesung', loesung]] as const) {
      for (const n of mergeableNeighbours(moves)) problems.push(`${label}: aufhebende oder zusammenfassbare Nachbarzuege in ${what} ${n}`);
    }
    if (b.schritte) checkSchritteEnd(`${label} schritte`, b.schritte, loesung.length, problems);
    const r = await checkSolvesCase({
      setup: withOrientation(b.setup),
      alg: b.loesung,
      erhalten: e.ziel.erhalten,
      erreicht: e.ziel.erreicht,
      aufTolerant: e.ziel.aufTolerant,
    });
    if (r.vorherSchonErreicht) problems.push(`${label}: Ziel war schon vor der Loesung erreicht`);
    if (!r.ok) problems.push(`${label}: Loesung scheitert, verletzt: ${r.verletzt.join(', ')}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Selbstpruefung des Checkers mit Fixtures
// ---------------------------------------------------------------------------

const SUNE = "R U R' U R U2 R'";
const FRU = "F R U R' U' F'";
const CYCLE = "U R U' L' U R' U' L";

/** Vollziel (geloest): keine realistischen Faelle noetig. */
const fixtureSune = (): AlgorithmischerEintrag => ({
  typ: 'algorithmisch',
  id: 'fixture-sune',
  phase: 7,
  titel: 'Fixture Sune',
  ziel: { text: 'Gelbe Ecken sind orientiert.', erhalten: ['zweite-schicht'], erreicht: ['geloest'], aufTolerant: true, voraussetzung: ['zweite-schicht'] },
  algorithmus: {
    name: 'Sune',
    zuege: SUNE,
    trigger: [
      { name: 'A', zuege: "R U R'", erklaerung: 'x' },
      { name: 'B', zuege: "U R U2 R'", erklaerung: 'y' },
    ],
    schritte: [
      { bereich: { von: 0, bis: 3 }, text: 'a' },
      { bereich: { von: 3, bis: 7 }, text: 'b' },
    ],
  },
  faelle: [
    { id: 'sune', name: 'Sune', erkennung: 'e', loesung: SUNE },
    { id: 'sune-auf', name: 'Sune mit AUF', erkennung: 'e', vorbereitung: 'U', loesung: `U ${SUNE}` },
  ],
});

/** Teilziel (gelbes Kreuz): braucht einen realistischen Fall mit eigenem setup. */
const fixtureCross = (): AlgorithmischerEintrag => ({
  typ: 'algorithmisch',
  id: 'fixture-kreuz',
  phase: 4,
  titel: 'Fixture Kreuz',
  ziel: { text: 'Kreuz.', erhalten: ['zweite-schicht'], erreicht: ['gelbes-kreuz'], aufTolerant: false },
  algorithmus: {
    name: 'FRU',
    zuege: FRU,
    trigger: [{ name: 'alles', zuege: FRU, erklaerung: 'x' }],
    schritte: [{ bereich: { von: 0, bis: 6 }, text: 'a' }],
  },
  faelle: [
    { id: 'linie', name: 'Linie', erkennung: 'e', loesung: FRU },
    // Spaetere Phasen offen: die Sune bleibt nach der Loesung im Wuerfel stehen.
    { id: 'linie-offen', name: 'Linie, Rest ungeloest', erkennung: 'e', loesung: FRU, setup: `z2 ${SUNE} ${invert(FRU)}` },
  ],
});

const fixtureIntuitive = (): IntuitiverEintrag => ({
  typ: 'intuitiv',
  id: 'fixture-kreuz',
  phase: 1,
  titel: 'Fixture Kreuz',
  ziel: { text: 'Kreuz unten.', erhalten: [], erreicht: ['kreuz-unten'], aufTolerant: false },
  prinzip: 'p',
  beispiele: [{ id: 'bsp-1', beschreibung: 'b', setup: "F' U", loesung: "U' F", schritte: [{ bereich: { von: 0, bis: 2 }, text: 's' }] }],
});

const text = (p: string[]): string => p.join('\n');

describe('Checker-Selbstpruefung (Fixtures)', () => {
  it('Fixtures sind schema-gueltig und fehlerfrei', async () => {
    for (const e of [fixtureSune(), fixtureCross(), fixtureIntuitive()]) expect(validateEntry(e).ok).toBe(true);
    expect(await problemsOfAlgorithmic(fixtureSune())).toEqual([]);
    expect(await problemsOfAlgorithmic(fixtureCross())).toEqual([]);
    expect(await problemsOfIntuitive(fixtureIntuitive())).toEqual([]);
  });
  it('erkennt falsche Trigger-Zerlegung', async () => {
    const e = fixtureSune();
    e.algorithmus.trigger[1]!.zuege = "U R U R'";
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Trigger zusammengesetzt/);
  });
  it('erkennt Schritte, die nicht bis zum Ende reichen', async () => {
    const e = fixtureSune();
    e.algorithmus.schritte = [{ bereich: { von: 0, bis: 5 }, text: 'a' }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Schritte enden bei 5/);
  });
  it('erkennt ungueltige Notation', async () => {
    const e = fixtureSune();
    e.algorithmus.zuege = 'R Q';
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Notation ungueltig/);
  });
  it('erkennt Fall, dessen Loesung scheitert (gekuerzter Algorithmus)', async () => {
    const e = fixtureSune();
    e.faelle[0]!.setup = caseSetup(SUNE);
    e.faelle[0]!.loesung = "R U R' U R";
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/fall sune: Loesung scheitert/);
  });
  it('erkennt Fall, dessen Loesung den Algorithmus nicht enthaelt', async () => {
    const e = fixtureSune();
    e.faelle[0]!.loesung = "R U R' U R U2 R2'"; // gleicher Anfang, anderer Schluss
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/weder den Algorithmus noch eine Variante/);
  });
  it('erkennt Algorithmus, der geschuetzte Bereiche dauerhaft zerstoert', async () => {
    const e = fixtureCross();
    e.algorithmus.zuege = "F R U R' U'"; // letztes F' fehlt
    e.algorithmus.trigger = [{ name: 'alles', zuege: "F R U R' U'", erklaerung: 'x' }];
    e.algorithmus.schritte = [{ bereich: { von: 0, bis: 5 }, text: 'a' }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/zerstoert auf geloester Wuerfel dauerhaft: zweite-schicht/);
  });
  it('periode: R\' D\' R D ist nur mit periode 6 erlaubt', async () => {
    const mk = (periode?: number): AlgorithmischerEintrag => ({
      ...fixtureSune(),
      id: 'fixture-twist',
      ziel: { text: 't', erhalten: ['gelbe-ecken-position'], erreicht: ['geloest'], aufTolerant: true },
      algorithmus: {
        name: 'RDRD',
        zuege: "R' D' R D",
        trigger: [],
        schritte: [{ bereich: { von: 0, bis: 4 }, text: 'a' }],
        ...(periode ? { periode } : {}),
      },
      faelle: [
        {
          id: 'twist',
          name: 'n',
          erkennung: 'e',
          loesung: "(R' D' R D)2 U (R' D' R D)4 U'",
          teile: [
            { art: 'algorithmus', zuege: "R' D' R D", durchgaenge: 2 },
            { art: 'zwischen', zuege: 'U' },
            { art: 'algorithmus', zuege: "R' D' R D", durchgaenge: 4 },
            { art: 'nachbereitung', zuege: "U'" },
          ],
          nachbereitung: "U'",
        },
      ],
    });
    expect(text(await problemsOfAlgorithmic(mk()))).toMatch(/zerstoert/);
    expect(await problemsOfAlgorithmic(mk(6))).toEqual([]);
  });
  it('erkennt Variante ohne Fall und Variante, die selbst zerstoert', async () => {
    const e = fixtureSune();
    e.algorithmus.varianten = [{ name: 'Spiegel', zuege: "L' U' L U' L' U2 L" }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Variante "Spiegel" wird von keinem Fall genutzt/);
    e.faelle.push({ id: 'links', name: 'n', erkennung: 'e', loesung: "L' U' L U' L' U2 L" });
    expect(await problemsOfAlgorithmic(e)).toEqual([]);
    e.algorithmus.varianten = [{ name: 'Spiegel', zuege: 'R' }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/variante Spiegel/);
  });
  it('erkennt vorbereitung, die nicht am Anfang der loesung steht', async () => {
    const e = fixtureSune();
    e.faelle[1]!.vorbereitung = 'U2';
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/vorbereitung .* ist nicht der Anfang/);
  });
  it('Teilziel ohne Fall mit eigenem setup scheitert', async () => {
    const e = fixtureCross();
    e.faelle = [{ id: 'linie', name: 'Linie', erkennung: 'e', loesung: FRU }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/realistischer Fall fehlt/);
  });
  it('realistischer Fall muss wirklich noch offen sein', async () => {
    const e = fixtureCross();
    // setup ohne Rest-Scramble: nach der Loesung ist alles geloest
    e.faelle[1]!.setup = caseSetup(FRU);
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/realistischer Fall fehlt/);
  });
  it('realistischer Fall mit Ecken-Zyklus (Teilziel Kanten) wird akzeptiert', async () => {
    const e: AlgorithmischerEintrag = {
      ...fixtureCross(),
      id: 'fixture-kanten',
      phase: 5,
      ziel: { text: 't', erhalten: ['gelbes-kreuz'], erreicht: ['gelbe-kanten-position'], aufTolerant: false },
      algorithmus: {
        name: 'Sune plus U',
        zuege: `${SUNE} U`,
        trigger: [],
        schritte: [{ bereich: { von: 0, bis: 8 }, text: 'a' }],
      },
      faelle: [{ id: 'f', name: 'n', erkennung: 'e', loesung: `${SUNE} U`, setup: `z2 ${CYCLE} ${invert(`${SUNE} U`)}` }],
    };
    expect(await problemsOfAlgorithmic(e)).toEqual([]);
  });
  it('erkennt Fall, dessen Ziel schon erreicht ist', async () => {
    const e = fixtureSune();
    e.faelle = [{ id: 'leer', name: 'n', erkennung: 'e', loesung: SUNE, setup: 'z2' }];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Loesung scheitert|schon vor der Loesung/);
    const f = fixtureCross();
    f.faelle = [{ id: 'leer', name: 'n', erkennung: 'e', loesung: FRU, setup: 'z2' }];
    expect(text(await problemsOfAlgorithmic(f))).toMatch(/schon vor der Loesung erreicht/);
  });
  it('erkennt nachbereitung, die nicht das Ende der loesung ist', async () => {
    const e = fixtureSune();
    e.faelle[1] = { id: 'sune-nach', name: 'n', erkennung: 'e', loesung: `${SUNE} U`, nachbereitung: 'U' };
    expect(await problemsOfAlgorithmic(e)).toEqual([]);
    e.faelle[1]!.nachbereitung = "U'";
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/nachbereitung .* ist nicht das Ende/);
  });
  it('prueft Trigger und Schritte einer Variante gegen deren Zuege', async () => {
    const mk = (trigger: Trigger[], schritte: Schritt[]): AlgorithmischerEintrag => {
      const e = fixtureSune();
      e.algorithmus.varianten = [{ name: 'Spiegel', zuege: "L' U' L U' L' U2 L", trigger, schritte }];
      e.faelle.push({ id: 'links', name: 'n', erkennung: 'e', loesung: "L' U' L U' L' U2 L" });
      return e;
    };
    const ok = mk([{ name: 'a', zuege: "L' U' L", erklaerung: 'x' }, { name: 'b', zuege: "U' L' U2 L", erklaerung: 'y' }], [{ bereich: { von: 0, bis: 7 }, text: 't' }]);
    expect(await problemsOfAlgorithmic(ok)).toEqual([]);
    const badTrigger = mk([{ name: 'a', zuege: "L' U' L", erklaerung: 'x' }], []);
    expect(text(await problemsOfAlgorithmic(badTrigger))).toMatch(/variante Spiegel: Trigger zusammengesetzt/);
    const badSteps = mk([], [{ bereich: { von: 0, bis: 6 }, text: 't' }]);
    expect(text(await problemsOfAlgorithmic(badSteps))).toMatch(/variante Spiegel schritte: Schritte enden bei 6/);
  });
  it('meldet aufhebende und zusammenfassbare Nachbarzuege in der loesung mit Fall-ID und Stelle', async () => {
    for (const [loesung, pair, pos] of [
      [`U U' ${SUNE}`, "U U'", 'Zug 1 und 2'],
      [`${SUNE} U U`, 'U U', 'Zug 8 und 9'],
      [`U2 U2 ${SUNE}`, 'U2 U2', 'Zug 1 und 2'],
      [`F' F ${SUNE}`, "F' F", 'Zug 1 und 2'],
      [`U U2 ${SUNE}`, 'U U2', 'Zug 1 und 2'],
    ] as const) {
      const e = fixtureSune();
      e.faelle[0]!.loesung = loesung;
      e.faelle[0]!.setup = caseSetup(SUNE);
      const t = text(await problemsOfAlgorithmic(e));
      expect(t, loesung).toContain('fixture-sune fall sune');
      expect(t, loesung).toContain(`"${pair}" (${pos})`);
    }
  });
  it('Nachbarzuege auf verschiedenen Flaechen oder durch andere Zuege getrennt sind erlaubt', async () => {
    const e = fixtureSune();
    e.faelle[0]!.loesung = `U D ${SUNE}`;
    e.faelle[0]!.setup = caseSetup(`U D ${SUNE}`);
    expect(text(await problemsOfAlgorithmic(e))).not.toMatch(/Nachbarzuege/);
  });
  describe('teile', () => {
    const SUNE_ALG = SUNE;
    /** Eintrag mit einem Fall: U + Sune + U2, dazu passende teile. */
    const withCase = (over: Partial<Fall>): AlgorithmischerEintrag => {
      const e = fixtureSune();
      e.faelle = [
        {
          id: 'f',
          name: 'n',
          erkennung: 'e',
          loesung: `U ${SUNE_ALG} U2`,
          vorbereitung: 'U',
          nachbereitung: 'U2',
          teile: [
            { art: 'vorbereitung', zuege: 'U' },
            { art: 'algorithmus', zuege: SUNE_ALG },
            { art: 'nachbereitung', zuege: 'U2' },
          ],
          ...over,
        },
      ];
      return e;
    };
    const plain = (e: AlgorithmischerEintrag, drop: Array<'teile' | 'vorbereitung' | 'nachbereitung'>): AlgorithmischerEintrag => {
      for (const k of drop) delete e.faelle[0]![k];
      return e;
    };
    it('gueltige teile werden akzeptiert', async () => {
      expect(await problemsOfAlgorithmic(withCase({}))).toEqual([]);
    });
    it('Verkettung muss die loesung ergeben (an Teilgrenzen darf zusammengefasst werden)', async () => {
      const bad = withCase({ teile: [{ art: 'algorithmus', zuege: SUNE_ALG }, { art: 'nachbereitung', zuege: 'U2' }] });
      expect(text(await problemsOfAlgorithmic(bad))).toMatch(/Verkettung der teile/);
      // U (Vorbereitung) + U (Zwischenzug) werden in der kanonischen Loesung zu U2
      const merged = plain(
        withCase({
          loesung: `U2 ${SUNE_ALG}`,
          teile: [{ art: 'vorbereitung', zuege: 'U' }, { art: 'zwischen', zuege: 'U' }, { art: 'algorithmus', zuege: SUNE_ALG }],
        }),
        ['vorbereitung', 'nachbereitung'],
      );
      expect(text(await problemsOfAlgorithmic(merged))).not.toMatch(/Verkettung/);
    });
    it('algorithmus-Teil muss algorithmus.zuege entsprechen; Variante muss existieren', async () => {
      const wrong = withCase({ teile: [{ art: 'vorbereitung', zuege: 'U' }, { art: 'algorithmus', zuege: FRU }, { art: 'nachbereitung', zuege: 'U2' }] });
      expect(text(await problemsOfAlgorithmic(wrong))).toMatch(/entsprechen nicht algorithmus.zuege/);
      const unknown = withCase({ teile: [{ art: 'variante', variante: 'Nix', zuege: SUNE_ALG }] });
      expect(text(await problemsOfAlgorithmic(unknown))).toMatch(/unbekannte variante "Nix"/);
    });
    it('durchgaenge werden ausgeschrieben; Zwischenzuege sind erlaubt', async () => {
      const two = plain(
        withCase({
          loesung: `${SUNE_ALG} U2 ${SUNE_ALG}`,
          teile: [{ art: 'algorithmus', zuege: SUNE_ALG }, { art: 'zwischen', zuege: 'U2' }, { art: 'algorithmus', zuege: SUNE_ALG }],
        }),
        ['vorbereitung', 'nachbereitung'],
      );
      expect(text(await problemsOfAlgorithmic(two))).not.toMatch(/Verkettung|teile fehlen/);
      const dg = plain(
        withCase({ loesung: "R U R' U R U' R' U R U2 R'", teile: [{ art: 'algorithmus', zuege: SUNE_ALG, durchgaenge: 2 }] }),
        ['vorbereitung', 'nachbereitung'],
      );
      expect(text(await problemsOfAlgorithmic(dg))).not.toMatch(/Verkettung/);
    });
    it('vorbereitung/nachbereitung muessen zum ersten/letzten Teil passen', async () => {
      const noPrepPart = withCase({
        loesung: `${SUNE_ALG} U2`,
        teile: [{ art: 'algorithmus', zuege: SUNE_ALG }, { art: 'nachbereitung', zuege: 'U2' }],
      });
      expect(text(await problemsOfAlgorithmic(noPrepPart))).toMatch(/vorbereitung .* passt nicht zum ersten Teil/);
      const noPostPart = withCase({ teile: [{ art: 'vorbereitung', zuege: 'U' }, { art: 'algorithmus', zuege: SUNE_ALG }, { art: 'zwischen', zuege: 'U2' }] });
      expect(text(await problemsOfAlgorithmic(noPostPart))).toMatch(/nachbereitung .* passt nicht zum letzten Teil/);
    });
    it('teile sind Pflicht bei mehr als einem Durchgang oder Zwischenzuegen', async () => {
      const multi = plain(withCase({ loesung: `${SUNE_ALG} U2 ${SUNE_ALG}` }), ['teile', 'vorbereitung', 'nachbereitung']);
      expect(text(await problemsOfAlgorithmic(multi))).toMatch(/fall f: teile fehlen/);
      const simple = plain(withCase({}), ['teile']);
      expect(text(await problemsOfAlgorithmic(simple))).not.toMatch(/teile fehlen/);
    });
    it('hinweis mit "Ablauf:" muss dem erzeugten Text entsprechen', async () => {
      expect(await problemsOfAlgorithmic(withCase({ hinweis: 'Ablauf: U – Sune – U2.' }))).toEqual([]);
      expect(text(await problemsOfAlgorithmic(withCase({ hinweis: 'Ablauf: Sune.' })))).toMatch(/weicht vom erzeugten Ablauftext ab/);
      const noTeile = plain(withCase({ hinweis: 'Ablauf: U – Sune – U2.' }), ['teile']);
      expect(text(await problemsOfAlgorithmic(noTeile))).toMatch(/keine teile/);
      expect(await problemsOfAlgorithmic(withCase({ hinweis: 'Kein Ablauf hier.' }))).toEqual([]);
    });
    it('vorbereitung und nachbereitung duerfen sich nicht ueberlappen', async () => {
      const e = plain(withCase({ loesung: SUNE_ALG, vorbereitung: "R U R' U", nachbereitung: "U R U2 R'" }), ['teile']);
      expect(text(await problemsOfAlgorithmic(e))).toMatch(/ueberlappen/);
    });
  });
  it('voraussetzung wird strikt vor der Loesung geprueft', async () => {
    const e = fixtureSune();
    e.ziel.voraussetzung = ['gelbe-kanten-position']; // nach inverser Sune sind die Kanten vertauscht
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/voraussetzung vor der Loesung nicht erfuellt: gelbe-kanten-position/);
  });
  it('ohne ziel.voraussetzung gilt der Stand der Vorphase', async () => {
    const e = fixtureSune(); // phase 7 -> gelbe-ecken-position
    delete e.ziel.voraussetzung;
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/voraussetzung vor der Loesung nicht erfuellt: gelbe-ecken-position/);
  });
  it('Faelle mit identischem Ausgangszustand werden mit beiden IDs gemeldet', async () => {
    const e = fixtureSune();
    e.faelle = [
      { id: 'a', name: 'n', erkennung: 'e', loesung: SUNE },
      { id: 'b', name: 'n', erkennung: 'e', loesung: SUNE },
    ];
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/Faelle "a" und "b" haben denselben Ausgangszustand/);
  });
  it('Vollstaendigkeit gelbe-lagen: Fixture mit zu wenigen Faellen meldet fehlende Lagen mit Namen', async () => {
    const e = fixtureCross();
    e.vollstaendigkeit = 'gelbe-lagen';
    expect(text(await problemsOfAlgorithmic(e))).toMatch(/es fehlen: .*Punkt/);
  });
  it('aufhebende Nachbarzuege in intuitiven Beispielen (setup und loesung) werden gemeldet', async () => {
    const e = fixtureIntuitive();
    e.beispiele[0]!.setup = "F' U U'";
    expect(text(await problemsOfIntuitive(e))).toMatch(/in setup "U U'" \(Zug 2 und 3\)/);
    const f = fixtureIntuitive();
    f.beispiele[0]!.loesung = "U' F F";
    expect(text(await problemsOfIntuitive(f))).toMatch(/in loesung "F F"/);
  });
  it('erkennt falsches intuitives Beispiel', async () => {
    const e = fixtureIntuitive();
    e.beispiele[0]!.loesung = 'R2 B';
    expect(text(await problemsOfIntuitive(e))).toMatch(/scheitert/);
  });
});

// ---------------------------------------------------------------------------
// Lader/Querpruefung mit Fixture-Dateien
// ---------------------------------------------------------------------------

function fixtureFiles(): Record<string, unknown> {
  const phasen = [1, 2, 3, 4, 5, 6, 7].map((nr) => ({
    nr,
    id: `p-${nr}`,
    titel: `Phase ${nr}`,
    typ: nr <= 2 ? 'intuitiv' : 'algorithmisch',
    datei: `phase-${nr}.json`,
  }));
  const files: Record<string, unknown> = {
    [METHODE_DATEI]: { id: 'anfaenger', orientierung: 'o', phasen },
  };
  for (const p of phasen) {
    const base = p.nr <= 2 ? { ...fixtureIntuitive(), phase: p.nr } : { ...fixtureSune(), phase: p.nr };
    files[p.datei] = { ...base, id: p.id };
  }
  return files;
}

describe('pruefeInhalt (Lader)', () => {
  it('konsistenter Fixture-Inhalt hat keine Probleme', () => {
    const r = pruefeInhalt(fixtureFiles());
    expect(r.probleme).toEqual([]);
    expect(r.eintraege.map((e) => e.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('fehlende Methodendatei ist ein Fehler (auch bei leerem content)', () => {
    expect(pruefeInhalt({}).probleme.join('\n')).toMatch(/Methodendatei fehlt/);
    const f = fixtureFiles();
    delete f[METHODE_DATEI];
    expect(pruefeInhalt(f).probleme.join('\n')).toMatch(/verwaist/);
  });
  it('fehlende Phasendatei, verwaiste Datei, falsche Phasenzahl', () => {
    const missing = fixtureFiles();
    delete missing['phase-5.json'];
    expect(pruefeInhalt(missing).probleme.join('\n')).toMatch(/phase-5.json: Datei fehlt/);
    const orphan = { ...fixtureFiles(), 'phase-8.json': fixtureSune() };
    expect(pruefeInhalt(orphan).probleme.join('\n')).toMatch(/phase-8.json: verwaist/);
    const short = fixtureFiles();
    (short[METHODE_DATEI] as { phasen: unknown[] }).phasen.pop();
    const p = pruefeInhalt(short).probleme.join('\n');
    expect(p).toMatch(/genau die Phasen 1..7/);
    expect(p).toMatch(/phase-7.json: verwaist/);
  });
  it('ungueltiger Eintrag und Abweichungen von der Methode werden gemeldet, nichts wird uebersprungen', () => {
    const bad = fixtureFiles();
    const patch = (k: string, o: Record<string, unknown>): void => {
      bad[k] = { ...(bad[k] as object), ...o };
    };
    patch('phase-3.json', { phase: 9 });
    patch('phase-4.json', { id: 'anders' });
    patch('phase-5.json', { typ: 'intuitiv' });
    const p = pruefeInhalt(bad).probleme.join('\n');
    expect(p).toMatch(/phase-3.json: phase/);
    expect(p).toMatch(/phase-4.json: id "anders" passt nicht/);
    expect(p).toMatch(/phase-5.json/);
  });
  it('ANZAHL_PHASEN ist 7', () => {
    expect(ANZAHL_PHASEN).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Echte Inhalte (content/*.json)
// ---------------------------------------------------------------------------

/** Pflicht-Vollstaendigkeit je Phase der echten Inhalte. */
const PFLICHT_VOLLSTAENDIGKEIT: Readonly<Record<number, Vollstaendigkeit | undefined>> = {
  4: 'gelbe-lagen',
  5: 'kantenpermutation-oben',
  6: 'eckenpermutation-oben-gerade',
  7: 'eckenorientierung-oben',
};

describe('content/*.json', () => {
  const real = inhalt();

  it('Inhalt ist konsistent (Methode, 7 Phasen, keine fehlenden oder verwaisten Dateien, Schema)', () => {
    expect(real.probleme).toEqual([]);
    expect(real.methode).not.toBeNull();
    expect(real.eintraege).toHaveLength(ANZAHL_PHASEN);
  });

  it('Vollstaendigkeitspruefung schlaegt bei gekuerzten echten Phasen an und besteht mit allen Faellen', async () => {
    for (const phase of [4, 5, 6, 7]) {
      const base = real.eintraege.find((x) => x.phase === phase);
      if (base?.typ !== 'algorithmisch') continue;
      const e: AlgorithmischerEintrag = { ...structuredClone(base), vollstaendigkeit: PFLICHT_VOLLSTAENDIGKEIT[phase] };
      const gaps = (p: string[]): string[] => p.filter((x) => x.includes('unvollstaendig'));
      expect(gaps(await problemsOfAlgorithmic(e)), `Phase ${phase} vollstaendig`).toEqual([]);
      const cut = { ...e, faelle: e.faelle.slice(0, 2) };
      expect(gaps(await problemsOfAlgorithmic(cut)), `Phase ${phase} gekuerzt`).toHaveLength(1);
    }
  });

  it('Phase 4 bis 7 deklarieren ihre vollstaendigkeit', () => {
    for (const e of real.eintraege) {
      if (e.typ === 'algorithmisch' && PFLICHT_VOLLSTAENDIGKEIT[e.phase]) {
        expect(e.vollstaendigkeit, `${e.id}: vollstaendigkeit`).toBe(PFLICHT_VOLLSTAENDIGKEIT[e.phase]);
      }
    }
  });

  for (const e of real.eintraege) {
    it(`${e.id}: Zugfolgen, Trigger, Schritte und Faelle stimmen`, async () => {
      // Fehlt die Deklaration, wird die Pflicht-Vollstaendigkeit trotzdem geprueft (Luecken sichtbar).
      const effective = e.typ === 'algorithmisch' ? { ...e, vollstaendigkeit: e.vollstaendigkeit ?? PFLICHT_VOLLSTAENDIGKEIT[e.phase] } : e;
      const problems = effective.typ === 'algorithmisch' ? await problemsOfAlgorithmic(effective) : await problemsOfIntuitive(effective);
      expect(problems).toEqual([]);
    });
  }
});
