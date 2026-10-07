/** Flächen in Sticker-Reihenfolge: je 9 Sticker, zeilenweise, von außen gesehen. */
export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACE_ORDER)[number];

/** Kanonische Zugbasen. Weitwinkel werden als `Rw` etc. geführt (r == Rw). */
export type MoveBase =
  | 'U' | 'D' | 'L' | 'R' | 'F' | 'B'
  | 'M' | 'E' | 'S'
  | 'Uw' | 'Dw' | 'Lw' | 'Rw' | 'Fw' | 'Bw'
  | 'x' | 'y' | 'z';

/** turns: 1 = Uhrzeigersinn, 2 = Halbdrehung, 3 = gegen den Uhrzeigersinn (Strich). */
export interface Move {
  readonly base: MoveBase;
  readonly turns: 1 | 2 | 3;
}

export type Algorithm = readonly Move[];
