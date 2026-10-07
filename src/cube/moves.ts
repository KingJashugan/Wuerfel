import type { Algorithm, Face, Move, MoveBase } from './types';
import { FACE_ORDER } from './types';

type Vec = readonly [number, number, number];

interface Sticker {
  readonly pos: Vec; // Steinposition, Komponenten -1..1 (x rechts, y oben, z vorn)
  readonly normal: Vec; // Flächennormale (genau eine Komponente != 0)
}

const NORMALS: Record<Face, Vec> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

function faceOfNormal(n: Vec): number {
  return FACE_ORDER.findIndex((f) => {
    const v = NORMALS[f];
    return v[0] === n[0] && v[1] === n[1] && v[2] === n[2];
  });
}

/** Index 0..8 auf der Fläche, zeilenweise von außen gesehen (U: B oben; D: F oben). */
function indexOnFace(face: Face, [x, y, z]: Vec): number {
  let row: number;
  let col: number;
  switch (face) {
    case 'U': row = z + 1; col = x + 1; break;
    case 'D': row = 1 - z; col = x + 1; break;
    case 'F': row = 1 - y; col = x + 1; break;
    case 'B': row = 1 - y; col = 1 - x; break;
    case 'R': row = 1 - y; col = 1 - z; break;
    case 'L': row = 1 - y; col = z + 1; break;
  }
  return row * 3 + col;
}

function stickerIndex(s: Sticker): number {
  const f = faceOfNormal(s.normal);
  return f * 9 + indexOnFace(FACE_ORDER[f] as Face, s.pos);
}

const ALL_STICKERS: readonly Sticker[] = (() => {
  const out: Sticker[] = [];
  for (const f of FACE_ORDER) {
    const n = NORMALS[f];
    const free = [0, 1, 2].filter((k) => n[k] === 0);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const pos: [number, number, number] = [n[0], n[1], n[2]];
        pos[free[0] as number] = a;
        pos[free[1] as number] = b;
        out.push({ pos, normal: n });
      }
    }
  }
  return out;
})();

function axisOf(n: Vec): number {
  return n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
}

/**
 * Sticker-Indizes je Stein (26 Steine: 8 Ecken, 12 Kanten, 6 Mitten).
 * Ecken sind in konsistentem Drehsinn aufgelistet (Spiegelung wird erkannt).
 */
export function pieceStickers(): number[][] {
  const groups = new Map<string, Sticker[]>();
  for (const s of ALL_STICKERS) {
    const key = s.pos.join(',');
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  const pieces: number[][] = [];
  for (const [key, g] of groups) {
    if (key === '0,0,0') continue;
    const byAxis = [...g].sort((a, b) => axisOf(a.normal) - axisOf(b.normal));
    if (byAxis.length === 3) {
      const p = (byAxis[0] as Sticker).pos;
      if (p[0] * p[1] * p[2] < 0) {
        const t = byAxis[1] as Sticker;
        byAxis[1] = byAxis[2] as Sticker;
        byAxis[2] = t;
      }
    }
    pieces.push(byAxis.map(stickerIndex));
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Züge als Permutationen

/**
 * Drehung: Uhrzeigersinn = Blick von außen auf die Fläche mit Normale `axis`.
 * `layer` bekommt die Koordinate entlang der Achse (-1..1) und sagt, ob die Schicht mitdreht.
 */
interface Turn {
  readonly axis: Vec;
  readonly layer: (c: number) => boolean;
}

const all = (): boolean => true;
const outer = (c: number): boolean => c === 1;
const mid = (c: number): boolean => c === 0;
const outerAndMid = (c: number): boolean => c >= 0;

const TURNS: Record<MoveBase, Turn> = {
  U: { axis: [0, 1, 0], layer: outer },
  D: { axis: [0, -1, 0], layer: outer },
  L: { axis: [-1, 0, 0], layer: outer },
  R: { axis: [1, 0, 0], layer: outer },
  F: { axis: [0, 0, 1], layer: outer },
  B: { axis: [0, 0, -1], layer: outer },
  M: { axis: [-1, 0, 0], layer: mid }, // folgt L
  E: { axis: [0, -1, 0], layer: mid }, // folgt D
  S: { axis: [0, 0, 1], layer: mid }, // folgt F
  Uw: { axis: [0, 1, 0], layer: outerAndMid },
  Dw: { axis: [0, -1, 0], layer: outerAndMid },
  Lw: { axis: [-1, 0, 0], layer: outerAndMid },
  Rw: { axis: [1, 0, 0], layer: outerAndMid },
  Fw: { axis: [0, 0, 1], layer: outerAndMid },
  Bw: { axis: [0, 0, -1], layer: outerAndMid },
  x: { axis: [1, 0, 0], layer: all }, // folgt R
  y: { axis: [0, 1, 0], layer: all }, // folgt U
  z: { axis: [0, 0, 1], layer: all }, // folgt F
};

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Viertel-Drehung im Uhrzeigersinn von außen auf `axis` = -90° um axis (Rechte-Hand-Regel). */
function rotateCw(v: Vec, axis: Vec): Vec {
  const c = cross(axis, v);
  const d = dot(axis, v);
  return [d * axis[0] - c[0], d * axis[1] - c[1], d * axis[2] - c[2]];
}

const quarterCache = new Map<MoveBase, readonly number[]>();

/** dest[i] = Zielposition des Stickers von Position i bei einer Viertel-Drehung. */
function quarterPermutation(base: MoveBase): readonly number[] {
  const cached = quarterCache.get(base);
  if (cached) return cached;
  const turn = TURNS[base];
  const dest = new Array<number>(54).fill(0);
  for (const s of ALL_STICKERS) {
    const from = stickerIndex(s);
    if (turn.layer(dot(s.pos, turn.axis))) {
      dest[from] = stickerIndex({
        pos: rotateCw(s.pos, turn.axis),
        normal: rotateCw(s.normal, turn.axis),
      });
    } else {
      dest[from] = from;
    }
  }
  quarterCache.set(base, dest);
  return dest;
}

/** Permutation eines Zuges: result[i] = Zielposition des Stickers, der auf i liegt. */
export function movePermutation(move: Move): number[] {
  const q = quarterPermutation(move.base);
  const out = Array.from({ length: 54 }, (_, i) => i);
  for (let t = 0; t < move.turns; t++) {
    for (let i = 0; i < 54; i++) out[i] = q[out[i] as number] as number;
  }
  return out;
}

/** Permutation einer Zugfolge (erster Zug zuerst). */
export function algorithmPermutation(alg: Algorithm): number[] {
  let out = Array.from({ length: 54 }, (_, i) => i);
  for (const m of alg) {
    const p = movePermutation(m);
    out = out.map((pos) => p[pos] as number);
  }
  return out;
}

export function invertMove(move: Move): Move {
  return { base: move.base, turns: (4 - move.turns) as 1 | 2 | 3 };
}

export function invertAlgorithm(alg: Algorithm): Move[] {
  return alg.map(invertMove).reverse();
}
