import './ui/styles.css';
import { mountPlayerView } from './ui/player-view';

const root = document.getElementById('app');
if (root) {
  // Die Cleanup-Funktion bleibt erhalten (z. B. fuer spaetere Ansichtswechsel oder HMR).
  let cleanup: () => void = () => undefined;
  mountPlayerView(root, { setup: '', alg: "R U R' U'" })
    .then((fn) => {
      cleanup = fn;
    })
    .catch((err: unknown) => {
      console.error(err);
      root.textContent = 'Die Anwendung konnte nicht gestartet werden. Bitte Seite neu laden.';
    });
  window.addEventListener('pagehide', () => cleanup());
}
