import { describe, expect, it } from 'vitest';
import { hinweisAusTeilen, validateEntry, validateMethode, voraussetzungVon, type Algorithmus, type Fall } from '../content/schema';

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
    const e = goodAlgEntry();
    (e.ziel as Record<string, unknown>)['aufTolerant'] = 'ja';
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
    const e = goodIntuitive();
    const bsp = e.beispiele[0] as Record<string, unknown>;
    bsp['schritte'] = [{ bereich: { von: 0, bis: 2 }, text: 'ok' }];
    expect(validateEntry(e).ok).toBe(true);
    bsp['schritte'] = [{ bereich: { von: 1, bis: 2 }, text: 'ok' }];
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

describe('validateEntry (neue Felder)', () => {
  it('ziel.erreicht braucht mindestens einen Bereich', () => {
    const e = goodAlgEntry();
    e.ziel.erreicht = [];
    expect(validateEntry(e).ok).toBe(false);
  });
  it('optionale Fallfelder hinweis und vorbereitung', () => {
    const e = goodAlgEntry();
    Object.assign(e.faelle[0]!, { hinweis: 'kurz', vorbereitung: 'U2' });
    expect(validateEntry(e).ok).toBe(true);
    Object.assign(e.faelle[0]!, { hinweis: '' });
    expect(validateEntry(e).ok).toBe(false);
  });
  it('periode ganzzahlig 1..12, varianten mit name und zuege', () => {
    const ok = goodAlgEntry();
    Object.assign(ok.algorithmus, { periode: 6, varianten: [{ name: 'links', zuege: "L' U' L" }] });
    expect(validateEntry(ok).ok).toBe(true);
    for (const periode of [0, 13, 1.5, '6']) {
      const e = goodAlgEntry();
      Object.assign(e.algorithmus, { periode });
      expect(validateEntry(e).ok, String(periode)).toBe(false);
    }
    const bad = goodAlgEntry();
    Object.assign(bad.algorithmus, { varianten: [{ name: 'x' }] });
    expect(validateEntry(bad).ok).toBe(false);
  });
  it('die entfernte Region gelbe-ecken-orientierung wird abgelehnt', () => {
    const e = goodAlgEntry();
    e.ziel.erreicht = ['gelbe-ecken-orientierung'];
    expect(validateEntry(e).ok).toBe(false);
  });
});

describe('validateEntry (nachbereitung, gruppe, Variante mit Trigger/Schritten)', () => {
  it('nachbereitung ist optional und nicht leer', () => {
    const e = goodAlgEntry();
    Object.assign(e.faelle[0]!, { nachbereitung: 'U2' });
    expect(validateEntry(e).ok).toBe(true);
    Object.assign(e.faelle[0]!, { nachbereitung: ' ' });
    expect(validateEntry(e).ok).toBe(false);
  });
  it('gruppe: nicht leer, hoechstens 30 Zeichen', () => {
    const e = goodAlgEntry();
    Object.assign(e.faelle[0]!, { gruppe: 'Tausch' });
    expect(validateEntry(e).ok).toBe(true);
    Object.assign(e.faelle[0]!, { gruppe: 'x'.repeat(30) });
    expect(validateEntry(e).ok).toBe(true);
    Object.assign(e.faelle[0]!, { gruppe: 'x'.repeat(31) });
    expect(fehler(validateEntry(e)).join('\n')).toMatch(/gruppe/);
    Object.assign(e.faelle[0]!, { gruppe: '' });
    expect(validateEntry(e).ok).toBe(false);
  });
  it('Variante darf trigger und schritte haben, mit denselben Regeln', () => {
    const mk = (extra: Record<string, unknown>) => {
      const e = goodAlgEntry();
      Object.assign(e.algorithmus, { varianten: [{ name: 'links', zuege: "L' U' L", ...extra }] });
      return validateEntry(e);
    };
    expect(mk({}).ok).toBe(true);
    expect(mk({ trigger: [{ name: 't', zuege: "L' U'", erklaerung: 'e' }], schritte: [{ bereich: { von: 0, bis: 3 }, text: 't' }] }).ok).toBe(true);
    expect(mk({ schritte: [{ bereich: { von: 1, bis: 3 }, text: 't' }] }).ok).toBe(false);
    expect(mk({ schritte: [] }).ok).toBe(false);
    expect(mk({ trigger: [{ name: 't', zuege: "L'" }] }).ok).toBe(false);
    expect(mk({ unbekannt: 1 }).ok).toBe(false);
  });
});

describe('validateEntry (teile)', () => {
  const withTeile = (teile: unknown) => {
    const e = goodAlgEntry();
    Object.assign(e.faelle[0]!, { teile });
    return validateEntry(e);
  };
  it('akzeptiert gueltige Teile', () => {
    expect(
      withTeile([
        { art: 'vorbereitung', zuege: 'U' },
        { art: 'algorithmus', zuege: SUNE_STR, durchgaenge: 2 },
        { art: 'zwischen', zuege: 'U2' },
        { art: 'variante', zuege: "L' U'", variante: 'links' },
        { art: 'nachbereitung', zuege: "U'" },
      ]).ok,
    ).toBe(true);
  });
  it('lehnt unbekannte art, unbekannte Felder und leere Liste ab', () => {
    expect(withTeile([{ art: 'mitte', zuege: 'U' }]).ok).toBe(false);
    expect(withTeile([{ art: 'zwischen', zuege: 'U', foo: 1 }]).ok).toBe(false);
    expect(withTeile([]).ok).toBe(false);
    expect(withTeile('x').ok).toBe(false);
  });
  it('zuege ist Pflicht und nicht leer', () => {
    expect(withTeile([{ art: 'zwischen' }]).ok).toBe(false);
    expect(withTeile([{ art: 'zwischen', zuege: ' ' }]).ok).toBe(false);
  });
  it('durchgaenge nur bei algorithmus/variante, ganzzahlig 1..12', () => {
    expect(withTeile([{ art: 'zwischen', zuege: 'U', durchgaenge: 2 }]).ok).toBe(false);
    for (const d of [0, 13, 1.5, '2']) expect(withTeile([{ art: 'algorithmus', zuege: SUNE_STR, durchgaenge: d }]).ok, String(d)).toBe(false);
    expect(withTeile([{ art: 'algorithmus', zuege: SUNE_STR, durchgaenge: 1 }]).ok).toBe(true);
  });
  it('variante: Name Pflicht bei art variante, sonst verboten', () => {
    expect(withTeile([{ art: 'variante', zuege: 'L' }]).ok).toBe(false);
    expect(withTeile([{ art: 'algorithmus', zuege: SUNE_STR, variante: 'x' }]).ok).toBe(false);
  });
});

const SUNE_STR = "R U R' U R U2 R'";

describe('hinweisAusTeilen', () => {
  const alg: Algorithmus = { name: 'Sune', zuege: SUNE_STR, trigger: [], schritte: [{ bereich: { von: 0, bis: 7 }, text: 't' }], varianten: [{ name: 'Links', zuege: "L' U' L" }] };
  const fall = (teile?: Fall['teile']): Fall => ({ id: 'f', name: 'n', erkennung: 'e', loesung: 'U', ...(teile ? { teile } : {}) });
  it('ohne teile null', () => {
    expect(hinweisAusTeilen(fall(), alg)).toBeNull();
  });
  it('erzeugt Ablauftext aus den Teilen', () => {
    expect(
      hinweisAusTeilen(
        fall([
          { art: 'vorbereitung', zuege: "U'" },
          { art: 'algorithmus', zuege: SUNE_STR },
          { art: 'nachbereitung', zuege: 'U2' },
        ]),
        alg,
      ),
    ).toBe("Ablauf: U' – Sune – U2.");
    expect(
      hinweisAusTeilen(
        fall([
          { art: 'algorithmus', zuege: SUNE_STR, durchgaenge: 2 },
          { art: 'zwischen', zuege: 'U' },
          { art: 'variante', zuege: "L' U' L", variante: 'Links', durchgaenge: 3 },
        ]),
        alg,
      ),
    ).toBe('Ablauf: 2× Sune – U – 3× Links.');
  });
});

describe('voraussetzungVon', () => {
  it('nimmt ziel.voraussetzung, sonst die Vorphase', () => {
    const e = goodAlgEntry();
    expect(voraussetzungVon(e as never)).toEqual(['gelbe-ecken-position']); // phase 7
    expect(voraussetzungVon({ ...e, phase: 4 } as never)).toEqual(['zweite-schicht']);
    expect(voraussetzungVon({ ...e, phase: 5 } as never)).toEqual(['gelbes-kreuz']);
    expect(voraussetzungVon({ ...e, phase: 6 } as never)).toEqual(['gelbe-kanten-position']);
    expect(voraussetzungVon({ ...e, phase: 3 } as never)).toEqual(['erste-schicht']);
    expect(voraussetzungVon({ ...e, ziel: { ...e.ziel, voraussetzung: ['kreuz-unten'] } } as never)).toEqual(['kreuz-unten']);
  });
  it('voraussetzung wird validiert (mindestens ein bekannter Bereich)', () => {
    const e = goodAlgEntry();
    Object.assign(e.ziel, { voraussetzung: ['erste-schicht'] });
    expect(validateEntry(e).ok).toBe(true);
    Object.assign(e.ziel, { voraussetzung: [] });
    expect(validateEntry(e).ok).toBe(false);
    Object.assign(e.ziel, { voraussetzung: ['nix'] });
    expect(validateEntry(e).ok).toBe(false);
  });
});

describe('vollstaendigkeit', () => {
  it('nur bekannte Werte', () => {
    const e = goodAlgEntry();
    for (const v of ['kantenpermutation-oben', 'eckenpermutation-oben-gerade', 'gelbe-lagen', 'eckenorientierung-oben']) {
      Object.assign(e, { vollstaendigkeit: v });
      expect(validateEntry(e).ok, v).toBe(true);
    }
    Object.assign(e, { vollstaendigkeit: 'alles' });
    expect(validateEntry(e).ok).toBe(false);
  });
});
