// ── Header.js ─────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { navigate } from '../framework/router.js';
import { getRoute } from '../framework/router.js';

export function Header() {
  const username = localStorage.getItem('username');
  const route = getRoute();

  const handleLogout = () => {
    localStorage.removeItem('username');
    navigate('#/login');
  };

  if (!username || route === '#/login') return createElement('span', {});

  return createElement('header', { class: 'header' },
    createElement('div', { class: 'header__inner' },
      createElement('a', { class: 'header__logo', onClick: () => navigate('#/feed') },
        createElement('span', { class: 'header__logo-icon' }, '🔥'),
        createElement('span', { class: 'header__logo-text' }, 'Flicker')
      ),
      createElement('div', { class: 'header__actions' },
        createElement('button', {
          class: 'btn btn-primary btn-sm',
          onClick: () => navigate('#/create'),
        }, '+ 공유'),
        createElement('span', { class: 'header__username' }, `@${username}`),
        createElement('button', {
          class: 'btn btn-ghost btn-sm',
          onClick: handleLogout,
        }, '나가기')
      )
    )
  );
}
