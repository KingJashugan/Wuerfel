import { describe, expect, it } from 'vitest';
import {
  CubeState,
  CubeParseError,
  FACE_ORDER,
  algorithmPermutation,
  applyAlgorithm,
  applyMove,
  concatAlgorithms,
  formatAlgorithm,
  invertAlgorithm,
  invertMove,
  parseAlgorithm,
  parseMove,
  pieceStickers,
  type Algorithm,
} from '../src/cube';

const IDENTITY = Array.from({ length: 54 }, (_, i) => i);
const perm = (alg: string): number[] => algorithmPermutation(parseAlgorithm(alg));
const repeat = (alg: string, n: number): string => Array(n).fill(alg).join(' ');
const isIdentity = (alg: string): boolean => perm(alg).every((v, i) => v === i);
/** Kleinste Ordnung n >= 1 mit alg^n = Identität. */
const order = (alg: string): number => {
  for (let n = 1; n <= 1260; n++) if (isIdentity(repeat(alg, n))) return n;
  throw new Error('Ordnung zu groß');
};
const face = (f: string): number => FACE_ORDER.indexOf(f as (typeof FACE_ORDER)[number]);

const BASES = ['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];

describe('CubeState', () => {
  it('solved ist gelöst, hat 9 Sticker je Farbe', () => {
    const s = CubeState.solved();
    expect(s.isSolved()).toBe(true);
    expect(s.stickers).toHaveLength(54);
    for (let c = 0; c < 6; c++) expect(s.stickers.filter((v) => v === c)).toHaveLength(9);
  });
  it('clone ist unabhängig, equals vergleicht Inhalt, Züge sind unveränderlich', () => {
    const a = CubeState.solved();
    const b = a.clone();
    expect(a.equals(b)).toBe(true);
    expect(b.stickers).not.toBe(a.stickers);
    const c = applyMove(a, parseMove('R'));
    expect(a.equals(c)).toBe(false);
    expect(a.isSolved()).toBe(true);
    expect(c.isSolved()).toBe(false);
  });
  it('fromStickers validiert', () => {
    expect(() => CubeState.fromStickers([0, 1])).toThrow();
    expect(() => CubeState.fromStickers(Array(54).fill(7))).toThrow();
  });
  it('R bringt F-Farbe nach U (rechte Spalte)', () => {
    const s = applyMove(CubeState.solved(), parseMove('R'));
    expect([2, 5, 8].map((i) => s.stickers[face('U') * 9 + i])).toEqual([face('F'), face('F'), face('F')]);
  });
  it('Drehrichtung im Uhrzeigersinn: Farbfluss je Grundzug', () => {
    // [Zug, Zielfläche, Quellfläche der Farbe, Sticker-Index auf Zielfläche]
    const cases: Array<[string, string, string, number]> = [
      ['R', 'U', 'F', 2],
      ['R', 'B', 'U', 0],
      ['U', 'F', 'R', 0],
      ['U', 'L', 'F', 0],
      ['F', 'U', 'L', 8],
      ['F', 'R', 'U', 6],
      ['L', 'U', 'B', 0],
      ['L', 'F', 'U', 0],
      ['D', 'F', 'L', 6],
      ['D', 'R', 'F', 6],
      ['B', 'U', 'R', 2],
      ['B', 'L', 'U', 0],
    ];
    for (const [mv, target, src, i] of cases) {
      const s = applyMove(CubeState.solved(), parseMove(mv));
      expect(s.stickers[face(target) * 9 + i], `${mv} -> ${target}[${i}]`).toBe(face(src));
    }
  });
});

describe('Züge: Gruppeneigenschaften', () => {
  for (const base of BASES) {
    it(`${base}^4 = Identität, ${base}2^2 = Identität, ${base} ${base}' = Identität`, () => {
      expect(isIdentity(repeat(base, 4))).toBe(true);
      expect(isIdentity(repeat(`${base}2`, 2))).toBe(true);
      expect(isIdentity(`${base} ${base}'`)).toBe(true);
      expect(isIdentity(`${base}' ${base}' ${base}2`)).toBe(true);
      expect(isIdentity(base)).toBe(false);
      expect(isIdentity(`${base}2`)).toBe(false);
      expect(perm(`${base}2`)).toEqual(perm(`${base} ${base}`));
      expect(perm(`${base}'`)).toEqual(perm(repeat(base, 3)));
    });
  }
  it('Zug·Inverse = Identität für beliebige Folge', () => {
    const alg = parseAlgorithm("R U2 F' Rw M' x D2 B' E S' l z");
    const both = concatAlgorithms(alg, invertAlgorithm(alg));
    expect(algorithmPermutation(both)).toEqual(IDENTITY);
    expect(applyAlgorithm(CubeState.solved(), both).isSolved()).toBe(true);
  });
});

describe('bekannte Identitäten', () => {
  it("(R U R' U')^6 = Identität, Ordnung 6", () => {
    expect(isIdentity(repeat("R U R' U'", 6))).toBe(true);
    expect(order("R U R' U'")).toBe(6);
  });
  it("Sune R U R' U R U2 R' hat Ordnung 6", () => {
    expect(order("R U R' U R U2 R'")).toBe(6);
  });
  it('R U hat Ordnung 105', () => {
    expect(order('R U')).toBe(105);
  });
  it('T-Perm hat Ordnung 2', () => {
    expect(order("R U R' U' R' F R2 U' R' U' R U R' F'")).toBe(2);
  });
  it('Sexy Move: nach 6 Wiederholungen wieder gelöst (Zustand)', () => {
    let s = CubeState.solved();
    for (let i = 0; i < 6; i++) {
      expect(s.isSolved()).toBe(i === 0);
      s = applyAlgorithm(s, "R U R' U'");
    }
    expect(s.isSolved()).toBe(true);
  });
  it('gegenüberliegende Flächen kommutieren, benachbarte nicht', () => {
    expect(perm('R L')).toEqual(perm('L R'));
    expect(perm('U D')).toEqual(perm('D U'));
    expect(perm('R U')).not.toEqual(perm('U R'));
  });
  it('M2 E2 S2 hat Ordnung 2', () => {
    expect(order('M2 E2 S2')).toBe(2);
  });
});

describe('Slice-, Weitwinkel- und Rotationsäquivalenzen', () => {
  const eq = (a: string, b: string): void => expect(perm(a), `${a} = ${b}`).toEqual(perm(b));
  it("Rw = r = R M'", () => {
    eq('Rw', 'r');
    eq('Rw', "R M'");
    eq("Rw'", "R' M");
    eq('Rw2', 'R2 M2');
  });
  it('alle Weitwinkel', () => {
    eq('Lw', 'L M');
    eq('l', 'Lw');
    eq('Uw', "U E'");
    eq('u', 'Uw');
    eq('Dw', 'D E');
    eq('d', 'Dw');
    eq('Fw', 'F S');
    eq('f', 'Fw');
    eq('Bw', "B S'");
    eq('b', 'Bw');
  });
  it('Rotationen', () => {
    eq('x', "R M' L'");
    eq('y', "U E' D'");
    eq('z', "F S B'");
    eq('x', "Rw L'");
    eq('x2', 'x x');
  });
  it('M folgt L, E folgt D, S folgt F', () => {
    eq('M', "L' Lw");
    eq('E', "D' Dw");
    eq('S', "F' Fw");
    const F = face('F');
    const U = face('U');
    // x folgt R: Front-Farbe wandert nach oben
    expect(applyMove(CubeState.solved(), parseMove('x')).stickers[U * 9 + 4]).toBe(F);
    // y folgt U: Front-Farbe wandert nach links
    expect(applyMove(CubeState.solved(), parseMove('y')).stickers[face('L') * 9 + 4]).toBe(F);
    // z folgt F: U-Farbe wandert nach rechts
    expect(applyMove(CubeState.solved(), parseMove('z')).stickers[face('R') * 9 + 4]).toBe(U);
    // M folgt L: Front-Mitte wandert nach unten
    expect(applyMove(CubeState.solved(), parseMove('M')).stickers[face('D') * 9 + 4]).toBe(F);
  });
  it('Rotationen lassen den gelösten Würfel gelöst', () => {
    for (const r of ['x', 'y', 'z', "x'", 'y2', 'z2']) {
      expect(applyAlgorithm(CubeState.solved(), r).isSolved()).toBe(true);
    }
  });
  it('Slice-Züge bewegen Mittelsteine, Flächenzüge nicht', () => {
    const centers = FACE_ORDER.map((_, f) => f * 9 + 4);
    for (const m of ['U', 'D', 'L', 'R', 'F', 'B']) {
      const p = perm(m);
      for (const c of centers) expect(p[c]).toBe(c);
    }
    const pm = perm('M');
    expect(centers.some((c) => pm[c] !== c)).toBe(true);
  });
});

describe('Invarianten', () => {
  const scramble = "R U2 F' D L2 B M E' S Rw u' x z' R' B2 F l";
  it('9 Sticker je Farbe, Permutation bijektiv', () => {
    const s = applyAlgorithm(CubeState.solved(), scramble);
    for (let c = 0; c < 6; c++) expect(s.stickers.filter((v) => v === c)).toHaveLength(9);
    expect(new Set(perm(scramble)).size).toBe(54);
  });
  it('26 Steine; nach Verwürfeln bleiben Steine gültig (keine Gegenfarben, Chiralität, jeder genau einmal)', () => {
    const solved = CubeState.solved();
    const pieces = pieceStickers();
    expect(pieces).toHaveLength(26);
    expect(pieces.filter((p) => p.length === 3)).toHaveLength(8);
    expect(pieces.filter((p) => p.length === 2)).toHaveLength(12);
    expect(pieces.filter((p) => p.length === 1)).toHaveLength(6);

    const solvedKeys = pieces.map((p) => p.map((i) => solved.stickers[i] as number));
    const s = applyAlgorithm(solved, scramble);
    const seen = new Set<string>();
    for (const p of pieces) {
      const cols = p.map((i) => s.stickers[i] as number);
      const match = solvedKeys.findIndex(
        (k) =>
          k.length === cols.length &&
          [...k].sort().join() === [...cols].sort().join(),
      );
      expect(match).toBeGreaterThanOrEqual(0);
      seen.add(String(match));
      if (cols.length === 3) {
        // gleiche zyklische Reihenfolge wie im gelösten Stein (keine Spiegelung)
        const ref = solvedKeys[match] as number[];
        const start = cols.indexOf(ref[0] as number);
        const rot = [0, 1, 2].map((k) => cols[(start + k) % 3]);
        expect(rot).toEqual(ref);
      }
      if (cols.length >= 2) {
        for (const a of cols) for (const b of cols) expect(b === (a + 3) % 6).toBe(false);
      }
    }
    expect(seen.size).toBe(26);
  });
  it('Mittelsteine ändern sich bei Flächenzügen nie (feste Zentren)', () => {
    const s = applyAlgorithm(CubeState.solved(), "R U2 F' D L2 B R' B2 F");
    FACE_ORDER.forEach((_, f) => expect(s.stickers[f * 9 + 4]).toBe(f));
  });
});

describe('Parser', () => {
  it('parst Grundzüge mit Modifikatoren', () => {
    expect(parseAlgorithm("R U R' U'")).toEqual([
      { base: 'R', turns: 1 },
      { base: 'U', turns: 1 },
      { base: 'R', turns: 3 },
      { base: 'U', turns: 3 },
    ]);
    expect(parseAlgorithm('R2 U2')).toEqual([
      { base: 'R', turns: 2 },
      { base: 'U', turns: 2 },
    ]);
  });
  it("R2' ist R2", () => {
    expect(parseMove("R2'")).toEqual({ base: 'R', turns: 2 });
  });
  it('Weitwinkel Rw und r sind identisch (kanonisch)', () => {
    expect(parseMove('Rw')).toEqual(parseMove('r'));
    expect(parseMove('Rw2')).toEqual({ base: 'Rw', turns: 2 });
    for (const [a, b] of [['u', 'Uw'], ['d', 'Dw'], ['l', 'Lw'], ['f', 'Fw'], ['b', 'Bw']] as const) {
      expect(parseMove(a)).toEqual(parseMove(b));
    }
  });
  it('Slices und Rotationen', () => {
    expect(parseAlgorithm("M' E2 S x y' z2")).toEqual([
      { base: 'M', turns: 3 },
      { base: 'E', turns: 2 },
      { base: 'S', turns: 1 },
      { base: 'x', turns: 1 },
      { base: 'y', turns: 3 },
      { base: 'z', turns: 2 },
    ]);
  });
  it('Whitespace: mehrfach, Tabs, Zeilenumbrüche, leer', () => {
    expect(parseAlgorithm('  R \t U\nF  ')).toHaveLength(3);
    expect(parseAlgorithm('')).toEqual([]);
    expect(parseAlgorithm('   ')).toEqual([]);
  });
  it('wirft klare Fehler bei ungültigen Tokens', () => {
    const bads = ['Q', 'R3', "R''", 'R2 X', 'RR', "R'2", 'Rw3', 'rw', 'W', '(R U)', 'R,U', 'm', 'e', 's', 'X', 'R0', 'Uww', '2R'];
    for (const bad of bads) {
      expect(() => parseAlgorithm(bad), bad).toThrow(CubeParseError);
    }
    try {
      parseAlgorithm("R U Q' F");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CubeParseError);
      const err = e as CubeParseError;
      expect(err.token).toBe("Q'");
      expect(err.index).toBe(2);
      expect(err.message).toContain("Q'");
    }
  });
  it('parseMove verlangt genau einen Zug', () => {
    expect(() => parseMove('R U')).toThrow(CubeParseError);
    expect(() => parseMove('')).toThrow(CubeParseError);
  });
  it('format und Roundtrip', () => {
    const text = "R U2 R' Rw M' x";
    expect(formatAlgorithm(parseAlgorithm(text))).toBe(text);
    expect(formatAlgorithm(parseAlgorithm("r l2 u'"))).toBe("Rw Lw2 Uw'");
    expect(formatAlgorithm([])).toBe('');
  });
});

describe('inverse und concat', () => {
  it('invertMove', () => {
    expect(invertMove({ base: 'R', turns: 1 })).toEqual({ base: 'R', turns: 3 });
    expect(invertMove({ base: 'R', turns: 3 })).toEqual({ base: 'R', turns: 1 });
    expect(invertMove({ base: 'R', turns: 2 })).toEqual({ base: 'R', turns: 2 });
  });
  it('invertAlgorithm kehrt Reihenfolge und Richtung um', () => {
    expect(formatAlgorithm(invertAlgorithm(parseAlgorithm("R U R' U'")))).toBe("U R U' R'");
    expect(formatAlgorithm(invertAlgorithm(parseAlgorithm('R2 M')))).toBe("M' R2");
  });
  it('invertAlgorithm ändert Eingabe nicht, Doppelinvers = Original', () => {
    const a: Algorithm = parseAlgorithm("F R U' x");
    const copy = a.map((m) => ({ ...m }));
    expect(invertAlgorithm(invertAlgorithm(a))).toEqual(a);
    expect(a).toEqual(copy);
  });
  it('concatAlgorithms fügt zusammen (Algorithmen oder Strings)', () => {
    const c = concatAlgorithms(parseAlgorithm('R U'), "R' U'");
    expect(formatAlgorithm(c)).toBe("R U R' U'");
    expect(concatAlgorithms()).toEqual([]);
  });
  it('applyAlgorithm(String) = applyAlgorithm(geparst)', () => {
    const a = applyAlgorithm(CubeState.solved(), "R U R'");
    const b = applyAlgorithm(CubeState.solved(), parseAlgorithm("R U R'"));
    expect(a.equals(b)).toBe(true);
  });
});
