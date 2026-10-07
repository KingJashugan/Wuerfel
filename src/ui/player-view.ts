import { createPlayer, parseMoves } from '../cube/adapter';
import type { CubePlayer, PlayerState } from '../cube/adapter';
import { el } from './dom';

export interface PlayerViewOptions {
  setup: string;
  alg: string;
  /** Wird bei jeder Zustandsaenderung aufgerufen (auch einmal initial und nach dem Laden). */
  onState?: (state: PlayerState) => void;
}

export interface PlayerHandle {
  /** Resolved true, sobald der Player geladen ist; false, wenn er nicht starten konnte (Hinweis ist dann angezeigt). */
  ready: Promise<boolean>;
  /** Idempotent; auch waehrend des Ladens erlaubt. */
  destroy(): void;
}

/** Index des hervorgehobenen Zugs (laufender Zug oder zuletzt ausgefuehrter), -1 am Start. */
export function activeMoveIndex(s: PlayerState): number {
  return s.currentMove !== null ? s.index : s.index - 1;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showNotice(host: HTMLElement, text: string): void {
  host.replaceChildren();
  const p = el('p', 'notice', host, text);
  p.setAttribute('role', 'alert');
}

type IconName = 'first' | 'back' | 'play' | 'pause' | 'next' | 'last';

const ICON_PATHS: Record<IconName, string> = {
  first: 'M3 5h2v14H3zM13 5v14L5.5 12zM21 5v14L13.5 12z',
  back: 'M3 5h2v14H3zM19 5v14L8.5 12z',
  play: 'M7 4.5v15L19.5 12z',
  pause: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  next: 'M5 5v14l10.5-7zM19 5h2v14h-2z',
  last: 'M19 5h2v14h-2zM11 5v14l7.5-7zM3 5v14l7.5-7z',
};

/** Ersetzt den Inhalt des Buttons durch ein Inline-SVG (kein Emoji-Rendering). */
function setIcon(b: HTMLElement, name: IconName): void {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  b.replaceChildren(svg);
}

function setBlocked(b: HTMLElement, blocked: boolean): void {
  b.setAttribute('aria-disabled', String(blocked));
}

function button(parent: HTMLElement, id: string, label: string, icon: IconName): HTMLButtonElement {
  const b = el('button', 'ctl', parent);
  b.type = 'button';
  b.dataset['testid'] = id;
  b.setAttribute('aria-label', label);
  b.title = label;
  setIcon(b, icon);
  return b;
}

const NO_OP_HANDLE: PlayerHandle = { ready: Promise.resolve(false), destroy: () => undefined };

/**
 * Baut die Player-Ansicht (Wuerfel, Steuerleiste, Zugliste) in `host`. Synchron: Der Wuerfel
 * laedt im Hintergrund, `handle.destroy()` ist jederzeit (auch waehrend des Ladens) sicher.
 * Kann der Player nicht starten (kein WebGL, Ladefehler), steht ein Hinweistext im `host`.
 */
export function mountPlayer(host: HTMLElement, opts: PlayerViewOptions): PlayerHandle {
  if (!hasWebGL()) {
    showNotice(
      host,
      'Dieser Browser unterstützt WebGL nicht oder es ist deaktiviert, deshalb kann der 3D-Würfel nicht angezeigt werden. Bitte aktiviere WebGL oder nutze einen aktuellen Browser. Die Erklärungen unten kannst du trotzdem lesen.',
    );
    return NO_OP_HANDLE;
  }

  let moves: string[];
  try {
    moves = parseMoves(opts.alg);
  } catch {
    showNotice(host, 'Der Algorithmus konnte nicht gelesen werden.');
    return NO_OP_HANDLE;
  }

  const view = el('section', 'player', host);
  view.setAttribute('aria-label', 'Würfel-Player');
  const cubeArea = el('div', 'cube-area', view);
  cubeArea.dataset['testid'] = 'cube';
  const panel = el('div', 'panel', view);

  const status = el('div', 'status', panel);
  const counter = el('span', 'counter', status);
  counter.dataset['testid'] = 'counter';
  // Eigene Live-Region: Ansage nur bei manueller Navigation, nicht bei jedem Zug waehrend des Abspielens.
  const live = el('span', 'sr-only', status);
  live.setAttribute('aria-live', 'polite');
  const current = el('span', 'current-move', status);
  current.dataset['testid'] = 'current-move';

  const controls = el('div', 'controls', panel);
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Steuerung');
  const bStart = button(controls, 'to-start', 'Zurück zum Start', 'first');
  const bBack = button(controls, 'step-back', 'Schritt zurück', 'back');
  const bPlay = button(controls, 'play-pause', 'Abspielen', 'play');
  const bFwd = button(controls, 'step-forward', 'Schritt vor', 'next');
  const bEnd = button(controls, 'to-end', 'Ans Ende', 'last');

  const slider = el('input', 'slider', panel);
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(moves.length);
  slider.step = '1';
  slider.value = '0';
  slider.dataset['testid'] = 'slider';
  slider.setAttribute('aria-label', 'Zug wählen');

  const algText = el('p', 'alg', panel);
  algText.dataset['testid'] = 'alg';
  const spans = moves.map((m, i) => {
    const s = el('span', 'alg-move', algText, m);
    s.dataset['i'] = String(i);
    return s;
  });

  const player: CubePlayer = createPlayer(cubeArea);
  // Bedienung erst nach fertigem load(); vorher wuerde jumpTo/Schritt ins Leere laufen.
  let ready = false;
  let destroyed = false;
  slider.disabled = true;

  const render = (s: PlayerState): void => {
    const total = Math.max(s.total, 0);
    const last = s.index > 0 ? moves[s.index - 1] : undefined;
    counter.textContent = `Zug ${s.index} / ${total}`;
    current.textContent = `Aktueller Zug: ${s.currentMove ?? last ?? '–'}`;
    slider.max = String(total);
    slider.value = String(s.index);
    slider.setAttribute('aria-valuetext', `Zug ${s.index} von ${total}`);
    const label = s.playing ? 'Pause' : 'Abspielen';
    setIcon(bPlay, s.playing ? 'pause' : 'play');
    bPlay.setAttribute('aria-label', label);
    bPlay.title = label;
    bPlay.dataset['playing'] = String(s.playing);
    const animating = s.currentMove !== null;
    // aria-disabled statt disabled: Der Fokus bleibt auf dem Button. Klicks werden in guard() ignoriert.
    // Waehrend einer laufenden Animation (playing, auch bei Einzelschritten) sind Schritte gesperrt, sonst
    // gehen Taps verloren. Nach Pause mitten im Zug bleibt Schritt vor/zurueck moeglich (beendet den Zug).
    const busy = animating && s.playing;
    setBlocked(bStart, !ready || (s.index === 0 && !animating));
    setBlocked(bEnd, !ready || s.index >= total);
    setBlocked(bBack, !ready || busy || (s.index === 0 && !animating));
    setBlocked(bFwd, !ready || busy || (s.index >= total && !animating));
    setBlocked(bPlay, !ready);
    if (!s.playing && !animating) live.textContent = `Zug ${s.index} von ${total}`;
    const active = activeMoveIndex(s);
    spans.forEach((sp, i) => {
      const on = i === active;
      sp.classList.toggle('active', on);
      sp.classList.toggle('done', i < s.index && !on);
      if (on) sp.setAttribute('aria-current', 'true');
      else sp.removeAttribute('aria-current');
    });
    opts.onState?.(s);
  };

  const unsub = player.onChange(render);
  const guard = (b: HTMLElement, fn: () => void): void =>
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') fn();
    });
  guard(bStart, () => player.jumpTo(0));
  guard(bBack, () => player.stepBackward());
  guard(bPlay, () => player.togglePlay());
  guard(bFwd, () => player.stepForward());
  guard(bEnd, () => player.jumpTo(moves.length));
  slider.addEventListener('input', () => {
    if (ready) player.jumpTo(Number(slider.value));
  });
  render(player.getState());

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    unsub();
    player.destroy();
  };

  const readyPromise = player.load(opts.setup, opts.alg).then(
    () => {
      if (destroyed) return false;
      ready = true;
      slider.disabled = false;
      render(player.getState());
      view.dataset['ready'] = 'true';
      return true;
    },
    (err: unknown) => {
      if (destroyed) return false;
      console.error(err);
      destroy();
      showNotice(
        host,
        'Die 3D-Ansicht konnte nicht geladen werden. Bitte Seite neu laden oder einen anderen Browser nutzen.',
      );
      return false;
    },
  );

  return { ready: readyPromise, destroy };
}
