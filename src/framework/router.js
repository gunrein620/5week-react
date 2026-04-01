// ── router.js ─────────────────────────────────────────────────────────────────
import { scheduleRender } from './hooks.js';

export function getRoute() {
  return window.location.hash || '#/feed';
}

export function navigate(hash) {
  window.location.hash = hash;
}

window.addEventListener('hashchange', () => {
  scheduleRender();
});
