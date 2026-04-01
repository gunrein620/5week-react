// ── App.js ────────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { getRoute, navigate } from '../framework/router.js';
import { Login } from './Login.js';
import { Feed } from './Feed.js';
import { CreatePost } from './CreatePost.js';
import { Header } from './Header.js';

export function App() {
  const route = getRoute();
  const username = localStorage.getItem('username');
  const isLoggedIn = Boolean(username);
  const effectiveRoute = isLoggedIn ? route : '#/login';

  // 렌더 중 즉시 navigate하면 현재 diff/patch 흐름과 충돌할 수 있어
  // 비로그인 사용자는 항상 로그인 화면 트리를 먼저 안정적으로 렌더한다.
  if (!isLoggedIn && route !== '#/login') {
    queueMicrotask(() => navigate('#/login'));
  }

  let page;
  switch (effectiveRoute) {
    case '#/login':
      page = Login();
      break;
    case '#/create':
      page = CreatePost();
      break;
    default:
      page = Feed();
  }

  return createElement('div', { class: 'app' },
    isLoggedIn ? Header() : createElement('span', {}),
    createElement('main', { class: 'main' }, page)
  );
}
