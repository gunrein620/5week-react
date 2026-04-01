// ── scenario-setup.js ─────────────────────────────────────────────────────────
// 시나리오 사전 작업 유틸리티
//   - TimeController : 클라이언트 + 서버 타이머 동기 제어
//   - silentCreatePost: 트레이싱 없이 백그라운드 게시글 생성
//   - silentLogin     : 트레이싱 없이 로그인 수행
//   - ensureLoggedIn  : 로그인 상태 보장

import { setTraceEnabled, isTraceEnabled } from '../framework/tracer.js';

// ── TimeController ────────────────────────────────────────────────────────────
export const TimeController = {
  /**
   * 클라이언트 + 서버 타이머를 동시에 정지
   */
  async pause() {
    window.__dtPauseTimers = true;
    try {
      await fetch('/api/__test/pause-timers', { method: 'POST' });
    } catch (e) {
      console.warn('[TimeController] 서버 타이머 정지 실패:', e);
    }
  },

  /**
   * 클라이언트 + 서버 타이머를 동시에 재개
   * 서버는 lastSync를 갱신하여 정지 기간 경과시간을 무시
   */
  async resume() {
    try {
      await fetch('/api/__test/resume-timers', { method: 'POST' });
    } catch (e) {
      console.warn('[TimeController] 서버 타이머 재개 실패:', e);
    }
    window.__dtPauseTimers = false;
  },

  /**
   * 시나리오별 타이머 정지 여부
   * 로그인, TTL 시나리오는 시간 흐름이 필요하므로 정지 안 함
   */
  shouldPause(scenarioId) {
    return !['login', 'ttl'].includes(scenarioId);
  },

  /**
   * 트레이스 표시 시간 확보를 위해 게시글 TTL 연장
   * @param {string|null} postId - null이면 모든 live 포스트
   * @param {number} extraSeconds
   */
  async extendTtl(postId = null, extraSeconds = 5) {
    try {
      await fetch('/api/__test/extend-ttl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, extraSeconds }),
      });
    } catch (e) {
      console.warn('[TimeController] TTL 연장 실패:', e);
    }
  },
};

// ── silentCreatePost ──────────────────────────────────────────────────────────
/**
 * 트레이싱 없이 백그라운드에서 게시글을 생성한다.
 * - 생성 중 서버 타이머도 정지하여 생성 직후부터 TTL이 정확히 시작되도록 한다.
 * - 생성 완료 후 타이머를 재개하고, 트레이싱 상태는 호출 전 값으로 복원한다.
 *
 * @param {string} username
 * @param {string} text
 * @returns {Promise<{livePosts: object[], myPosts: object[]}>}
 */
export async function silentCreatePost(username, text = '테스트 게시글') {
  const wasEnabled = isTraceEnabled();
  setTraceEnabled(false);
  await TimeController.pause();

  let data = { livePosts: [], myPosts: [] };
  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, text }),
    });
    data = await res.json();
  } catch (e) {
    console.warn('[silentCreatePost] 게시글 생성 실패:', e);
  }

  await TimeController.resume(); // 이 시점부터 서버 TTL 카운트 시작
  setTraceEnabled(wasEnabled);
  return data;
}

// ── silentLogin ───────────────────────────────────────────────────────────────
/**
 * 트레이싱 없이 로그인을 수행하고 localStorage에 저장한다.
 * @param {string} username
 * @returns {Promise<{ok: boolean, username: string}>}
 */
export async function silentLogin(username) {
  const wasEnabled = isTraceEnabled();
  setTraceEnabled(false);

  let data = { ok: false };
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    data = await res.json();
    if (data.ok) {
      localStorage.setItem('username', data.username);
    }
  } catch (e) {
    console.warn('[silentLogin] 로그인 실패:', e);
  }

  setTraceEnabled(wasEnabled);
  return data;
}

// ── ensureLoggedIn ────────────────────────────────────────────────────────────
/**
 * 로그인 상태를 보장한다. 로그인이 안 되어 있으면 silentLogin을 수행한다.
 * @param {string} defaultUser
 * @returns {Promise<string>} username
 */
export async function ensureLoggedIn(defaultUser = 'testuser') {
  let username = localStorage.getItem('username');
  if (!username) {
    await silentLogin(defaultUser);
    username = defaultUser;
  }
  return username;
}
