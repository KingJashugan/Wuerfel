import { describe, expect, it } from 'vitest';
import { caseSetup, checkSolvesCase, parseMoves, regionsSatisfied, withOrientation, invert } from '../src/cube/adapter';
import { ANZAHL_PHASEN, METHODE_DATEI, inhalt, pruefeInhalt } from '../content/loader';
import { validateEntry, type AlgorithmischerEintrag, type IntuitiverEintrag, type Schritt } from '../content/schema';

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

export async function problemsOfAlgorithmic(e: AlgorithmischerEintrag): Promise<string[]> {
  const problems: string[] = [];
  const at = e.id;
  const moves = parseOrProblem(`${at} algorithmus`, e.algorithmus.zuege, problems);
  const variants = (e.algorithmus.varianten ?? []).map((v) => ({
    name: v.name,
    zuege: v.zuege,
    moves: parseOrProblem(`${at} variante ${v.name}`, v.zuege, problems),
  }));
  const periode = e.algorithmus.periode ?? 1;

  if (moves) {
    checkSchritteEnd(`${at} schritte`, e.algorithmus.schritte, moves.length, problems);
    if (e.algorithmus.trigger.length > 0) {
      const parts = e.algorithmus.trigger.map((t) => parseOrProblem(`${at} trigger ${t.name}`, t.zuege, problems));
      if (parts.every((p): p is string[] => p !== null) && parts.flat().join(' ') !== moves.join(' ')) {
        problems.push(`${at}: Trigger zusammengesetzt (${parts.flat().join(' ')}) ist nicht der Gesamtalgorithmus (${moves.join(' ')})`);
      }
    }
  }

  // Der Algorithmus (periode-mal) muss geschuetzte Bereiche erhalten: auf dem geloesten Wuerfel
  // und auf jedem Fallzustand.
  const algs = [
    ...(moves ? [{ label: 'algorithmus', zuege: e.algorithmus.zuege }] : []),
    ...variants.filter((v) => v.moves).map((v) => ({ label: `variante ${v.name}`, zuege: v.zuege })),
  ];
  const setups = [{ label: 'geloester Wuerfel', setup: 'z2' }];
  for (const f of e.faelle) {
    try {
      setups.push({ label: `fall ${f.id}`, setup: f.setup ?? caseSetup(f.loesung) });
    } catch {
      /* ungueltige Notation wird unten je Fall gemeldet */
    }
  }
  for (const a of algs) {
    for (const s of setups) {
      const broken = await regionsSatisfied(s.setup, repeat(a.zuege, periode), e.ziel.erhalten);
      if (broken.length > 0) {
        problems.push(`${at}: ${a.label} (${periode}x) zerstoert auf ${s.label} dauerhaft: ${broken.join(', ')}`);
      }
    }
  }

  const usedVariants = new Set<string>();
  let realistic = 0;
  for (const f of e.faelle) {
    const label = `${at} fall ${f.id}`;
    const sol = parseOrProblem(`${label} loesung`, f.loesung, problems);
    if (!sol) continue;
    if (f.vorbereitung !== undefined) {
      const prep = parseOrProblem(`${label} vorbereitung`, f.vorbereitung, problems);
      if (prep && sol.slice(0, prep.length).join(' ') !== prep.join(' ')) {
        problems.push(`${label}: vorbereitung (${prep.join(' ')}) ist nicht der Anfang der loesung`);
      }
    }
    const main = moves && containsMoves(sol, moves);
    const variant = variants.find((v) => v.moves && containsMoves(sol, v.moves));
    if (variant) usedVariants.add(variant.name);
    if (!main && !variant) problems.push(`${label}: loesung enthaelt weder den Algorithmus noch eine Variante`);

    let setup: string;
    try {
      setup = f.setup ?? caseSetup(f.loesung);
      if (f.setup !== undefined) parseMoves(f.setup);
    } catch (err) {
      problems.push(`${label}: Setup ungueltig (${(err as Error).message})`);
      continue;
    }
    const missing = await regionsSatisfied(setup, '', e.ziel.erhalten);
    if (missing.length > 0) problems.push(`${label}: vorher nicht erfuellt: ${missing.join(', ')}`);
    const r = await checkSolvesCase({ setup, alg: f.loesung, erhalten: e.ziel.erhalten, erreicht: e.ziel.erreicht, aufTolerant: e.ziel.aufTolerant });
    if (r.vorherSchonErreicht) problems.push(`${label}: Ziel war schon vor der Loesung erreicht (kein echter Fall)`);
    if (!r.ok) {
      problems.push(`${label}: Loesung scheitert, verletzt: ${r.verletzt.join(', ')}`);
    } else if (f.setup !== undefined) {
      const open = await regionsSatisfied(setup, `${f.loesung} ${r.auf}`, ['geloest']);
      if (open.length > 0) realistic++;
    }
  }
  for (const v of variants) {
    if (v.moves && !usedVariants.has(v.name)) problems.push(`${at}: Variante "${v.name}" wird von keinem Fall genutzt`);
  }
  if (!e.ziel.erreicht.includes('geloest') && realistic === 0) {
    problems.push(
      `${at}: Teilziel, aber kein Fall mit eigenem setup, bei dem nach der Loesung der Wuerfel noch nicht geloest ist (realistischer Fall fehlt)`,
    );
  }
  return problems;
}

export async function problemsOfIntuitive(e: IntuitiverEintrag): Promise<string[]> {
  const problems: string[] = [];
  for (const b of e.beispiele) {
    const label = `${e.id} beispiel ${b.id}`;
    const setup = parseOrProblem(`${label} setup`, b.setup, problems);
    const loesung = parseOrProblem(`${label} loesung`, b.loesung, problems);
    if (!setup || !loesung) continue;
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
  ziel: { text: 'Gelbe Ecken sind orientiert.', erhalten: ['zweite-schicht'], erreicht: ['geloest'], aufTolerant: true },
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
      faelle: [{ id: 'twist', name: 'n', erkennung: 'e', loesung: "(R' D' R D)2 U (R' D' R D)4 U'" }],
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

describe('content/*.json', () => {
  const real = inhalt();

  it('Inhalt ist konsistent (Methode, 7 Phasen, keine fehlenden oder verwaisten Dateien, Schema)', () => {
    expect(real.probleme).toEqual([]);
    expect(real.methode).not.toBeNull();
    expect(real.eintraege).toHaveLength(ANZAHL_PHASEN);
  });

  for (const e of real.eintraege) {
    it(`${e.id}: Zugfolgen, Trigger, Schritte und Faelle stimmen`, async () => {
      const problems = e.typ === 'algorithmisch' ? await problemsOfAlgorithmic(e) : await problemsOfIntuitive(e);
      expect(problems).toEqual([]);
    });
  }
});
