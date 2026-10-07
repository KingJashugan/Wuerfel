import { algorithmPermutation, movePermutation } from './moves';
import { parseAlgorithm } from './notation';
import type { Algorithm, Move } from './types';

/**
 * Unveränderlicher 54-Sticker-Zustand. stickers[face*9 + i] = Farbe (0..5, Index der
 * Ursprungsfläche in FACE_ORDER). Mittelsteine sind Sticker 4 jeder Fläche und werden
 * von Slice-Zügen und Rotationen korrekt mitbewegt.
 */
export class CubeState {
  readonly stickers: readonly number[];

  private constructor(stickers: readonly number[]) {
    this.stickers = stickers;
  }

  static solved(): CubeState {
    return new CubeState(Array.from({ length: 54 }, (_, i) => Math.floor(i / 9)));
  }

  static fromStickers(stickers: readonly number[]): CubeState {
    if (stickers.length !== 54) throw new Error(`Erwartet 54 Sticker, erhalten ${stickers.length}`);
    if (!stickers.every((c) => Number.isInteger(c) && c >= 0 && c <= 5)) {
      throw new Error('Stickerfarben müssen ganze Zahlen 0..5 sein');
    }
    return new CubeState([...stickers]);
  }

  clone(): CubeState {
    return new CubeState([...this.stickers]);
  }

  equals(other: CubeState): boolean {
    return this.stickers.every((c, i) => c === other.stickers[i]);
  }

  /** Jede Fläche einfarbig (unabhängig von der Gesamtorientierung). */
  isSolved(): boolean {
    for (let f = 0; f < 6; f++) {
      const c = this.stickers[f * 9 + 4];
      for (let i = 0; i < 9; i++) if (this.stickers[f * 9 + i] !== c) return false;
    }
    return true;
  }

  /** Wendet eine Permutation an (dest[i] = Zielposition des Stickers auf i). */
  permute(dest: readonly number[]): CubeState {
    const next = new Array<number>(54);
    for (let i = 0; i < 54; i++) next[dest[i] as number] = this.stickers[i] as number;
    return new CubeState(next);
  }
}

export function applyMove(state: CubeState, move: Move): CubeState {
  return state.permute(movePermutation(move));
}

export function applyAlgorithm(state: CubeState, alg: Algorithm | string): CubeState {
  const moves = typeof alg === 'string' ? parseAlgorithm(alg) : alg;
  return state.permute(algorithmPermutation(moves));
}
