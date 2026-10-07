import { describe, expect, it } from 'vitest';
import {
  caseSetup,
  checkSolvesCase,
  parseMoves,
  regionsSatisfied,
  statesEqual,
  withOrientation,
} from '../src/cube/adapter';
import {
  validateEntry,
  validateMethode,
  type AlgorithmischerEintrag,
  type Eintrag,
  type IntuitiverEintrag,
  type Schritt,
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

function checkSchritteEnd(label: string, schritte: readonly Schritt[], total: number, problems: string[]): void {
  const last = schritte[schritte.length - 1];
  if (last && last.bereich.bis !== total) {
    problems.push(`${label}: Schritte enden bei ${last.bereich.bis}, der Algorithmus hat aber ${total} Zuege`);
  }
}

export async function problemsOfAlgorithmic(e: AlgorithmischerEintrag): Promise<string[]> {
  const problems: string[] = [];
  const at = `${e.id}`;
  const moves = parseOrProblem(`${at} algorithmus`, e.algorithmus.zuege, problems);
  if (moves) {
    checkSchritteEnd(`${at} schritte`, e.algorithmus.schritte, moves.length, problems);
    if (e.algorithmus.trigger.length > 0) {
      const parts = e.algorithmus.trigger.map((t) => parseOrProblem(`${at} trigger ${t.name}`, t.zuege, problems));
      if (parts.every((p): p is string[] => p !== null)) {
        const joined = parts.flat();
        if (joined.join(' ') !== moves.join(' ')) {
          problems.push(`${at}: Trigger zusammengesetzt (${joined.join(' ')}) ist nicht der Gesamtalgorithmus (${moves.join(' ')})`);
        } else if (!(await statesEqual('', joined.join(' '), moves.join(' ')))) {
          problems.push(`${at}: Trigger und Gesamtalgorithmus fuehren zu verschiedenen Zustaenden`);
        }
      }
    }
  }
  for (const f of e.faelle) {
    const label = `${at} fall ${f.id}`;
    if (!parseOrProblem(`${label} loesung`, f.loesung, problems)) continue;
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
    if (!r.ok) problems.push(`${label}: Loesung scheitert, verletzt: ${r.verletzt.join(', ')}`);
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
const fixtureAlg = (): AlgorithmischerEintrag => ({
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
    { id: 'sune-auf', name: 'Sune mit AUF', erkennung: 'e', loesung: `${SUNE} U` },
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

describe('Checker-Selbstpruefung (Fixtures)', () => {
  it('Fixtures sind schema-gueltig und fehlerfrei', async () => {
    expect(validateEntry(fixtureAlg()).ok).toBe(true);
    expect(validateEntry(fixtureIntuitive()).ok).toBe(true);
    expect(await problemsOfAlgorithmic(fixtureAlg())).toEqual([]);
    expect(await problemsOfIntuitive(fixtureIntuitive())).toEqual([]);
  });
  it('erkennt falsche Trigger-Zerlegung', async () => {
    const e = fixtureAlg();
    e.algorithmus.trigger[1]!.zuege = "U R U R'";
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/Trigger zusammengesetzt/);
  });
  it('erkennt Schritte, die nicht bis zum Ende reichen', async () => {
    const e = fixtureAlg();
    e.algorithmus.schritte = [{ bereich: { von: 0, bis: 5 }, text: 'a' }];
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/Schritte enden bei 5/);
  });
  it('erkennt ungueltige Notation', async () => {
    const e = fixtureAlg();
    e.algorithmus.zuege = 'R Q';
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/Notation ungueltig/);
  });
  it('erkennt Fall, dessen Loesung scheitert (gekuerzter Algorithmus)', async () => {
    const e = fixtureAlg();
    e.faelle[0]!.setup = caseSetup(SUNE);
    e.faelle[0]!.loesung = "R U R' U R";
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/fall sune: Loesung scheitert/);
  });
  it('erkennt Fall, der die ersten Schichten zerstoert', async () => {
    const e = fixtureAlg();
    e.faelle[0]!.setup = caseSetup(SUNE);
    e.faelle[0]!.loesung = `${SUNE} R U R'`;
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/zweite-schicht/);
  });
  it('erkennt Fall, dessen Ziel schon erreicht ist', async () => {
    const e = fixtureAlg();
    e.faelle = [{ id: 'leer', name: 'n', erkennung: 'e', loesung: 'U' }];
    e.ziel.erreicht = ['gelbes-kreuz'];
    expect((await problemsOfAlgorithmic(e)).join('\n')).toMatch(/schon vor der Loesung erreicht/);
  });
  it('erkennt falsches intuitives Beispiel', async () => {
    const e = fixtureIntuitive();
    e.beispiele[0]!.loesung = 'R2 B';
    expect((await problemsOfIntuitive(e)).join('\n')).toMatch(/scheitert/);
  });
});

// ---------------------------------------------------------------------------
// Echte Inhalte (content/**/*.json); leeres content/ ist erlaubt
// ---------------------------------------------------------------------------

const files = import.meta.glob('../content/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const METHODE_FILE = '../content/methode-anfaenger.json';
const entryFiles = Object.entries(files).filter(([path]) => path !== METHODE_FILE);

describe('content/*.json', () => {
  it('Methodendatei ist gueltig, Phasen 1..7 lueckenlos, Dateien existieren', () => {
    const m = files[METHODE_FILE];
    if (m === undefined) {
      expect(entryFiles, 'Eintraege ohne content/methode-anfaenger.json').toEqual([]);
      return;
    }
    const v = validateMethode(m);
    expect(v.ok ? [] : v.fehler).toEqual([]);
    if (!v.ok) return;
    expect(v.value.phasen.map((p) => p.nr).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const p of v.value.phasen) {
      expect(files[`../content/${p.datei}`], `Datei fehlt: ${p.datei}`).toBeDefined();
    }
  });

  it('jeder Eintrag besteht die Schema-Pruefung', () => {
    for (const [path, data] of entryFiles) {
      const v = validateEntry(data);
      expect(v.ok ? [] : v.fehler, path).toEqual([]);
    }
  });

  it('Eintrags-IDs sind eindeutig und passen zur Methodendatei', () => {
    const ids: string[] = [];
    const byPath = new Map<string, Eintrag>();
    for (const [path, data] of entryFiles) {
      const v = validateEntry(data);
      if (!v.ok) continue;
      ids.push(v.value.id);
      byPath.set(path, v.value);
    }
    expect(new Set(ids).size, `doppelte IDs: ${ids.join(', ')}`).toBe(ids.length);
    const m = validateMethode(files[METHODE_FILE]);
    if (!m.ok) return;
    for (const p of m.value.phasen) {
      const e = byPath.get(`../content/${p.datei}`);
      if (!e) continue;
      expect(e.id, p.datei).toBe(p.id);
      expect(e.phase, p.datei).toBe(p.nr);
      expect(e.typ, p.datei).toBe(p.typ);
    }
  });

  for (const [path, data] of entryFiles) {
    const v = validateEntry(data);
    if (!v.ok) continue;
    it(`${path}: Zugfolgen, Trigger, Schritte und Faelle stimmen`, async () => {
      const problems = v.value.typ === 'algorithmisch' ? await problemsOfAlgorithmic(v.value) : await problemsOfIntuitive(v.value);
      expect(problems).toEqual([]);
    });
  }
});
