import { createPlayer, parseMoves } from '../cube/adapter';
import type { CubePlayer, PlayerState } from '../cube/adapter';

export interface PlayerViewOptions {
  setup: string;
  alg: string;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showNotice(root: HTMLElement, text: string): void {
  root.replaceChildren();
  const p = document.createElement('p');
  p.className = 'notice';
  p.setAttribute('role', 'alert');
  p.textContent = text;
  root.appendChild(p);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
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

/** Baut die Player-Ansicht in `root`. Gibt eine Aufraeum-Funktion zurueck. */
export async function mountPlayerView(root: HTMLElement, opts: PlayerViewOptions): Promise<() => void> {
  if (!hasWebGL()) {
    showNotice(
      root,
      'Dieser Browser unterstützt WebGL nicht oder es ist deaktiviert. Bitte aktiviere WebGL oder nutze einen aktuellen Browser.',
    );
    return () => undefined;
  }

  let moves: string[];
  try {
    moves = parseMoves(opts.alg);
  } catch {
    showNotice(root, 'Der Algorithmus konnte nicht gelesen werden.');
    return () => undefined;
  }

  root.replaceChildren();
  const view = el('main', 'player', root);
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
    const s = el('span', 'alg-move', algText);
    s.textContent = m;
    s.dataset['i'] = String(i);
    return s;
  });

  const player: CubePlayer = createPlayer(cubeArea);
  // Bedienung erst nach fertigem load(); vorher wuerde jumpTo/Schritt ins Leere laufen.
  let ready = false;
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
    const active = s.currentMove !== null ? s.index : s.index - 1;
    spans.forEach((sp, i) => {
      const on = i === active;
      sp.classList.toggle('active', on);
      sp.classList.toggle('done', i < s.index && !on);
      if (on) sp.setAttribute('aria-current', 'true');
      else sp.removeAttribute('aria-current');
    });
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

  try {
    await player.load(opts.setup, opts.alg);
  } catch (err) {
    console.error(err);
    unsub();
    player.destroy();
    showNotice(
      root,
      'Die 3D-Ansicht konnte nicht geladen werden. Bitte Seite neu laden oder einen anderen Browser nutzen.',
    );
    return () => undefined;
  }
  ready = true;
  slider.disabled = false;
  render(player.getState());
  view.dataset['ready'] = 'true';

  return () => {
    unsub();
    player.destroy();
  };
}
