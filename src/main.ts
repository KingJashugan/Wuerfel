import './ui/styles.css';
import { mountPlayerView } from './ui/player-view';

const root = document.getElementById('app');
if (root) {
  void mountPlayerView(root, { setup: '', alg: "R U R' U'" });
}
