// ── hooks.js ──────────────────────────────────────────────────────────────────
// useState, useEffect 구현

import { trace } from './tracer.js';

// 전역 렌더 상태
let renderScheduled = false;
let renderFn = null; // component.js에서 주입

// 훅 저장소: 컴포넌트 경로 + 훅 인덱스 기반
const hookStore = new Map(); // key → value
let currentKey = '';
let hookIndex = 0;

// 대기 중인 effect들
const pendingEffects = []; // { key, callback, deps, prevDeps, prevCleanup }
const effectStore = new Map(); // key → { deps, cleanup }

// 마지막으로 변경된 state 정보 (UPDATE trace에 포함)
let lastChangedStateKey = null;

export function getLastChangedStateKey() {
  return lastChangedStateKey;
}

export function setRenderFn(fn) {
  renderFn = fn;
}

export function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  trace('STATE', {
    reason: 'scheduleRender',
    scheduled: true,
  });
  queueMicrotask(() => {
    renderScheduled = false;
    if (renderFn) renderFn();
  });
}

// 렌더 전 호출 — 컴포넌트 컨텍스트 설정
export function setCurrentComponent(key) {
  currentKey = key;
  hookIndex = 0;
}

export function resetHookIndex() {
  hookIndex = 0;
}

// ── useState ──────────────────────────────────────────────────────────────────
export function useState(initialValue) {
  const stateIndex = hookIndex++;
  const key = `${currentKey}:state:${stateIndex}`;

  if (!hookStore.has(key)) {
    hookStore.set(key, typeof initialValue === 'function' ? initialValue() : initialValue);
  }

  const value = hookStore.get(key);

  const setState = (newVal) => {
    const prev = hookStore.get(key);
    const resolved = typeof newVal === 'function'
      ? newVal(prev)
      : newVal;

    const bailout = Object.is(resolved, prev) || shallowEqualState(prev, resolved);
    trace('HOOK', {
      hook: 'useState',
      phase: 'set',
      hookIndex: stateIndex,
      key,
      prev,
      next: resolved,
      bailout,
    });

    if (bailout) return; // 동일하면 렌더 생략
    hookStore.set(key, resolved);
    lastChangedStateKey = key;
    trace('STATE', {
      reason: 'setState',
      changedKeys: [key],
      prev,
      next: resolved,
    });
    scheduleRender();
  };

  return [value, setState];
}

// ── useEffect ─────────────────────────────────────────────────────────────────
export function useEffect(callback, deps) {
  const effectIndex = hookIndex++;
  const key = `${currentKey}:effect:${effectIndex}`;
  pendingEffects.push({ key, callback, deps });
}

// 렌더 후 호출 (component.js에서 호출)
export function flushEffects() {
  const effects = pendingEffects.splice(0);

  for (const { key, callback, deps } of effects) {
    const prev = effectStore.get(key) || { deps: undefined, cleanup: undefined };
    const prevDeps = prev.deps;

    const shouldRun =
      prevDeps === undefined ||   // 첫 마운트
      deps === undefined ||        // deps 없음 → 매 렌더
      !shallowEqual(prevDeps, deps);

    if (shouldRun) {
      // 이전 cleanup 실행
      if (typeof prev.cleanup === 'function') {
        trace('EFFECT', {
          hook: 'useEffect',
          phase: 'cleanup',
          key,
          prevDeps,
          hasCleanup: true,
        });
        prev.cleanup();
      }
      // 새 effect 실행
      trace('EFFECT', {
        hook: 'useEffect',
        phase: 'run',
        key,
        deps: Array.isArray(deps) ? [...deps] : deps,
        prevDeps,
        hasCleanup: typeof prev.cleanup === 'function',
      });
      const cleanup = callback();
      effectStore.set(key, { deps: deps ? [...deps] : undefined, cleanup });
    } else {
      // deps 변경 없음 → cleanup 유지
      effectStore.set(key, prev);
    }
  }
}

// 컴포넌트 언마운트 시 cleanup 실행
export function cleanupEffects(keyPrefix) {
  for (const [key, { cleanup }] of effectStore.entries()) {
    if (key.startsWith(keyPrefix)) {
      if (typeof cleanup === 'function') {
        trace('EFFECT', {
          hook: 'useEffect',
          phase: 'cleanup',
          key,
          reason: 'unmount',
        });
        cleanup();
      }
      effectStore.delete(key);
    }
  }

  for (let i = pendingEffects.length - 1; i >= 0; i -= 1) {
    if (pendingEffects[i].key.startsWith(keyPrefix)) {
      pendingEffects.splice(i, 1);
    }
  }

  for (const key of hookStore.keys()) {
    if (key.startsWith(keyPrefix)) hookStore.delete(key);
  }
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// setState bailout용: 배열/객체가 얕은 비교에서 동일하면 리렌더 스킵
function shallowEqualState(prev, next) {
  if (prev === next) return true;
  if (prev == null || next == null) return false;
  if (typeof prev !== typeof next) return false;

  // 배열 비교
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return false;
    return prev.every((v, i) => Object.is(v, next[i]));
  }

  // 객체 비교 (plain object만)
  if (typeof prev === 'object' && typeof next === 'object') {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) return false;
    return prevKeys.every(k => Object.is(prev[k], next[k]));
  }

  return false;
}

export function __resetHooksForTests() {
  for (const { cleanup } of effectStore.values()) {
    if (typeof cleanup === 'function') cleanup();
  }
  renderScheduled = false;
  renderFn = null;
  currentKey = '';
  hookIndex = 0;
  hookStore.clear();
  pendingEffects.length = 0;
  effectStore.clear();
}

// ── 테스트 전용 진단 (읽기 전용) ──
export function __getHookStore() { return hookStore; }
export function __getEffectStore() { return effectStore; }
export function __getPendingEffects() { return pendingEffects; }
