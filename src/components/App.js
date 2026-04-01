// ── App.js ────────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useEffect, useState } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { getRoute, navigate } from '../framework/router.js';
import { Login } from './Login.js';
import { Feed } from './Feed.js';
import { CreatePost } from './CreatePost.js';
import { Header } from './Header.js';
import { api } from '../services/api.js';

export function App() {
  beginComponent('AppShell');
  const [authReady, setAuthReady] = useState(false);
  const route = getRoute();
  const username = localStorage.getItem('username');
  const isLoggedIn = Boolean(username);
  const effectiveRoute = isLoggedIn ? route : '#/login';

  useEffect(() => {
    let cancelled = false;

    if (!username) {
      setAuthReady(true);
      return () => {
        cancelled = true;
      };
    }

    api.post('/api/auth/login', { username })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  // 렌더 중 즉시 navigate하면 현재 diff/patch 흐름과 충돌할 수 있어
  // 비로그인 사용자는 항상 로그인 화면 트리를 먼저 안정적으로 렌더한다.
  if (!isLoggedIn && route !== '#/login') {
    queueMicrotask(() => navigate('#/login'));
  }

  if (isLoggedIn && !authReady) {
    endComponent();
    return createElement('div', { class: 'app' },
      Header(),
      createElement('main', { class: 'main' },
        createElement('div', { class: 'feed-loading' },
          createElement('div', { class: 'spinner' }),
          createElement('p', {}, '접속 정보를 확인하는 중...')
        )
      )
    );
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

  endComponent();

  return createElement('div', { class: 'app' },
    isLoggedIn ? Header() : createElement('span', {}),
    createElement('main', { class: 'main' }, page)
  );
}
