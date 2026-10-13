/**
 * App-Huelle: Kopfzeile, Hash-Routing und Mount/Unmount der Seiten. Beim Routenwechsel wird die
 * alte Seite (inkl. Player) zuerst zerstoert, dann die neue synchron aufgebaut; der Player laedt
 * im Hintergrund und ist auch waehrend des Ladens sicher zerstoerbar (kein Leck, keine Races).
 */
import { el, link } from './dom';
import { homeHref, parseHash } from './router';
import type { Route } from './router';
import { quizView } from './quiz-view';
import { caseView, homeView, phaseView } from './views';
import type { View } from './views';

const APP_TITLE = 'Cube Trainer';

function notice(page: HTMLElement, text: string): View {
  const p = el('p', 'notice', page, text);
  p.setAttribute('role', 'alert');
  link(page, homeHref(), '← Zur Startseite', 'crumb');
  return { title: APP_TITLE, destroy: () => undefined };
}

function build(route: Route, page: HTMLElement): View {
  try {
    let view: View | null = null;
    switch (route.kind) {
      case 'home':
        view = homeView(page);
        break;
      case 'phase':
        view = phaseView(page, route.nr);
        break;
      case 'case':
        view = caseView(page, route.nr, route.id);
        break;
      case 'quiz':
        view = quizView(page, route.nr);
        break;
      case 'notfound':
        break;
    }
    if (view) return view;
    page.replaceChildren();
    return notice(page, 'Diese Seite gibt es nicht.');
  } catch (err) {
    console.error(err);
    page.replaceChildren();
    return notice(page, 'Die Seite konnte nicht angezeigt werden. Bitte lade die Seite neu.');
  }
}

/** Startet die App in `root`. Gibt eine Funktion zum vollstaendigen Abbau zurueck. */
export function startApp(root: HTMLElement): () => void {
  root.replaceChildren();
  const header = el('header', 'topbar', root);
  const brand = link(header, homeHref(), APP_TITLE, 'brand');
  brand.dataset['testid'] = 'brand';
  const page = el('main', 'page', root);
  page.id = 'main';

  let current: View | null = null;

  const show = (): void => {
    current?.destroy();
    current = null;
    page.replaceChildren();
    const view = build(parseHash(location.hash), page);
    current = view;
    document.title = view.title === APP_TITLE ? APP_TITLE : `${view.title} – ${APP_TITLE}`;
    page.dataset['route'] = location.hash || '#/';
    window.scrollTo(0, 0);
    page.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };

  window.addEventListener('hashchange', show);
  const teardown = (): void => {
    window.removeEventListener('hashchange', show);
    current?.destroy();
    current = null;
  };
  show();
  return teardown;
}
