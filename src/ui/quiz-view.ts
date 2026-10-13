/**
 * Erkennungs-Quiz: Der Würfel zeigt die Ausgangsstellung eines Falls (ohne Lösung), der Nutzer wählt
 * den passenden Fall. Gefragt werden Fälle aus den algorithmischen Phasen; schwache und noch nicht
 * gelernte Fälle kommen häufiger. Nutzt nur den Adapter und den Content-Loader, nie `cubing` direkt.
 */
import { caseSetup, createPlayer } from '../cube/adapter';
import type { CubePlayer } from '../cube/adapter';
import { loadMethode } from '../../content/loader';
import type { Fall } from '../../content/schema';
import { el, link } from './dom';
import { caseKey, pickOptions, pickQuestion, progress } from './progress';
import { caseHref, homeHref, quizHref } from './router';
import type { View } from './views';

const OPTION_COUNT = 4;

interface Question {
  key: string;
  nr: number;
  fall: Fall;
  titel: string;
  siblings: Fall[];
}

/** Quiz über alle algorithmischen Phasen (`nr` null) oder über eine Phase. Null, wenn `nr` unbekannt/ohne Fälle ist. */
export function quizView(page: HTMLElement, nr: number | null): View | null {
  const { eintraege } = loadMethode();
  const algo = eintraege.flatMap((e) => (e.typ === 'algorithmisch' ? [e] : []));
  const chosen = nr === null ? algo : algo.filter((e) => e.phase === nr);
  if (chosen.length === 0) return null;

  const questions = new Map<string, Question>();
  for (const e of chosen) {
    for (const fall of e.faelle) {
      const key = caseKey(e.phase, fall.id);
      questions.set(key, { key, nr: e.phase, fall, titel: e.titel, siblings: e.faelle });
    }
  }
  const keys = [...questions.keys()];

  const nav = el('nav', 'crumbs', page);
  nav.setAttribute('aria-label', 'Navigation');
  link(nav, homeHref(), '← Alle Phasen', 'crumb');
  const h1 = el('h1', '', page, nr === null ? 'Quiz: Fälle erkennen' : `Quiz: Phase ${nr}`);
  h1.tabIndex = -1;
  el('p', 'lead', page, 'Welcher Fall ist das? Der Würfel zeigt die Ausgangsstellung. Wähle den passenden Fall.');

  const filter = el('nav', 'filter', page);
  filter.setAttribute('aria-label', 'Phase wählen');
  const addFilter = (href: string, text: string, current: boolean): void => {
    const a = link(filter, href, text, 'chip');
    if (current) a.setAttribute('aria-current', 'page');
  };
  addFilter(quizHref(), 'Alle', nr === null);
  for (const e of algo) addFilter(quizHref(e.phase), `Phase ${e.phase}`, nr === e.phase);

  const score = el('p', 'score', page);
  score.dataset['testid'] = 'quiz-score';
  const area = el('div', 'quiz-area', page);

  let asked = 0;
  let right = 0;
  let last: string | null = null;
  let player: CubePlayer | null = null;
  let destroyed = false;

  const renderScore = (): void => {
    score.textContent = asked === 0 ? '' : `Richtig: ${right} von ${asked}`;
  };

  const next = (): void => {
    player?.destroy();
    player = null;
    area.replaceChildren();
    const key = pickQuestion(keys, progress, last);
    const q = key === null ? undefined : questions.get(key);
    if (!q) return;
    last = q.key;

    const cube = el('div', 'cube-area', area);
    cube.dataset['testid'] = 'cube';
    cube.setAttribute('role', 'img');
    cube.setAttribute('aria-label', 'Würfel in der Ausgangsstellung des gesuchten Falls');
    const p = createPlayer(cube);
    player = p;
    p.load(caseSetup(q.fall.loesung), '').catch((err: unknown) => {
      if (destroyed || player !== p) return;
      console.error(err);
      cube.replaceChildren();
      el('p', 'notice', cube, 'Die 3D-Ansicht konnte nicht geladen werden. Bitte Seite neu laden oder einen anderen Browser nutzen.').setAttribute(
        'role',
        'alert',
      );
    });

    const group = el('div', 'options', area);
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Welcher Fall aus Phase ${q.nr} (${q.titel}) ist das?`);
    const feedback = el('div', 'feedback', area);
    feedback.setAttribute('role', 'status');
    feedback.dataset['testid'] = 'quiz-feedback';

    const buttons = pickOptions(q.siblings, q.fall, OPTION_COUNT).map((f) => {
      const b = el('button', 'option', group, f.name);
      b.type = 'button';
      b.dataset['testid'] = `quiz-option-${f.id}`;
      return { f, b };
    });

    let answered = false;
    for (const { f, b } of buttons) {
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const ok = f.id === q.fall.id;
        progress.recordQuiz(q.key, ok);
        asked += 1;
        if (ok) right += 1;
        renderScore();
        for (const o of buttons) {
          o.b.disabled = true;
          if (o.f.id === q.fall.id) o.b.classList.add('correct');
          else if (o.b === b) o.b.classList.add('wrong');
        }
        el('p', ok ? 'result ok' : 'result bad', feedback, ok ? 'Richtig!' : `Leider falsch. Richtig ist: ${q.fall.name}.`);
        el('p', '', feedback, `Erkennung: ${q.fall.erkennung}`);
        const lines = el('p', '', feedback, 'Lösung: ');
        el('code', 'moves', lines, q.fall.loesung);
        const actions = el('div', 'actions', feedback);
        const more = el('button', 'primary', actions, 'Nächste Frage');
        more.type = 'button';
        more.dataset['testid'] = 'quiz-next';
        more.addEventListener('click', next);
        link(actions, caseHref(q.nr, q.fall.id), 'Fall ansehen', 'secondary');
        more.focus();
      });
    }
  };

  next();
  return {
    title: nr === null ? 'Quiz' : `Quiz Phase ${nr}`,
    destroy: () => {
      destroyed = true;
      player?.destroy();
      player = null;
    },
  };
}
