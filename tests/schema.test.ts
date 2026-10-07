import { describe, expect, it } from 'vitest';
import { validateEntry, validateMethode } from '../content/schema';

const goodAlgEntry = () => ({
  typ: 'algorithmisch',
  id: 'gelbe-ecken-orientieren',
  phase: 7,
  titel: 'Gelbe Ecken orientieren',
  ziel: {
    text: 'Alle gelben Aufkleber der Ecken zeigen nach oben.',
    erhalten: ['zweite-schicht'],
    erreicht: ['geloest'],
    aufTolerant: true,
  },
  algorithmus: {
    name: 'Sune',
    zuege: "R U R' U R U2 R'",
    trigger: [
      { name: 'Trigger A', zuege: "R U R'", erklaerung: 'Ecke anheben und zurueck.' },
      { name: 'Trigger B', zuege: "U R U2 R'", erklaerung: 'Rest.' },
    ],
    schritte: [
      { bereich: { von: 0, bis: 3 }, text: 'Erster Teil.' },
      { bereich: { von: 3, bis: 7 }, text: 'Zweiter Teil.' },
    ],
  },
  faelle: [{ id: 'sune', name: 'Sune', erkennung: 'Ein gelber Aufkleber oben.', loesung: "R U R' U R U2 R'" }],
});

const goodIntuitive = () => ({
  typ: 'intuitiv',
  id: 'weisses-kreuz',
  phase: 1,
  titel: 'Weisses Kreuz',
  ziel: { text: 'Kreuz unten.', erhalten: [], erreicht: ['kreuz-unten'], aufTolerant: false },
  prinzip: 'Kanten einzeln einsetzen.',
  beispiele: [{ id: 'bsp-1', beschreibung: 'Kante vorne oben.', setup: "F' U", loesung: "U' F" }],
});

const goodMethode = () => ({
  id: 'anfaenger',
  orientierung: 'Weiss unten, Gruen vorne',
  phasen: [
    { nr: 1, id: 'weisses-kreuz', titel: 'Weisses Kreuz', typ: 'intuitiv', datei: 'phase1.json' },
    { nr: 2, id: 'weisse-ecken', titel: 'Weisse Ecken', typ: 'intuitiv', datei: 'phase2.json' },
  ],
});

function fehler(r: ReturnType<typeof validateEntry>): string[] {
  return r.ok ? [] : r.fehler;
}

describe('validateEntry (algorithmisch)', () => {
  it('akzeptiert einen gueltigen Eintrag', () => {
    const r = validateEntry(goodAlgEntry());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.typ).toBe('algorithmisch');
  });
  it('akzeptiert optionales setup im Fall', () => {
    const e = goodAlgEntry();
    (e.faelle[0] as Record<string, unknown>)['setup'] = 'z2 R';
    expect(validateEntry(e).ok).toBe(true);
  });
  it('lehnt Nicht-Objekte und unbekannten typ ab', () => {
    for (const x of [null, 5, 'x', [], {}, { typ: 'foo' }]) expect(validateEntry(x).ok).toBe(false);
  });
  it('Phase muss 3..7 sein', () => {
    for (const p of [2, 8, 3.5, '4', null]) {
      const e = { ...goodAlgEntry(), phase: p };
      expect(validateEntry(e).ok, String(p)).toBe(false);
    }
    for (const p of [3, 4, 5, 6, 7]) expect(validateEntry({ ...goodAlgEntry(), phase: p }).ok).toBe(true);
  });
  it('fehlende Felder werden mit Pfad gemeldet', () => {
    const e = goodAlgEntry() as Record<string, unknown>;
    delete e['titel'];
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/titel/);
  });
  it('unbekannte Felder werden gemeldet (Tippfehler)', () => {
    const e = { ...goodAlgEntry(), titell: 'x' };
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/titell/);
  });
  it('leere Strings sind ungueltig', () => {
    const e = goodAlgEntry();
    e.algorithmus.zuege = '  ';
    expect(validateEntry(e).ok).toBe(false);
  });
  it('id muss kleingeschrieben mit Bindestrichen sein', () => {
    for (const id of ['Sune', 'a b', 'a_b', '', '-a']) {
      expect(validateEntry({ ...goodAlgEntry(), id }).ok, id).toBe(false);
    }
  });
  it('unbekannte Bereiche in ziel werden abgelehnt', () => {
    const e = goodAlgEntry();
    e.ziel.erreicht = ['gibts-nicht'];
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/gibts-nicht/);
  });
  it('aufTolerant muss boolean sein', () => {
    const e = goodAlgEntry() as Record<string, any>;
    e['ziel'].aufTolerant = 'ja';
    expect(validateEntry(e).ok).toBe(false);
  });
  it('doppelte Fall-IDs werden abgelehnt', () => {
    const e = goodAlgEntry();
    e.faelle.push({ ...e.faelle[0]! });
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/doppelt/);
  });
  it('mindestens ein Fall und ein Schritt sind noetig', () => {
    expect(validateEntry({ ...goodAlgEntry(), faelle: [] }).ok).toBe(false);
    const e = goodAlgEntry();
    e.algorithmus.schritte = [];
    expect(validateEntry(e).ok).toBe(false);
  });
  it('Schritte: bereich halboffen, aufsteigend, lueckenlos ab 0', () => {
    const mk = (b: Array<[number, number]>) => {
      const e = goodAlgEntry();
      e.algorithmus.schritte = b.map(([von, bis]) => ({ bereich: { von, bis }, text: 't' }));
      return validateEntry(e);
    };
    expect(mk([[0, 7]]).ok).toBe(true);
    expect(mk([[0, 3], [3, 7]]).ok).toBe(true);
    expect(mk([[1, 7]]).ok).toBe(false); // beginnt nicht bei 0
    expect(mk([[0, 3], [4, 7]]).ok).toBe(false); // Luecke
    expect(mk([[0, 4], [3, 7]]).ok).toBe(false); // Ueberlappung
    expect(mk([[0, 0]]).ok).toBe(false); // leer
    expect(mk([[3, 1]]).ok).toBe(false); // umgekehrt
    expect(mk([[0.5, 2]]).ok).toBe(false); // nicht ganzzahlig
  });
  it('Trigger brauchen name, zuege, erklaerung', () => {
    const e = goodAlgEntry();
    delete (e.algorithmus.trigger[0] as Record<string, unknown>)['erklaerung'];
    expect(validateEntry(e).ok).toBe(false);
  });
  it('trigger darf leer sein', () => {
    const e = goodAlgEntry();
    e.algorithmus.trigger = [];
    expect(validateEntry(e).ok).toBe(true);
  });
});

describe('validateEntry (intuitiv)', () => {
  it('akzeptiert gueltigen Fixture-Eintrag', () => {
    expect(validateEntry(goodIntuitive()).ok).toBe(true);
  });
  it('Phase muss 1..2 sein', () => {
    expect(validateEntry({ ...goodIntuitive(), phase: 3 }).ok).toBe(false);
    expect(validateEntry({ ...goodIntuitive(), phase: 2 }).ok).toBe(true);
  });
  it('Beispiele brauchen eindeutige IDs und setup/loesung', () => {
    const e = goodIntuitive();
    e.beispiele.push({ ...e.beispiele[0]! });
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/doppelt/);
    const f = goodIntuitive();
    delete (f.beispiele[0] as Record<string, unknown>)['setup'];
    expect(validateEntry(f).ok).toBe(false);
  });
  it('optionale Schritte eines Beispiels werden geprueft', () => {
    const e = goodIntuitive() as Record<string, any>;
    e['beispiele'][0].schritte = [{ bereich: { von: 0, bis: 2 }, text: 'ok' }];
    expect(validateEntry(e).ok).toBe(true);
    e['beispiele'][0].schritte = [{ bereich: { von: 1, bis: 2 }, text: 'ok' }];
    expect(validateEntry(e).ok).toBe(false);
  });
});

describe('validateMethode', () => {
  it('akzeptiert gueltige Methode', () => {
    expect(validateMethode(goodMethode()).ok).toBe(true);
  });
  it('nr muss 1..7 sein und eindeutig', () => {
    const m = goodMethode();
    m.phasen[1]!.nr = 1;
    expect(validateMethode(m).ok).toBe(false);
    const n = goodMethode();
    n.phasen[1]!.nr = 8;
    expect(validateMethode(n).ok).toBe(false);
  });
  it('typ nur algorithmisch oder intuitiv; datei endet auf .json', () => {
    const m = goodMethode();
    (m.phasen[0] as Record<string, unknown>)['typ'] = 'x';
    expect(validateMethode(m).ok).toBe(false);
    const n = goodMethode();
    n.phasen[0]!.datei = 'phase1.txt';
    expect(validateMethode(n).ok).toBe(false);
  });
  it('doppelte Phasen-IDs werden abgelehnt', () => {
    const m = goodMethode();
    m.phasen[1]!.id = m.phasen[0]!.id;
    expect(validateMethode(m).ok).toBe(false);
  });
});
