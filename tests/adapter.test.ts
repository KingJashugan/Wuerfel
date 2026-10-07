import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  indexAtTimestamp,
  invert,
  isSolvedAfter,
  parseMoves,
  statesEqual,
  timestampAtIndex,
} from '../src/cube/adapter';
import { CubeState, applyAlgorithm, formatAlgorithm, invertAlgorithm, parseAlgorithm } from '../src/cube';

const SEXY = "R U R' U'";
const repeat = (alg: string, n: number): string => Array(n).fill(alg).join(' ');

describe('parseMoves', () => {
  it('zerlegt in einzelne Zuege', () => {
    expect(parseMoves(SEXY)).toEqual(['R', 'U', "R'", "U'"]);
  });
  it('leerer String ergibt keine Zuege', () => {
    expect(parseMoves('')).toEqual([]);
    expect(parseMoves('   ')).toEqual([]);
  });
  it('Doppelzug, Weitwinkel, Slices und Rotationen zaehlen je als ein Zug', () => {
    expect(parseMoves("R2 Rw U2 M x y' F")).toEqual(['R2', 'Rw', 'U2', 'M', 'x', "y'", 'F']);
    expect(parseMoves('r')).toHaveLength(1);
  });
  it('toleriert beliebigen Whitespace', () => {
    expect(parseMoves("  R   U\n R' ")).toEqual(['R', 'U', "R'"]);
  });
  it('expandiert Gruppierungen und Kommutatoren', () => {
    expect(parseMoves('(R U)2')).toEqual(['R', 'U', 'R', 'U']);
    expect(parseMoves('[R, U]')).toEqual(['R', 'U', "R'", "U'"]);
  });
  it('wirft bei ungueltiger Notation', () => {
    expect(() => parseMoves('R Q')).toThrow();
    expect(() => parseMoves('R U (')).toThrow();
  });
});

describe('invert', () => {
  it('kehrt Reihenfolge und Richtung um', () => {
    expect(invert(SEXY)).toBe("U R U' R'");
  });
  it('Doppelzuege bleiben Doppelzuege (ohne Strich)', () => {
    expect(invert('R2 U2')).toBe('U2 R2');
    expect(invert("R2' U")).toBe("U' R2");
  });
  it('parseMoves normalisiert R2\' zu R2', () => {
    expect(parseMoves("R2' U2")).toEqual(['R2', 'U2']);
  });
  it('leere Eingabe ergibt leere Ausgabe', () => {
    expect(invert('')).toBe('');
  });
  it('ist eine Involution (bis auf Normalisierung)', () => {
    for (const alg of [SEXY, "R U2 R' U' R U' R'", "F R U R' U' F'", "M' E2 S Rw' x"]) {
      expect(parseMoves(invert(invert(alg)))).toEqual(parseMoves(alg));
    }
  });
});

describe('isSolvedAfter', () => {
  it('leerer Zustand ist geloest', async () => {
    expect(await isSolvedAfter('', '')).toBe(true);
  });
  it('ein einzelner Zug ist nicht geloest', async () => {
    expect(await isSolvedAfter('', 'R')).toBe(false);
  });
  it('Setup + dessen Inverse ist geloest', async () => {
    expect(await isSolvedAfter(SEXY, invert(SEXY))).toBe(true);
    expect(await isSolvedAfter(SEXY, SEXY)).toBe(false);
  });
  it('ganze Wuerfeldrehung zaehlt als geloest', async () => {
    expect(await isSolvedAfter('', 'x')).toBe(true);
    expect(await isSolvedAfter('', 'x y z2')).toBe(true);
  });
  it('Sexy Move x6 ist geloest, x5 und x3 nicht', async () => {
    expect(await isSolvedAfter('', repeat(SEXY, 6))).toBe(true);
    expect(await isSolvedAfter('', repeat(SEXY, 5))).toBe(false);
    expect(await isSolvedAfter('', repeat(SEXY, 3))).toBe(false);
  });
  it('Eigenschaft: alg + invert(alg) ist fuer viele Algorithmen geloest', async () => {
    const algs = [
      "R U R' U'", "F R U R' U' F'", "R2 U2 R2' D L2 B", "M' E2 S Rw' x",
      "Uw Dw' Lw2 Fw Bw'", "R U R' U R U2 R'", "y' x z2 R", "L' U' L U L F' L' F",
    ];
    for (const a of algs) expect(await isSolvedAfter('', `${a} ${invert(a)}`)).toBe(true);
  });
  it('Eigenschaft: Setup invert(a), dann a ist geloest', async () => {
    for (const a of ["R U R' U'", "F2 D' B L2"]) expect(await isSolvedAfter(invert(a), a)).toBe(true);
  });
  it('wirft bei ungueltiger Notation', async () => {
    await expect(isSolvedAfter('', 'R Q')).rejects.toThrow();
  });
});

describe('statesEqual', () => {
  it('gleiche Wirkung, unterschiedliche Schreibweise', async () => {
    expect(await statesEqual('', 'R2', 'R R')).toBe(true);
    expect(await statesEqual('', 'R2', "R' R'")).toBe(true);
    expect(await statesEqual('', 'R', "R'")).toBe(false);
  });
  it('beruecksichtigt Setup', async () => {
    expect(await statesEqual('U', '', 'U')).toBe(false);
    expect(await statesEqual('U', "U'", 'U U2')).toBe(true);
  });
});

describe('Kreuztest: eigene Logik (state.ts) gegen Adapter', () => {
  const CASES = [
    '', 'R', "R'", 'R2', 'U D', "R U R' U'", repeat(SEXY, 6), repeat(SEXY, 5),
    "F R U R' U' F'", "R U R' U R U2 R'", "M' E2 S", 'x', "y' z", 'Rw', "Lw' Uw2",
    "R U2 R' U' R U' R'", "R2 U2 R2' D L2 B", "x R U R' U' x'", 'M M\' E S2 S2', "R L' F B'",
  ];
  it('Geloest-Urteil stimmt ueberein', async () => {
    for (const alg of CASES) {
      const own = applyAlgorithm(CubeState.solved(), alg).isSolved();
      expect(await isSolvedAfter('', alg), `alg=${alg}`).toBe(own);
    }
  });
  it('Gleichheitsurteil stimmt fuer alle Paare ueberein', async () => {
    for (const a of CASES) {
      for (const b of CASES) {
        const own = applyAlgorithm(CubeState.solved(), a).equals(applyAlgorithm(CubeState.solved(), b));
        expect(await statesEqual('', a, b), `a=${a} b=${b}`).toBe(own);
      }
    }
  });
  it('Inverse stimmt ueberein', async () => {
    for (const a of CASES) {
      const ownInv = formatAlgorithm(invertAlgorithm(parseAlgorithm(a)));
      expect(await statesEqual('', invert(a), ownInv), `alg=${a}`).toBe(true);
    }
  });
});

describe('Index-Logik (rein)', () => {
  it('clampIndex klemmt auf 0..total und rundet', () => {
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(0, 4)).toBe(0);
    expect(clampIndex(2, 4)).toBe(2);
    expect(clampIndex(4, 4)).toBe(4);
    expect(clampIndex(99, 4)).toBe(4);
    expect(clampIndex(2.6, 4)).toBe(3);
    expect(clampIndex(Number.NaN, 4)).toBe(0);
    expect(clampIndex(5, 0)).toBe(0);
  });

  // R (1000 ms), R2 (1500 ms), U (1000 ms) -> Starts 0, 1000, 2500, Ende 3500
  const starts = [0, 1000, 2500];
  const end = 3500;
  it('timestampAtIndex: Startzeit des Zuges, Index total = Ende', () => {
    expect(timestampAtIndex(starts, end, 0)).toBe(0);
    expect(timestampAtIndex(starts, end, 1)).toBe(1000);
    expect(timestampAtIndex(starts, end, 2)).toBe(2500);
    expect(timestampAtIndex(starts, end, 3)).toBe(3500);
    expect(timestampAtIndex(starts, end, 9)).toBe(3500);
    expect(timestampAtIndex(starts, end, -1)).toBe(0);
  });
  it('indexAtTimestamp: Anzahl vollstaendig ausgefuehrter Zuege', () => {
    expect(indexAtTimestamp(starts, end, 0)).toEqual({ index: 0, currentMove: null });
    expect(indexAtTimestamp(starts, end, 400)).toEqual({ index: 0, currentMove: 0 });
    expect(indexAtTimestamp(starts, end, 1000)).toEqual({ index: 1, currentMove: null });
    expect(indexAtTimestamp(starts, end, 1700)).toEqual({ index: 1, currentMove: 1 });
    expect(indexAtTimestamp(starts, end, 2500)).toEqual({ index: 2, currentMove: null });
    expect(indexAtTimestamp(starts, end, 3499)).toEqual({ index: 2, currentMove: 2 });
    expect(indexAtTimestamp(starts, end, 3500)).toEqual({ index: 3, currentMove: null });
  });
  it('indexAtTimestamp ist tolerant gegen Gleitkommafehler an Grenzen', () => {
    expect(indexAtTimestamp(starts, end, 999.9999999).index).toBe(1);
    expect(indexAtTimestamp(starts, end, 1000.0000001).currentMove).toBeNull();
  });
  it('indexAtTimestamp klemmt ausserhalb der Zeitleiste', () => {
    expect(indexAtTimestamp(starts, end, -50).index).toBe(0);
    expect(indexAtTimestamp(starts, end, 99999)).toEqual({ index: 3, currentMove: null });
  });
  it('Hin- und Rueckabbildung sind konsistent', () => {
    for (let i = 0; i <= starts.length; i++) {
      expect(indexAtTimestamp(starts, end, timestampAtIndex(starts, end, i)).index).toBe(i);
    }
  });
  it('leere Zeitleiste', () => {
    expect(indexAtTimestamp([], 0, 0)).toEqual({ index: 0, currentMove: null });
    expect(timestampAtIndex([], 0, 0)).toBe(0);
  });
});
