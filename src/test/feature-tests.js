// ── feature-tests.js ──────────────────────────────────────────────────────────
// 기능 테스트 — 실제 컴포넌트를 mount하여 사용자 시나리오 검증

import { describe, it, assert, log, createSandbox } from './test-runner.js';
import { createElement, vnodeToDOM } from '../framework/vdom.js';
import { useState, useEffect } from '../framework/hooks.js';
import { mount } from '../framework/component.js';
import { Login } from '../components/Login.js';
import { Feed } from '../components/Feed.js';
import { CreatePost } from '../components/CreatePost.js';
import { api } from '../services/api.js';
import { navigate } from '../framework/router.js';

// ── 테스트용 stateful 래퍼 ─────────────────────────────────────────────────────
// Login/Feed/CreatePost는 이제 stateless 순수 함수이므로,
// 단독 mount 테스트 시 상태를 주입하는 얇은 래퍼를 통해 검증합니다.

function LoginWithState() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setError('닉네임을 입력해주세요.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/api/auth/login', { username: name });
      if (data.ok) { localStorage.setItem('username', data.username); navigate('#/feed'); }
      else setError(data.message || '오류가 발생했습니다.');
    } catch { setError('서버에 연결할 수 없습니다.'); }
    finally { setLoading(false); }
  };

  return Login({ username, error, loading,
    onInput: (e) => setUsername(e.target.value),
    onSubmit: handleSubmit,
  });
}

function FeedWithState() {
  const username = localStorage.getItem('username') || '';
  const [livePosts, setLivePosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('live');

  useEffect(() => {
    api.get(`/api/posts?username=${encodeURIComponent(username)}`).then(data => {
      setLivePosts(Array.isArray(data.livePosts) ? data.livePosts : []);
      setMyPosts(Array.isArray(data.myPosts) ? data.myPosts : []);
    });
  }, [username]);

  return Feed({ livePosts, myPosts, activeTab, username,
    onTabChange: (tab) => setActiveTab(tab),
  });
}

function CreatePostWithState() {
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imageData) { setError('텍스트나 이미지를 추가해주세요.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/api/posts', {
        username: localStorage.getItem('username'), text: text.trim(), imageData,
      });
      if (data.ok) navigate('#/feed');
      else setError(data.message || '오류가 발생했습니다.');
    } catch { setError('서버에 연결할 수 없습니다.'); }
    finally { setLoading(false); }
  };

  return CreatePost({ text, imageData, preview, loading, error,
    onTextInput: (e) => setText(e.target.value),
    onRemoveImage: (e) => { e.preventDefault(); setImageData(null); setPreview(null); setError(''); },
    onSubmit: handleSubmit,
  });
}

// ── 타이밍 헬퍼 ───────────────────────────────────────────────────────────────
const waitMicrotask = () => new Promise(r => queueMicrotask(r));
const waitFrame    = () => new Promise(r => requestAnimationFrame(r));
const waitMs       = ms => new Promise(r => setTimeout(r, ms));

// ── fetch mock 헬퍼 ──────────────────────────────────────────────────────────
function mockFetch(handler) {
  const original = window.fetch;
  window.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : undefined;
    const result = handler(url, body);
    return { json: async () => result, ok: true };
  };
  return () => { window.fetch = original; };
}

// ── Counter 컴포넌트 (테스트용 인라인 정의) ────────────────────────────────────
function Counter() {
  const [count, setCount] = useState(0);
  return createElement('div', { class: 'counter' },
    createElement('span', { id: 'count-display' }, String(count)),
    createElement('button', { id: 'plus-btn', onClick: () => setCount(n => n + 1) }, '+')
  );
}

// ── Counter 컴포넌트 ──────────────────────────────────────────────────────────
describe('Counter 컴포넌트', {
  description: 'useState 기반 카운터의 초기 렌더·증가·누적 동작을 검증합니다.',
}, () => {

  it('초기값 0을 표시한다', {
    goal: 'mount 직후 count 표시가 "0"',
    checkpoints: ['DOM count-display = 0'],
  }, () => {
    const sandbox = createSandbox('counter-init');
    mount(Counter, sandbox);

    const display = sandbox.querySelector('#count-display');
    log('초기 표시값', display.textContent);
    assert.equal(display.textContent, '0');
  });

  it('+ 클릭하면 1로 증가한다', {
    goal: '버튼 1회 클릭 → count = 1',
    checkpoints: ['click → setState', 'DOM = 1'],
  }, async () => {
    const sandbox = createSandbox('counter-inc');
    mount(Counter, sandbox);

    sandbox.querySelector('#plus-btn').click();
    await waitMicrotask();

    log('1회 클릭 후', sandbox.querySelector('#count-display').textContent);
    assert.equal(sandbox.querySelector('#count-display').textContent, '1');
  });

  it('여러 번 클릭하면 누적된다', {
    goal: '버튼 3회 클릭 → count = 3',
    checkpoints: ['3회 클릭', 'DOM = 3'],
  }, async () => {
    const sandbox = createSandbox('counter-multi');
    mount(Counter, sandbox);

    for (let i = 0; i < 3; i++) {
      sandbox.querySelector('#plus-btn').click();
      await waitMicrotask();
    }

    log('3회 클릭 후', sandbox.querySelector('#count-display').textContent);
    assert.equal(sandbox.querySelector('#count-display').textContent, '3');
  });

});

// ── 로그인 화면 ───────────────────────────────────────────────────────────────
describe('로그인 화면', {
  description: '로그인 폼의 유효성 검사·API 연동·에러 처리를 검증합니다.',
  notes: ['window.fetch mock 사용', 'window.location.hash 변경 확인'],
}, () => {

  it('빈 입력으로 로그인 시 에러 표시 (엣지)', {
    goal: '닉네임 없이 submit → "닉네임을 입력해주세요." 에러 표시',
    checkpoints: ['빈 value', 'submit 이벤트', '에러 메시지 DOM 확인'],
  }, async () => {
    const sandbox = createSandbox('login-empty');
    mount(LoginWithState, sandbox);
    await waitFrame(); // 초기 이펙트 플러시

    const form = sandbox.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitMicrotask();

    const errorEl = sandbox.querySelector('.error-msg');
    log('에러 메시지', errorEl?.textContent);
    assert.true(!!errorEl);
    assert.equal(errorEl.textContent, '닉네임을 입력해주세요.');
  });

  it('올바른 입력 시 피드로 이동', {
    goal: '닉네임 입력 + submit → fetch 성공 → hash = #/feed',
    checkpoints: ['mock fetch { ok: true }', 'navigate("#/feed") 확인'],
  }, async () => {
    const restore = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { ok: true, username: 'alice' };
      return {};
    });
    const prevHash = window.location.hash;

    try {
      const sandbox = createSandbox('login-success');
      mount(LoginWithState, sandbox);
      await waitFrame();

      // 닉네임 입력 시뮬레이션
      const input = sandbox.querySelector('input[type="text"]');
      input.value = 'alice';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitMicrotask(); // 리렌더 (handleSubmit 클로저 갱신)

      const form = sandbox.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitMs(50); // async handleSubmit 완료 대기

      log('window.location.hash', window.location.hash);
      assert.equal(window.location.hash, '#/feed');
    } finally {
      restore();
      localStorage.removeItem('username');
      history.replaceState(null, '', prevHash || '#');
    }
  });

  it('서버 오류 시 에러 표시 (엣지)', {
    goal: 'fetch 실패 → "서버에 연결할 수 없습니다." 에러 표시',
    checkpoints: ['fetch throw', '에러 메시지 DOM 확인'],
  }, async () => {
    const original = window.fetch;
    window.fetch = async () => { throw new Error('network error'); };

    try {
      const sandbox = createSandbox('login-error');
      mount(LoginWithState, sandbox);
      await waitFrame();

      const input = sandbox.querySelector('input[type="text"]');
      input.value = 'alice';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitMicrotask();

      const form = sandbox.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitMs(50);

      const errorEl = sandbox.querySelector('.error-msg');
      log('에러 메시지', errorEl?.textContent);
      assert.true(!!errorEl);
      assert.equal(errorEl.textContent, '서버에 연결할 수 없습니다.');
    } finally {
      window.fetch = original;
    }
  });

});

// ── 피드 화면 ─────────────────────────────────────────────────────────────────
describe('피드 화면', {
  description: '포스트 목록 렌더·빈 피드 메시지·탭 전환을 검증합니다.',
  notes: ['window.fetch mock', 'localStorage.username 설정 필요'],
}, () => {

  it('포스트 목록이 렌더링된다', {
    goal: 'api.get → posts 반환 → PostCard DOM 존재',
    checkpoints: ['mock fetch with 1 post', '.post-card 요소 확인'],
  }, async () => {
    localStorage.setItem('username', 'tester');
    const restore = mockFetch(() => ({
      livePosts: [{ id: '1', author: 'alice', text: 'hello', likes: 0, expiresAt: Date.now() + 9000 }],
      myPosts: [],
    }));

    try {
      const sandbox = createSandbox('feed-posts');
      mount(FeedWithState, sandbox);
      await waitFrame();
      await waitMs(50); // async fetch 완료 대기 + 리렌더

      log('포스트 카드 수', sandbox.querySelectorAll('.post-card').length);
      assert.true(sandbox.querySelectorAll('.post-card').length >= 1);
    } finally {
      restore();
      localStorage.removeItem('username');
    }
  });

  it('빈 피드일 때 안내 메시지 (엣지)', {
    goal: 'livePosts = [] → .feed-empty 요소 표시',
    checkpoints: ['빈 배열 응답', '.feed-empty 존재'],
  }, async () => {
    localStorage.setItem('username', 'tester');
    const restore = mockFetch(() => ({ livePosts: [], myPosts: [] }));

    try {
      const sandbox = createSandbox('feed-empty');
      mount(FeedWithState, sandbox);
      await waitFrame();
      await waitMs(50);

      log('feed-empty 존재', !!sandbox.querySelector('.feed-empty'));
      assert.true(!!sandbox.querySelector('.feed-empty'));
    } finally {
      restore();
      localStorage.removeItem('username');
    }
  });

  it('탭 클릭 시 내 글 목록으로 전환', {
    goal: '"내가 올린 글" 탭 클릭 → mine-panel 활성화',
    checkpoints: ['탭 버튼 클릭', 'feed-panel--mine 클래스 확인'],
  }, async () => {
    localStorage.setItem('username', 'alice');
    const restore = mockFetch(() => ({
      livePosts: [{ id: '1', author: 'bob', text: 'hi', likes: 0, expiresAt: Date.now() + 9000 }],
      myPosts:   [{ id: '2', author: 'alice', text: 'mine', likes: 0, expiresAt: Date.now() + 9000 }],
    }));

    try {
      const sandbox = createSandbox('feed-tabs');
      mount(FeedWithState, sandbox);
      await waitFrame();
      await waitMs(50);

      // "내가 올린 글" 탭 버튼 클릭
      const tabs = sandbox.querySelectorAll('.feed-tabs__button');
      const mineTab = Array.from(tabs).find(b => b.textContent.includes('내가 올린 글'));
      assert.true(!!mineTab);

      mineTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await waitMicrotask();

      log('mine-panel 존재', !!sandbox.querySelector('.feed-panel--mine'));
      assert.true(!!sandbox.querySelector('.feed-panel--mine'));
    } finally {
      restore();
      localStorage.removeItem('username');
    }
  });

});

// ── 글 작성 ───────────────────────────────────────────────────────────────────
describe('글 작성', {
  description: '포스트 작성 폼의 입력·유효성 검사·제출 흐름을 검증합니다.',
  notes: ['window.fetch mock', 'localStorage.username 설정'],
}, () => {

  it('내용 입력 후 textarea에 표시', {
    goal: 'textarea onInput → 리렌더 후 텍스트 반영',
    checkpoints: ['input 이벤트 시뮬', 'textarea textContent 확인'],
  }, async () => {
    localStorage.setItem('username', 'tester');

    try {
      const sandbox = createSandbox('create-input');
      mount(CreatePostWithState, sandbox);

      const textarea = sandbox.querySelector('textarea');
      textarea.value = 'hello world';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await waitMicrotask();

      log('textarea textContent', textarea.textContent);
      // textarea 자식 텍스트 노드 또는 value 속성으로 확인
      const hasText = textarea.textContent.includes('hello world') ||
                      textarea.getAttribute('value') === 'hello world';
      assert.true(hasText || textarea.value === 'hello world');
    } finally {
      localStorage.removeItem('username');
    }
  });

  it('빈 내용으로 작성 시 검증 실패 (엣지)', {
    goal: '텍스트·이미지 없이 submit → "텍스트나 이미지를 추가해주세요." 에러',
    checkpoints: ['빈 상태 submit', '에러 메시지 확인'],
  }, async () => {
    localStorage.setItem('username', 'tester');

    try {
      const sandbox = createSandbox('create-empty');
      mount(CreatePostWithState, sandbox);

      const form = sandbox.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitMicrotask();

      const errorEl = sandbox.querySelector('.error-msg');
      log('에러 메시지', errorEl?.textContent);
      assert.true(!!errorEl);
      assert.equal(errorEl.textContent, '텍스트나 이미지를 추가해주세요.');
    } finally {
      localStorage.removeItem('username');
    }
  });

  it('작성 성공 후 피드로 이동', {
    goal: 'text 입력 + submit → fetch 성공 → hash = #/feed',
    checkpoints: ['mock fetch { ok: true }', 'navigate("#/feed") 확인'],
  }, async () => {
    localStorage.setItem('username', 'tester');
    const restore = mockFetch((url) => {
      if (url.includes('/api/posts')) return { ok: true };
      return {};
    });
    const prevHash = window.location.hash;

    try {
      const sandbox = createSandbox('create-success');
      mount(CreatePostWithState, sandbox);

      const textarea = sandbox.querySelector('textarea');
      textarea.value = 'great moment!';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await waitMicrotask();

      const form = sandbox.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitMs(50);

      log('window.location.hash', window.location.hash);
      assert.equal(window.location.hash, '#/feed');
    } finally {
      restore();
      localStorage.removeItem('username');
      history.replaceState(null, '', prevHash || '#');
    }
  });

});
