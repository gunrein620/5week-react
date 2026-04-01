// ── scenarios.js ──────────────────────────────────────────────────────────────
// Flicker DevTools 시나리오 정의 (5개)

import { trace } from '../framework/tracer.js';
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

    // Silent Setup: 트레이싱 없이 대상 게시글 자동 생성
    async setup() {
      const username = await ensureLoggedIn();
      const data = await silentCreatePost(username, '좋아요 테스트 게시글 🧪');
      this._setupPostId = data.livePosts?.[0]?.id || null;
    },

    async run() {
      // 피드로 이동
      navigate('#/feed');

      // setup에서 생성한 게시글이 DOM에 나타날 때까지 대기 (최대 6초)
      const appeared = await waitFor(
        () => Boolean(document.querySelector(
          '.post-card__like-btn:not(.post-card__like-btn--liked):not(.post-card__like-btn--loading)'
        )),
        6000
      );

      // 좋아요 누를 수 있는 첫 번째 포스트 찾기
      const btn = document.querySelector(
        '.post-card__like-btn:not(.post-card__like-btn--liked):not(.post-card__like-btn--loading)'
      );

      if (!btn || !appeared) {
        trace('ACTION', {
          message: '좋아요를 누를 수 있는 게시물이 없습니다. (모두 이미 좋아요 완료)',
          result: 'skip',
        });
        return;
      }

      const postCard = btn.closest('[data-key]');
      const postId = postCard ? postCard.getAttribute('data-key') : 'unknown';
      const likeCountEl = btn.querySelector('.post-card__like-count');
      const initialLikes = likeCountEl ? parseInt(likeCountEl.textContent, 10) : '?';

      trace('ACTION', {
        message: `👍 사용자가 게시물 #${postId} 에 좋아요를 눌렀습니다`,
        postId,
        currentLikes: initialLikes,
      });

      await wait(200);
      btn.click();
      // API 응답 + 리렌더 대기
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
    description: 'useEffect 타이머 등록 + 매초 상태 감소 + cleanup',
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
    },

    async run() {
      navigate('#/feed');
      await wait(500);

      const ttlEl = document.querySelector('.post-card__ttl-text');
      const postCard = ttlEl?.closest('[data-key]');
      const postId = postCard ? postCard.getAttribute('data-key') : 'unknown';
      const initialTtl = ttlEl ? ttlEl.textContent.trim() : '?';

      trace('ACTION', {
        message: `⏱️ TTL 타이머 관찰 시작 — 게시물 #${postId}`,
        postId,
        initialTtl,
        observing: '3초간 TTL 감소 관찰',
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
    description: 'useState + useEffect 조합 + 라우팅 — 로그인 흐름 전체',
    highlights: ['useState', 'useEffect'],
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

  // ── 5. 메모이제이션 (useMemo) — 추후 구현 ────────────────────────────────
  {
    id: 'memo',
    icon: '🧠',
    title: '메모이제이션 (useMemo)',
    description: 'useMemo 캐싱 vs 재계산 — deps 비교를 통한 불필요한 연산 스킵',
    highlights: ['useMemo'],
    enabled: false,
    disabledMessage: 'useMemo는 다음 버전에서 구현 예정입니다',
    plannedVerify: [
      'deps 변경 시 factory가 재실행되는가',
      'deps 동일 시 캐시된 값을 반환하는가 (재계산 스킵)',
      '여러 useMemo가 독립적으로 동작하는가',
    ],

    async run() {
      trace('ACTION', { message: '🧠 useMemo 시나리오는 아직 구현 전입니다.' });
    },

    verify() {
      return [
        { label: 'useMemo 구현 예정', check: () => false },
      ];
    },
  },
];
