/**
 * Adapter zu cubing.js. EINZIGE Datei im Projekt, die `cubing` importiert.
 * Nach aussen gehen nur string, number, boolean und eigene Typen.
 *
 * Index-Semantik: `index` ist die Anzahl vollstaendig ausgefuehrter Zuege (0..total).
 * Ein Zug ist ein Blatt der expandierten Zugfolge (R, R2, Rw, M, x zaehlen je als ein Zug).
 * Waehrend ein Zug animiert wird, bleibt `index` beim Zugstart-Wert und `currentMove`
 * nennt den laufenden Zug.
 */
import { Alg, Move } from 'cubing/alg';
import { cube3x3x3 } from 'cubing/puzzles';
import type { TwistyPlayer } from 'cubing/twisty';

// ---------------------------------------------------------------------------
// Algorithmen: parsen, invertieren, vergleichen
// ---------------------------------------------------------------------------

/** Zerlegt einen Algorithmus in einzelne Zuege (Gruppen/Kommutatoren expandiert). Wirft bei Syntaxfehlern. */
export function parseMoves(alg: string): string[] {
  return leafMoves(alg).map((m) => m.toString());
}

/** Zuege, die auf dem 3x3 existieren (cubing parst sonst beliebige Buchstaben als Zug). */
const VALID_3X3_MOVE = /^(?:[URFDLB]w?|[urfdlb]|[MESxyz])$/;

function leafMoves(alg: string): Move[] {
  const moves: Move[] = [];
  for (const node of new Alg(alg).expand().childAlgNodes()) {
    // Halbdrehungen ohne Strich schreiben (R2' ist auf dem 3x3 identisch mit R2).
    if (node instanceof Move) {
      if (!VALID_3X3_MOVE.test(node.quantum.toString())) throw new Error(`Ungueltiger Zug: ${node.toString()}`);
      moves.push(node.amount === -2 ? node.modified({ amount: 2 }) : node);
    }
  }
  return moves;
}

/** Inverser Algorithmus als String (Gruppen expandiert, Halbdrehungen ohne Strich). Wirft bei Syntaxfehlern. */
export function invert(alg: string): string {
  return leafMoves(alg)
    .reverse()
    .map((m) => (m.amount === 2 ? m : m.invert()).toString())
    .join(' ');
}

async function patternAfter(setup: string, alg: string) {
  const kpuzzle = await cube3x3x3.kpuzzle();
  return kpuzzle.defaultPattern().applyAlg(new Alg(setup)).applyAlg(new Alg(alg));
}

/** Ist der Wuerfel nach `setup` und anschliessend `alg` geloest? Gesamtdrehungen des Wuerfels werden ignoriert. */
export async function isSolvedAfter(setup: string, alg: string): Promise<boolean> {
  const pattern = await patternAfter(setup, alg);
  return pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true });
}

/** Fuehren `setup + a` und `setup + b` zum identischen Zustand (inkl. Orientierung)? */
export async function statesEqual(setup: string, a: string, b: string): Promise<boolean> {
  const [pa, pb] = await Promise.all([patternAfter(setup, a), patternAfter(setup, b)]);
  return pa.isIdentical(pb);
}

// ---------------------------------------------------------------------------
// Reine Index-/Zeitlogik (ohne WebGL testbar)
// ---------------------------------------------------------------------------

const EPS = 1e-6;

/** Rundet und klemmt auf 0..total. NaN wird zu 0. */
export function clampIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.round(index), 0), total);
}

/** Zeitstempel (ms) fuer einen Index: Startzeit des Zuges `index`, bei `total` das Ende. */
export function timestampAtIndex(starts: readonly number[], end: number, index: number): number {
  const i = clampIndex(index, starts.length);
  return i >= starts.length ? end : (starts[i] as number);
}

/**
 * Index und laufender Zug (oder null) fuer einen Zeitstempel. Zug i gilt als ausgefuehrt, sobald
 * der Zeitstempel sein Ende (= Start von Zug i+1 bzw. `end`) erreicht.
 */
export function indexAtTimestamp(
  starts: readonly number[],
  end: number,
  timestamp: number,
): { index: number; currentMove: number | null } {
  const total = starts.length;
  let index = 0;
  while (index < total) {
    const moveEnd = index + 1 < total ? (starts[index + 1] as number) : end;
    if (timestamp + EPS >= moveEnd) index++;
    else break;
  }
  if (index >= total) return { index: total, currentMove: null };
  const moving = timestamp - EPS > (starts[index] as number);
  return { index, currentMove: moving ? index : null };
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerState {
  /** Anzahl vollstaendig ausgefuehrter Zuege, 0..total. */
  index: number;
  total: number;
  playing: boolean;
  /** Der gerade animierte Zug (z. B. "R2") oder null, wenn der Wuerfel an einer Zuggrenze steht. */
  currentMove: string | null;
}

export interface CubePlayer {
  /** Setzt Ausgangsstellung (setup) und Algorithmus; Zustand danach: index 0. Wirft bei Syntaxfehlern. */
  load(setup: string, alg: string): Promise<void>;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /**
   * Animiert genau einen Zug vor; am Ende ohne Wirkung. Waehrend einer laufenden Animation
   * (state.playing) ohne Wirkung, es wird nichts gequeued; die UI sollte Buttons sperren.
   */
  stepForward(): void;
  /**
   * Animiert genau einen Zug zurueck; am Anfang oder waehrend laufender Animation ohne Wirkung.
   * Rueckwaerts zaehlt `index` sofort herunter (Start der Animation) und `currentMove` ist der
   * gerade zurueckgedrehte Zug; danach `currentMove` null.
   */
  stepBackward(): void;
  /** Springt ohne Animation zur Zuggrenze `index` (wird auf 0..total geklemmt) und pausiert. */
  jumpTo(index: number): void;
  getState(): PlayerState;
  /** Liefert eine Funktion zum Abmelden. */
  onChange(cb: (state: PlayerState) => void): () => void;
  destroy(): void;
}

const EMPTY_STATE: PlayerState = { index: 0, total: 0, playing: false, currentMove: null };

// Werte der cubing-Enums, hier als Literale, da die Enums nicht exportiert werden.
const DIRECTION_FORWARDS = 1;
const DIRECTION_BACKWARDS = -1;
const BOUNDARY_MOVE = 'move';

export function createPlayer(host: HTMLElement): CubePlayer {
  let moves: string[] = [];
  let starts: number[] = [];
  let end = 0;
  let timestamp = 0;
  let playing = false;
  let state: PlayerState = EMPTY_STATE;
  let destroyed = false;
  let twisty: TwistyPlayer | null = null;
  let detach: Array<() => void> = [];
  const listeners = new Set<(s: PlayerState) => void>();

  const recompute = (): void => {
    const { index, currentMove } = indexAtTimestamp(starts, end, timestamp);
    const next: PlayerState = {
      index,
      total: moves.length,
      playing,
      currentMove: currentMove === null ? null : (moves[currentMove] ?? null),
    };
    if (
      next.index === state.index &&
      next.total === state.total &&
      next.playing === state.playing &&
      next.currentMove === state.currentMove
    ) {
      return;
    }
    state = next;
    for (const cb of [...listeners]) cb(state);
  };

  const ready: Promise<TwistyPlayer> = (async () => {
    const { TwistyPlayer: Ctor } = await import('cubing/twisty');
    const p = new Ctor({
      puzzle: '3x3x3',
      visualization: '3D',
      controlPanel: 'none',
      background: 'none',
      hintFacelets: 'none',
      experimentalDragInput: 'none',
      viewerLink: 'none',
      alg: '',
    });
    if (destroyed) return p;
    // Der Player fuellt den Host-Container (Standardgroesse von cubing ist sonst fest).
    p.style.width = '100%';
    p.style.height = '100%';
    // Ohne Control-Panel kollabiert cubings Grid-Layout (contain: size) auf Hoehe 0. Das innere
    // Layout wird deshalb absolut an die Elementgroesse gebunden. Nur zusaetzliches CSS, kein Patch.
    p.style.position = 'relative';
    const fix = document.createElement('style');
    fix.textContent = '.wrapper { position: absolute; inset: 0; }';
    p.shadow.appendChild(fix);
    host.appendChild(p);
    const model = p.experimentalModel;
    const onTime = (info: { timestamp: number }): void => {
      timestamp = info.timestamp;
      recompute();
    };
    const onCoarse = (info: { playing: boolean }): void => {
      playing = info.playing;
      recompute();
    };
    model.detailedTimelineInfo.addFreshListener(onTime);
    model.coarseTimelineInfo.addFreshListener(onCoarse);
    detach = [
      () => model.detailedTimelineInfo.removeFreshListener(onTime),
      () => model.coarseTimelineInfo.removeFreshListener(onCoarse),
    ];
    twisty = p;
    return p;
  })();

  const animation = (p: TwistyPlayer) => p.controller.animationController;

  const withPlayer = (fn: (p: TwistyPlayer) => void): void => {
    void ready.then((p) => {
      if (!destroyed) fn(p);
    });
  };

  const setTimestamp = (p: TwistyPlayer, ms: number | 'start' | 'end'): void => {
    // Der Setter erwartet einen intern markierten Zahlentyp (MillisecondTimestamp).
    p.timestamp = ms as never;
  };

  return {
    async load(setup, alg) {
      const normalizedMoves = parseMoves(alg);
      const normalizedAlg = normalizedMoves.join(' ');
      const normalizedSetup = new Alg(setup).toString();
      const p = await ready;
      if (destroyed) return;
      animation(p).pause();
      p.experimentalSetupAlg = normalizedSetup;
      p.alg = normalizedAlg;
      setTimestamp(p, 'start');
      const model = p.experimentalModel;
      const indexer = await model.indexer.get();
      const range = await model.timeRange.get();
      const n = indexer.numAnimatedLeaves();
      if (n !== normalizedMoves.length) {
        throw new Error(`Zeitleiste inkonsistent: ${n} Animationsschritte, ${normalizedMoves.length} Zuege`);
      }
      moves = normalizedMoves;
      starts = Array.from({ length: n }, (_, i) => indexer.indexToMoveStartTimestamp(i as never));
      end = range.end;
      timestamp = range.start;
      playing = false;
      state = { ...EMPTY_STATE, total: -1 };
      recompute();
    },
    play: () => withPlayer((p) => p.play()),
    pause: () => withPlayer((p) => p.pause()),
    togglePlay: () => withPlayer((p) => p.togglePlay()),
    stepForward: () =>
      withPlayer((p) => {
        if (state.playing || state.index >= state.total) return;
        animation(p).play({
          direction: DIRECTION_FORWARDS as never,
          untilBoundary: BOUNDARY_MOVE as never,
          autoSkipToOtherEndIfStartingAtBoundary: false,
        });
      }),
    stepBackward: () =>
      withPlayer((p) => {
        if (state.playing || state.index <= 0) return;
        animation(p).play({
          direction: DIRECTION_BACKWARDS as never,
          untilBoundary: BOUNDARY_MOVE as never,
          autoSkipToOtherEndIfStartingAtBoundary: false,
        });
      }),
    jumpTo: (index) =>
      withPlayer((p) => {
        animation(p).pause();
        const i = clampIndex(index, starts.length);
        setTimestamp(p, i === 0 ? 'start' : i >= starts.length ? 'end' : timestampAtIndex(starts, end, i));
      }),
    getState: () => state,
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      for (const d of detach) d();
      detach = [];
      if (twisty) {
        animation(twisty).pause();
        twisty.remove();
        twisty = null;
      }
    },
  };
}
