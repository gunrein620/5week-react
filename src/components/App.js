// ── App.js ────────────────────────────────────────────────────────────────────
// 루트 컴포넌트: 모든 상태(State)와 사이드이펙트(Effect)를 여기서만 관리합니다.
// 자식 컴포넌트(Login, Feed, CreatePost, PostCard)는 props만 받는 순수 함수입니다.

import { createElement } from '../framework/vdom.js';
import { useState, useEffect, useMemo } from '../framework/hooks.js';
import { getRoute, navigate } from '../framework/router.js';
import { trace, runWithTraceCause } from '../framework/tracer.js';
import { Login } from './Login.js';
import { Feed } from './Feed.js';
import { CreatePost } from './CreatePost.js';
import { Header } from './Header.js';
import { api } from '../services/api.js';

export function App() {
  // ── 인증 상태 ─────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false);

  // ── 로그인 상태 ───────────────────────────────────────────────────────────
  const [loginUsername, setLoginUsername] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // ── 피드 상태 ─────────────────────────────────────────────────────────────
  const [livePosts, setLivePosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('live');
  const [postTtls, setPostTtls] = useState({});
  const [likingPosts, setLikingPosts] = useState({});

  // ── 글 작성 상태 ──────────────────────────────────────────────────────────
  const [createText, setCreateText] = useState('');
  const [createImageData, setCreateImageData] = useState(null);
  const [createPreview, setCreatePreview] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const route = getRoute();
  const username = localStorage.getItem('username');
  const isLoggedIn = Boolean(username);
  const effectiveRoute = isLoggedIn
    ? (route === '#/login' ? '#/feed' : route)
    : '#/login';

  // ── 인증 확인 effect ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!username) {
      setAuthReady(true);
      return () => { cancelled = true; };
    }
    api.post('/api/auth/login', { username })
      .catch(() => null)
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, [username], '인증 확인');

  // ── 피드 초기 로드 effect ─────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/posts?username=${encodeURIComponent(username || '')}`)
      .then(syncPosts);
  }, [username], '피드 초기 로드');

  // ── 피드 3초 폴링 effect ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.__dtPauseTimers) return;
      api.get(`/api/posts?username=${encodeURIComponent(username || '')}`)
        .then(syncPosts);
    }, 3000);
    return () => clearInterval(timer);
  }, [username], '피드 동기화 타이머');

  // ── TTL 1초 카운트다운 effect ─────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.__dtPauseTimers) return;
      runWithTraceCause('TTL 카운트다운 타이머', () => {
        trace('EFFECT', {
          hook: 'useEffect',
          phase: 'timer-tick',
          label: 'TTL 카운트다운',
        });
        setPostTtls(prev => {
          const next = {};
          for (const [id, ttl] of Object.entries(prev)) {
            next[id] = Math.max(0, ttl - 1);
          }
          return next;
        });
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [], 'TTL 카운트다운');

  useEffect(() => {
    async function refreshPostsForDevtools() {
      const data = await api.get(`/api/posts?username=${encodeURIComponent(username || '')}`);
      syncPosts(data);
      return data;
    }

    window.__dtRefreshPosts = refreshPostsForDevtools;
    return () => {
      if (window.__dtRefreshPosts === refreshPostsForDevtools) {
        delete window.__dtRefreshPosts;
      }
    };
  }, [username], '테스트용 피드 동기화');

  // ── 서버 데이터 동기화 ─────────────────────────────────────────────────────
  function syncPosts(data) {
    const live = Array.isArray(data.livePosts) ? data.livePosts : (data.posts || []);
    const mine = Array.isArray(data.myPosts) ? data.myPosts : [];
    setLivePosts(live);
    setMyPosts(mine);
    // 서버에서 받은 TTL로 로컬 TTL 갱신
    setPostTtls(() => {
      const next = {};
      for (const post of [...live, ...mine]) {
        next[post.id] = Math.max(0, post.ttl ?? 0);
      }
      return next;
    });
  }

  // ── 라우팅 보정 ────────────────────────────────────────────────────────────
  if (!isLoggedIn && route !== '#/login') {
    queueMicrotask(() => navigate('#/login'));
  }
  if (isLoggedIn && route === '#/login') {
    queueMicrotask(() => navigate('#/feed'));
  }

  if (isLoggedIn && !authReady) {
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

  // ── 로그인 핸들러 ──────────────────────────────────────────────────────────
  const handleLoginInput = (e) => setLoginUsername(e.target.value);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const form = e.target?.closest?.('form');
    const submittedName = form?.querySelector?.('input[type="text"]')?.value ?? loginUsername;
    const name = submittedName.trim();
    if (submittedName !== loginUsername) {
      setLoginUsername(submittedName);
    }
    if (!name) { setLoginError('닉네임을 입력해주세요.'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await api.post('/api/auth/login', { username: name });
      if (data.ok) {
        localStorage.setItem('username', data.username);
        navigate('#/feed');
      } else {
        setLoginError(data.message || '오류가 발생했습니다.');
      }
    } catch {
      setLoginError('서버에 연결할 수 없습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  // ── 피드 핸들러 ────────────────────────────────────────────────────────────
  const handleTabChange = (tab) => setActiveTab(tab);

  const handleLike = async (postId) => {
    if (likingPosts[postId]) return;
    setLikingPosts(prev => ({ ...prev, [postId]: true }));
    try {
      const data = await api.post(`/api/posts/${postId}/like`, { username });
      if (data.ok) syncPosts(data);
    } finally {
      setLikingPosts(prev => ({ ...prev, [postId]: false }));
    }
  };

  // ── 글 작성 핸들러 ─────────────────────────────────────────────────────────
  const handleCreateTextInput = (e) => setCreateText(e.target.value);

  const handleCreateImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      setCreateError('이미지 파일만 올릴 수 있어요.');
      return;
    }
    setCreateError('');
    readFileAsDataURL(file)
      .then(data => { setCreateImageData(data); setCreatePreview(data); })
      .catch(() => setCreateError('사진을 처리하지 못했어요. 다른 이미지를 선택해보세요.'));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createText.trim() && !createImageData) {
      setCreateError('텍스트나 이미지를 추가해주세요.');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      const data = await api.post('/api/posts', {
        username, text: createText.trim(), imageData: createImageData,
      });
      if (data.ok) navigate('#/feed');
      else setCreateError(data.message || '오류가 발생했습니다.');
    } catch {
      setCreateError('서버에 연결할 수 없습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateRemoveImage = (e) => {
    e.preventDefault();
    setCreateImageData(null);
    setCreatePreview(null);
    setCreateError('');
  };

  // ── 페이지 렌더 ────────────────────────────────────────────────────────────
  const visibleLivePosts = livePosts.filter((post) => {
    const ttl = postTtls[post.id] ?? post.ttl ?? 0;
    return ttl > 0;
  });

  // livePosts가 바뀔 때(서버 폴링, 3초)만 재계산
  // TTL 카운트다운(1초마다)에서는 cache-hit → 정렬 생략
  const popularPosts = useMemo(
    () => [...livePosts].sort((a, b) => b.likes - a.likes),
    [livePosts]
  );

  let page;
  switch (effectiveRoute) {
    case '#/login':
      page = Login({
        username: loginUsername,
        error: loginError,
        loading: loginLoading,
        onInput: handleLoginInput,
        onSubmit: handleLoginSubmit,
      });
      break;
    case '#/create':
      page = CreatePost({
        text: createText,
        imageData: createImageData,
        preview: createPreview,
        loading: createLoading,
        error: createError,
        onTextInput: handleCreateTextInput,
        onImageChange: handleCreateImageChange,
        onSubmit: handleCreateSubmit,
        onRemoveImage: handleCreateRemoveImage,
      });
      break;
    default:
      page = Feed({
        livePosts: visibleLivePosts,
        myPosts,
        popularPosts,
        activeTab,
        postTtls,
        likingPosts,
        username: username || '',
        onTabChange: handleTabChange,
        onLike: handleLike,
      });
  }

  return createElement('div', { class: 'app' },
    Header(),
    createElement('main', { class: 'main' }, page)
  );
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}
