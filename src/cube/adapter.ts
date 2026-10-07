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
import type { KPattern, KPuzzle } from 'cubing/kpuzzle';
import { cube3x3x3 } from 'cubing/puzzles';
import type { TwistyPlayer } from 'cubing/twisty';
import { ORIENTATION_SETUP, REGION_SLOTS, type CubeRegion } from './regions';

export { CUBE_REGIONS, ORIENTATION_SETUP } from './regions';
export type { CubeRegion } from './regions';

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
// Orientierung (Weiss unten, Gruen vorne) und Faellepruefung
// ---------------------------------------------------------------------------

/**
 * Stellt die Orientierung (z2) genau einmal voran. Beginnt `setup` bereits mit z2, bleibt es
 * unveraendert (idempotent). Der Player nutzt das als nicht animiertes Setup.
 */
export function withOrientation(setup: string): string {
  const first = parseMoves(setup)[0];
  if (first === ORIENTATION_SETUP) return setup.trim();
  return `${ORIENTATION_SETUP} ${setup}`.trim();
}

/** Setup fuer einen Fall: Orientierung + Inverses der Loesung. */
export function caseSetup(loesung: string): string {
  return withOrientation(invert(loesung));
}

const WHOLE_CUBE_ROTATIONS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));

/**
 * Semantik der kpuzzle-Daten (cubing 0.63.8, 3x3x3), gegen state.ts-Facelets verifiziert:
 * - Orbits EDGES (12 Plaetze, Orientierung mod 2), CORNERS (8, mod 3), CENTERS (6).
 * - patternData[orbit].pieces[slot] = Teil, das auf dem Platz sitzt; .orientation[slot] = dessen Drehung.
 * - Kantenplaetze: UF UR UB UL DF DR DB DL FR FL BR BL; Eckenplaetze: UFR URB UBL ULF DRF DFL DLB DBR.
 * - Referenz = Standardmuster nach z2 (Teile 'wandern' mit, Orientierung bleibt 0). Der Vergleich
 *   erfolgt, nachdem eine ganze Wuerfeldrehung die Mitten wieder in Referenzlage gebracht hat.
 *
 * Referenz (Standardmuster nach z2) und Mitten-Referenz werden einmal berechnet; ein
 * fehlgeschlagener Ladeversuch wird nicht gecacht.
 */
let referencePromise: Promise<{ kpuzzle: KPuzzle; ref: KPattern; refCenters: readonly number[] }> | null = null;
function reference() {
  referencePromise ??= cube3x3x3
    .kpuzzle()
    .then((kpuzzle) => {
      const ref = kpuzzle.defaultPattern().applyAlg(new Alg(ORIENTATION_SETUP));
      return { kpuzzle, ref, refCenters: ref.patternData['CENTERS']!.pieces };
    })
    .catch((e: unknown) => {
      referencePromise = null;
      throw e;
    });
  return referencePromise;
}

async function canonicalPatternAfter(setup: string, alg: string, extra = '') {
  const { kpuzzle, ref, refCenters } = await reference();
  const start = kpuzzle.defaultPattern().applyAlg(new Alg(withOrientation(setup))).applyAlg(new Alg(alg));
  for (const rot of WHOLE_CUBE_ROTATIONS) {
    const p = start.applyAlg(new Alg(rot));
    const c = p.patternData['CENTERS']!.pieces;
    if (c.every((v, i) => v === refCenters[i])) return { ref, pattern: p.applyAlg(new Alg(extra)) };
  }
  throw new Error('Mittelsteine lassen sich keiner Wuerfeldrehung zuordnen');
}

type PatternPair = Awaited<ReturnType<typeof canonicalPatternAfter>>;

function violatedRegions({ ref, pattern }: PatternPair, regions: readonly CubeRegion[]): CubeRegion[] {
  const E = pattern.patternData['EDGES']!;
  const C = pattern.patternData['CORNERS']!;
  const rE = ref.patternData['EDGES']!;
  const rC = ref.patternData['CORNERS']!;
  const edgeOk = (s: number): boolean => E.pieces[s] === rE.pieces[s] && E.orientation[s] === rE.orientation[s];
  const cornerOk = (s: number): boolean => C.pieces[s] === rC.pieces[s] && C.orientation[s] === rC.orientation[s];
  return regions.filter((region) => {
    const slots = REGION_SLOTS[region];
    const good =
      slots.edges.every(edgeOk) &&
      slots.edgeOrientation.every((s) => E.orientation[s] === rE.orientation[s]) &&
      slots.corners.every(cornerOk) &&
      slots.cornerPosition.every((s) => C.pieces[s] === rC.pieces[s]);
    return !good;
  });
}

/**
 * Liefert die Bereiche aus `regions`, die nach `setup` + `alg` NICHT erfuellt sind (leer = alle erfuellt).
 * `setup` wird mit Orientierung z2 versehen (falls nicht vorhanden). Ganze Wuerfeldrehungen im Algorithmus
 * werden herausgerechnet.
 */
export async function regionsSatisfied(setup: string, alg: string, regions: readonly CubeRegion[]): Promise<CubeRegion[]> {
  return violatedRegions(await canonicalPatternAfter(setup, alg), regions);
}

export type Auf = '' | 'U' | 'U2' | "U'";

export interface CaseCheckInput {
  /** Setup des Falls (z. B. caseSetup(loesung)). */
  setup: string;
  alg: string;
  /** Bereiche, die nach dem Algorithmus weiterhin erfuellt sein muessen. */
  erhalten: readonly CubeRegion[];
  /** Bereiche, die nach dem Algorithmus erfuellt sein muessen. */
  erreicht: readonly CubeRegion[];
  /** Erlaubt ein abschliessendes U, U2 oder U' (AUF) nach dem Algorithmus. */
  aufTolerant: boolean;
}

export interface CaseCheck {
  ok: boolean;
  /** Der noetige abschliessende Zug; '' wenn keiner noetig war oder nicht tolerant. */
  auf: Auf;
  /** Verletzte Bereiche (beim besten Versuch; bei ok leer). */
  verletzt: CubeRegion[];
  /** Waren alle `erreicht`-Bereiche schon vor dem Algorithmus erfuellt? */
  vorherSchonErreicht: boolean;
}

export async function checkSolvesCase(input: CaseCheckInput): Promise<CaseCheck> {
  const required = [...new Set([...input.erhalten, ...input.erreicht])];
  const aufs: Auf[] = input.aufTolerant ? ['', 'U', 'U2', "U'"] : [''];
  const attempts: Array<{ auf: Auf; verletzt: CubeRegion[] }> = [];
  for (const auf of aufs) {
    const verletzt = violatedRegions(await canonicalPatternAfter(input.setup, input.alg, auf), required);
    attempts.push({ auf, verletzt });
    if (verletzt.length === 0) break;
  }
  const result = attempts.reduce((a, b) => (b.verletzt.length < a.verletzt.length ? b : a));
  const before = await regionsSatisfied(input.setup, '', input.erreicht);
  return {
    ok: result.verletzt.length === 0,
    auf: result.verletzt.length === 0 ? result.auf : '',
    verletzt: result.verletzt,
    vorherSchonErreicht: input.erreicht.length > 0 && before.length === 0,
  };
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
  /** Springt ohne Animation zur Zuggrenze `index` (wird auf 0..total geklemmt) und pausiert. Ohne abgeschlossenes `load` ohne Wirkung. */
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

/**
 * Workaround fuer cubing 0.63.8: Mit controlPanel 'none' kollabiert das innere Grid-Layout
 * ('.wrapper' mit 'contain: size') auf Hoehe 0, die Canvas ist dann 0 px hoch und der Wuerfel
 * unsichtbar. Das interne Element wird deshalb absolut an die Elementgroesse gebunden. Haengt am
 * internen Klassennamen '.wrapper'; bei einem cubing-Update pruefen. Reines Zusatz-CSS, kein Patch.
 */
const SHADOW_LAYOUT_FIX_CSS = '.wrapper { position: absolute; inset: 0; }';

/** Typisierte Huelle um die Stellen, an denen cubings markierte Typen/Enums Casts erzwingen. */
const cubingCalls = {
  setTimestamp(p: TwistyPlayer, ms: number | 'start' | 'end'): void {
    // Der Setter erwartet einen intern markierten Zahlentyp (MillisecondTimestamp).
    p.timestamp = ms as never;
  },
  playOneMove(p: TwistyPlayer, direction: 1 | -1): void {
    p.controller.animationController.play({
      direction: (direction === 1 ? DIRECTION_FORWARDS : DIRECTION_BACKWARDS) as never,
      untilBoundary: BOUNDARY_MOVE as never,
      autoSkipToOtherEndIfStartingAtBoundary: false,
    });
  },
  startTimestamp(indexer: { indexToMoveStartTimestamp(i: never): number }, i: number): number {
    return indexer.indexToMoveStartTimestamp(i as never);
  },
};

/**
 * Erzeugt den Player und haengt ihn an `host`. Die Erzeugung ist asynchron (cubing/twisty wird
 * nachgeladen). Schlaegt sie fehl, rejecten `load`-Aufrufe mit dem Fehler; alle anderen Methoden
 * sind dann no-ops. `destroy` waehrend des Ladens verhindert, dass der Player angehaengt wird.
 * `jumpTo`, `stepForward` und `stepBackward` sind ohne erfolgreich abgeschlossenes `load`
 * (getState().total === 0) ohne Wirkung. Ein spaeteres `load` ersetzt ein noch laufendes;
 * das verdraengte Promise resolved ohne Wirkung.
 */
export function createPlayer(host: HTMLElement): CubePlayer {
  let moves: string[] = [];
  let starts: number[] = [];
  let end = 0;
  let timestamp = 0;
  let playing = false;
  let loaded = false;
  let loadGen = 0;
  let initError: unknown = null;
  /** Synchron gesetzt, sobald ein Schritt angestossen wird; verhindert Doppelausloesung. */
  let stepBusy = false;
  let stepSawPlaying = false;
  let state: PlayerState = EMPTY_STATE;
  let destroyed = false;
  let twisty: TwistyPlayer | null = null;
  let detach: Array<() => void> = [];
  const listeners = new Set<(s: PlayerState) => void>();

  const recompute = (force = false): void => {
    const { index, currentMove } = indexAtTimestamp(starts, end, timestamp);
    const next: PlayerState = {
      index,
      total: moves.length,
      playing,
      currentMove: currentMove === null ? null : (moves[currentMove] ?? null),
    };
    if (
      !force &&
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

  const ready: Promise<TwistyPlayer | null> = (async () => {
    try {
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
      if (destroyed) return null;
      // Der Player fuellt den Host-Container (Standardgroesse von cubing ist sonst fest).
      p.style.width = '100%';
      p.style.height = '100%';
      p.style.position = 'relative';
      const fix = document.createElement('style');
      fix.textContent = SHADOW_LAYOUT_FIX_CSS;
      p.shadow.appendChild(fix);
      host.appendChild(p);
      twisty = p;
      const model = p.experimentalModel;
      const onTime = (info: { timestamp: number }): void => {
        timestamp = info.timestamp;
        recompute();
      };
      const onCoarse = (info: { playing: boolean }): void => {
        playing = info.playing;
        if (playing) stepSawPlaying = true;
        else if (stepSawPlaying) {
          stepBusy = false;
          stepSawPlaying = false;
        }
        recompute();
      };
      model.detailedTimelineInfo.addFreshListener(onTime);
      model.coarseTimelineInfo.addFreshListener(onCoarse);
      detach = [
        () => model.detailedTimelineInfo.removeFreshListener(onTime),
        () => model.coarseTimelineInfo.removeFreshListener(onCoarse),
      ];
      return p;
    } catch (e) {
      initError = e;
      if (twisty) (twisty as TwistyPlayer).remove();
      twisty = null;
      return null;
    }
  })();

  const resetStep = (): void => {
    stepBusy = false;
    stepSawPlaying = false;
  };

  const withPlayer = (fn: (p: TwistyPlayer) => void): void => {
    void ready.then((p) => {
      if (p && !destroyed) fn(p);
    });
  };

  const step = (direction: 1 | -1): void => {
    if (!loaded || stepBusy || state.playing) return;
    if (direction === 1 ? state.index >= state.total : state.index <= 0) return;
    stepBusy = true;
    stepSawPlaying = false;
    withPlayer((p) => cubingCalls.playOneMove(p, direction));
  };

  return {
    async load(setup, alg) {
      const normalizedMoves = parseMoves(alg);
      const normalizedAlg = normalizedMoves.join(' ');
      const normalizedSetup = new Alg(withOrientation(setup)).toString();
      const gen = ++loadGen;
      const p = await ready;
      if (!p) {
        if (destroyed) return;
        throw initError instanceof Error ? initError : new Error('cubing/twisty konnte nicht geladen werden');
      }
      if (destroyed || gen !== loadGen) return;
      p.controller.animationController.pause();
      resetStep();
      p.experimentalSetupAlg = normalizedSetup;
      p.alg = normalizedAlg;
      cubingCalls.setTimestamp(p, 'start');
      const model = p.experimentalModel;
      const indexer = await model.indexer.get();
      if (destroyed || gen !== loadGen) return;
      const range = await model.timeRange.get();
      if (destroyed || gen !== loadGen) return;
      const n = indexer.numAnimatedLeaves();
      if (n !== normalizedMoves.length) {
        throw new Error(`Zeitleiste inkonsistent: ${n} Animationsschritte, ${normalizedMoves.length} Zuege`);
      }
      moves = normalizedMoves;
      starts = Array.from({ length: n }, (_, i) => cubingCalls.startTimestamp(indexer, i));
      end = range.end;
      timestamp = range.start;
      playing = false;
      loaded = true;
      recompute(true);
    },
    play: () => withPlayer((p) => p.play()),
    pause: () => withPlayer((p) => p.pause()),
    togglePlay: () => withPlayer((p) => p.togglePlay()),
    stepForward: () => step(1),
    stepBackward: () => step(-1),
    jumpTo: (index) => {
      if (!loaded) return;
      withPlayer((p) => {
        p.controller.animationController.pause();
        resetStep();
        const i = clampIndex(index, starts.length);
        cubingCalls.setTimestamp(p, i === 0 ? 'start' : i >= starts.length ? 'end' : timestampAtIndex(starts, end, i));
      });
    },
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
        twisty.controller.animationController.pause();
        twisty.remove();
        twisty = null;
      }
    },
  };
}
