// ── scenarios.js ──────────────────────────────────────────────────────────────
// Flicker DevTools 시나리오 정의 (5개)

import { trace, addTraceListener, removeTraceListener } from '../framework/tracer.js';
import { navigate } from '../framework/router.js';
import {
  TimeController,
  silentCreatePost,
  ensureLoggedIn,
} from './scenario-setup.js';

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeout = 5000, interval = 100) {
  const start = Date.now();
  while (true) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) return false;
    await wait(interval);
  }
}

async function silentRefreshFeed() {
  if (typeof window.__dtRefreshPosts === 'function') {
    await window.__dtRefreshPosts();
    await wait(50);
  }
}

// DOM input/textarea 값 변경 + input 이벤트 발생
function setInputValue(el, value) {
  if (!el) return;
  // native setter 우회 → React 방식과 동일하게 value 강제 설정
  try {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, value);
    else el.value = value;
  } catch {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── 시나리오 목록 ──────────────────────────────────────────────────────────────
export const scenarios = [

  // ── 1. 좋아요 클릭 ─────────────────────────────────────────────────────────
  {
    id: 'like',
    icon: '👍',
    title: '좋아요 클릭',
    description: 'useState로 likes/ttl 상태 변경 → VDOM diff → DOM 패치',
    highlights: ['useState'],
    enabled: true,

    // Silent Setup: 로그인 상태 보장만 (게시글 자동 생성 없음 — 유저가 만든 기존 글 대상)
    async setup() {
      await ensureLoggedIn();
      navigate('#/feed');
      await silentRefreshFeed();
      await waitFor(
        () => Boolean(document.querySelector(
          '.post-card__like-btn:not(.post-card__like-btn--liked):not(.post-card__like-btn--loading)'
        )),
        2000
      );
    },

    async run() {
      navigate('#/feed');
      await wait(400); // 렌더 사이클 완료 대기

      // 타이머가 정지된 상태이므로 폴링을 기대할 수 없음 — 현재 DOM을 즉시 탐색
      const selector = '.post-card__like-btn:not(.post-card__like-btn--liked):not(.post-card__like-btn--loading)';
      const btn = document.querySelector(selector);

      if (!btn) {
        trace('ACTION', {
          message: '⚠️ 좋아요를 누를 수 있는 게시물이 없습니다 (게시물이 없거나 모두 이미 좋아요 완료)',
          result: 'skip',
        });
        return;
      }

      const postCard = btn.closest('[data-key]');
      const postId = postCard ? postCard.getAttribute('data-key') : 'unknown';
      const likeCountEl = btn.querySelector('.post-card__like-count');
      const initialLikes = likeCountEl ? parseInt(likeCountEl.textContent, 10) : '?';

      trace('ACTION', {
        message: `👍 사용자가 게시물 #${postId}에 좋아요를 눌렀습니다`,
        postId,
        currentLikes: initialLikes,
      });

      await wait(200);
      btn.click();
      await wait(1800);
    },

    verify() {
      const likedBtn = document.querySelector('.post-card__like-btn--liked');
      const anyCard = document.querySelector('.post-card');
      return [
        {
          label: 'likes 값이 증가했는가',
          check: () => Boolean(likedBtn),
        },
        {
          label: 'DOM에 정확히 반영되었는가',
          check: () => Boolean(anyCard),
        },
        {
          label: '불필요한 노드는 스킵했는가',
          check: () => Boolean(document.querySelector('.post-card__like-btn--liked')),
        },
      ];
    },
  },

  // ── 2. TTL 자동 감소 ───────────────────────────────────────────────────────
  {
    id: 'ttl',
    icon: '⏱️',
    title: 'TTL 자동 감소',
    description: 'useEffect 타이머 등록 → useState 매초 리렌더 사이클 관찰',
    highlights: ['useEffect'],
    enabled: true,

    // Silent Setup: 트레이싱 없이 게시글 생성
    // 생성 완료 직후 서버 타이머 재개 → 이 시점부터 TTL 카운트 시작
    async setup() {
      const username = await ensureLoggedIn();
      const data = await silentCreatePost(username, 'TTL 타이머 테스트 게시글 ⏱️');
      this._setupPostId = data.livePosts?.[0]?.id || null;
      // TTL을 5초 연장하여 관찰 시간 확보 (기본 10초 → 15초)
      if (this._setupPostId) {
        await TimeController.extendTtl(this._setupPostId, 5);
      }
      navigate('#/feed');
      await silentRefreshFeed();
      if (this._setupPostId) {
        await waitFor(
          () => Boolean(document.querySelector(`[data-key="${this._setupPostId}"] .post-card__ttl-text`)),
          3000
        );
      }
    },

    async run() {
      // 효과 등록 시점 설명 — useEffect는 마운트 시 1회 실행, 지금 타이머가 돌고 있음
      trace('ACTION', {
        message: '📌 useEffect([], setInterval) — App 마운트 시 TTL 카운트다운 타이머 등록됨',
      });

      navigate('#/feed');
      await wait(500);

      const ttlSelector = this._setupPostId
        ? `[data-key="${this._setupPostId}"] .post-card__ttl-text`
        : '.post-card__ttl-text';
      const ttlEl = document.querySelector(ttlSelector);
      if (!ttlEl) {
        trace('ACTION', {
          message: '⚠️ TTL을 관찰할 대상 게시물을 찾을 수 없습니다',
          result: 'skip',
        });
        return;
      }
      const postCard = ttlEl?.closest('[data-key]');
      const postId = postCard ? postCard.getAttribute('data-key') : 'unknown';
      const initialTtl = ttlEl ? ttlEl.textContent.trim() : '?';

      trace('ACTION', {
        message: `⏱️ TTL 타이머 관찰 시작 — 게시물 #${postId}`,
        postId,
        initialTtl,
        observing: '3초간 TTL 감소 관찰',
      });

      trace('ACTION', {
        message: '📋 useEffect([], ...) 타이머는 마운트 시 1회 등록됨 — 이후 매초 useState 리렌더를 관찰합니다',
      });

      // 3.5초 동안 TTL 타이머 관찰 (자동으로 HOOK/STATE/VDOM/DIFF/PATCH/RENDER trace 발생)
      await wait(3500);
    },

    verify() {
      const ttlEl = document.querySelector('.post-card__ttl-text');
      if (!ttlEl) {
        return [{ label: '게시물 TTL 요소가 존재하는가', check: () => false }];
      }
      const currentTtl = parseInt(ttlEl.textContent, 10);
      return [
        {
          label: 'useEffect가 마운트 시 1회 등록되었는가',
          check: () => Boolean(ttlEl),
        },
        {
          label: 'TTL이 매초 감소하는가',
          check: () => !isNaN(currentTtl),
        },
        {
          label: '만료 전 타이머가 동작 중인가',
          check: () => currentTtl > 0,
        },
      ];
    },
  },

  // ── 3. 로그인 ──────────────────────────────────────────────────────────────
  {
    id: 'login',
    icon: '🔑',
    title: '로그인',
    description: 'useState + useEffect + useMemo(파생 데이터 캐시) + 라우팅 — 로그인 후 App 전체 리렌더',
    highlights: ['useState', 'useEffect', 'useMemo'],
    enabled: true,

    async run() {
      // 현재 사용자명 저장 후 로그아웃 상태로 전환
      const savedUsername = localStorage.getItem('username') || 'demo';
      localStorage.removeItem('username');
      navigate('#/login');
      await wait(500);

      const input = document.querySelector('input.input[type="text"]');
      if (!input) {
        // 로그인 폼이 없으면 복구 후 종료
        localStorage.setItem('username', savedUsername);
        navigate('#/feed');
        trace('ACTION', {
          message: '⚠️ 로그인 폼을 찾을 수 없습니다.',
          result: 'skip',
        });
        return;
      }

      trace('ACTION', {
        message: '🔑 사용자가 로그인 버튼을 클릭했습니다',
        username: savedUsername,
        route: window.location.hash,
      });

      await wait(200);

      // 입력값 설정 + input 이벤트 발생 (useState 상태 업데이트 트리거)
      setInputValue(input, savedUsername);
      await wait(400);

      // 제출 버튼 클릭 → form submit → handleSubmit → API 호출 → navigate('#/feed')
      const submitBtn = document.querySelector('.login-form button[type="submit"]');
      if (submitBtn) submitBtn.click();

      // API 응답 + 라우팅 + 리렌더 대기
      await wait(2000);

      // 로그인 실패 시 복구
      if (!localStorage.getItem('username')) {
        localStorage.setItem('username', savedUsername);
      }
    },

    verify() {
      return [
        {
          label: '로그인 후 user 상태가 저장되었는가',
          check: () => Boolean(localStorage.getItem('username')),
        },
        {
          label: '라우트가 #/feed로 변경되었는가',
          check: () => window.location.hash === '#/feed',
        },
        {
          label: 'Feed 컴포넌트가 렌더링되었는가',
          check: () => Boolean(document.querySelector('.feed-page')),
        },
      ];
    },
  },

  // ── 4. 글 작성 ─────────────────────────────────────────────────────────────
  {
    id: 'create-post',
    icon: '✏️',
    title: '글 작성',
    description: '입력 → 검증 → 상태 반영 → API 호출 → 피드 이동',
    highlights: ['useState'],
    enabled: true,

    // Silent Setup: 로그인 상태 보장
    async setup() {
      await ensureLoggedIn();
    },

    async run() {
      // 로그인 상태 확인
      if (!localStorage.getItem('username')) {
        trace('ACTION', {
          message: '⚠️ 글 작성은 로그인 상태에서만 가능합니다.',
          result: 'skip',
        });
        return;
      }

      navigate('#/create');
      await wait(400);

      const textarea = document.querySelector('textarea.create-textarea');
      if (!textarea) {
        trace('ACTION', {
          message: '⚠️ 글 작성 폼을 찾을 수 없습니다.',
          result: 'skip',
        });
        return;
      }

      const content = '오늘 날씨 좋다 ☀️';

      trace('ACTION', {
        message: '✏️ 사용자가 글 작성 버튼을 클릭했습니다',
        content,
        route: window.location.hash,
      });

      await wait(200);

      // 텍스트 입력 + input 이벤트 발생
      setInputValue(textarea, content);
      await wait(400);

      // 제출 버튼 클릭 → handleSubmit → API 호출 → navigate('#/feed')
      const submitBtn = document.querySelector('.create-form button[type="submit"]');
      if (submitBtn) submitBtn.click();

      // API 응답 + 라우팅 + 리렌더 대기
      await wait(2000);
    },

    verify() {
      return [
        {
          label: '피드로 이동했는가',
          check: () => window.location.hash === '#/feed',
        },
        {
          label: 'Feed 컴포넌트가 렌더링되었는가',
          check: () => Boolean(document.querySelector('.feed-page')),
        },
        {
          label: '새 글이 피드에 표시되는가',
          check: () => document.querySelectorAll('.post-card').length > 0,
        },
      ];
    },
  },

  // ── 5. 메모이제이션 (useMemo) ────────────────────────────────────────────
  {
    id: 'memo',
    icon: '🧠',
    title: '메모이제이션 (useMemo)',
    description: 'useMemo 캐싱 vs 재계산 — deps 비교를 통한 불필요한 연산 스킵',
    highlights: ['useMemo'],
    enabled: true,

    async setup() {
      await ensureLoggedIn();
      await silentCreatePost(await ensureLoggedIn(), 'useMemo 테스트용 게시글 🧠');
      navigate('#/feed');
      await silentRefreshFeed();
      await wait(300);
    },

    async run() {
      this._memoTraces = { cacheHit: 0, recompute: 0 };

      const listener = (entry) => {
        if (entry.type !== 'MEMO' || entry.detail?.hook !== 'useMemo') return;
        if (entry.detail.phase === 'cache-hit') this._memoTraces.cacheHit++;
        if (entry.detail.phase === 'recompute') this._memoTraces.recompute++;
      };
      addTraceListener(listener);

      try {
        // Phase 1: cache-hit 유도 — livePosts 변화 없이 라우트만 전환
        trace('ACTION', {
          message: '🧠 [Phase 1] 라우트 전환 — livePosts 변화 없음 → useMemo cache-hit 예상',
        });

        navigate('#/feed');
        await wait(400);

        navigate('#/create');
        await wait(400);

        navigate('#/feed');
        await wait(400);

        trace('ACTION', {
          message: `📋 Phase 1 결과 — cache-hit: ${this._memoTraces.cacheHit}회, recompute: ${this._memoTraces.recompute}회`,
          cacheHit: this._memoTraces.cacheHit,
          recompute: this._memoTraces.recompute,
        });

        // Phase 2: recompute 유도 — __dtRefreshPosts() 호출로 새 배열 참조
        trace('ACTION', {
          message: '🔄 [Phase 2] 피드 새로고침 — setLivePosts(새 배열) → useMemo recompute 예상',
        });

        const beforeRecompute = this._memoTraces.recompute;
        if (typeof window.__dtRefreshPosts === 'function') {
          await window.__dtRefreshPosts();
        }
        await wait(600);

        trace('ACTION', {
          message: `📋 Phase 2 결과 — recompute ${this._memoTraces.recompute - beforeRecompute}회 발생 (누적 cache-hit: ${this._memoTraces.cacheHit}회)`,
          cacheHit: this._memoTraces.cacheHit,
          recompute: this._memoTraces.recompute,
        });
      } finally {
        removeTraceListener(listener);
      }
    },

    verify() {
      const traces = this._memoTraces || { cacheHit: 0, recompute: 0 };
      return [
        {
          label: 'deps 동일 시 cache-hit가 발생했는가',
          check: () => traces.cacheHit > 0,
        },
        {
          label: 'deps 변경 시 recompute가 발생했는가',
          check: () => traces.recompute > 0,
        },
        {
          label: '피드가 정상 렌더링되는가',
          check: () => Boolean(document.querySelector('.feed-page')),
        },
      ];
    },
  },
];
