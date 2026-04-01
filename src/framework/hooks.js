// ── hooks.js ──────────────────────────────────────────────────────────────────
// useState, useEffect: FunctionComponent 인스턴스의 hooks[] 배열 기반 구현

import { trace, getCurrentTraceCause } from './tracer.js';

// 현재 렌더 중인 FunctionComponent 인스턴스
let currentInstance = null;
// 전체 앱 루트 인스턴스 (router에서 scheduleRender 호출 시 사용)
let appInstance = null;

export function setCurrentInstance(instance) {
  currentInstance = instance;
  if (instance) instance.hookIndex = 0;
}

export function clearCurrentInstance() {
  currentInstance = null;
}

export function setAppInstance(instance) {
  appInstance = instance;
}

// Backward compat: unit-tests.js에서 직접 훅을 호출할 때 임시 인스턴스 생성
export function setCurrentComponent(_key) {
  currentInstance = {
    hooks: [],
    hookIndex: 0,
    pendingEffects: [],
    scheduleUpdate() {},
  };
}

export function resetHookIndex() {
  if (currentInstance) currentInstance.hookIndex = 0;
}

// ── useState ──────────────────────────────────────────────────────────────────
export function useState(initialValue) {
  const instance = currentInstance;
  const idx = instance.hookIndex++;

  // 첫 렌더 시 hooks 배열에 슬롯 생성
  if (idx >= instance.hooks.length) {
    instance.hooks.push({
      type: 'state',
      value: typeof initialValue === 'function' ? initialValue() : initialValue,
    });
  }

  const hook = instance.hooks[idx];

  const setState = (newVal) => {
    const prev = hook.value;
    const resolved = typeof newVal === 'function' ? newVal(prev) : newVal;
    const cause = normalizeTraceCause(getCurrentTraceCause());

    trace('HOOK', { hook: 'useState', phase: 'set', prev, next: resolved, cause });

    if (shallowEqualState(prev, resolved)) return; // 동일하면 렌더 생략
    if (cause && !instance.pendingUpdateCause) {
      instance.pendingUpdateCause = cause;
    }
    hook.value = resolved;
    instance.scheduleUpdate();
  };

  return [hook.value, setState];
}

// ── useEffect ─────────────────────────────────────────────────────────────────
export function useEffect(callback, deps, label) {
  const instance = currentInstance;
  const idx = instance.hookIndex++;

  // 첫 렌더 시 effect 슬롯 생성
  if (idx >= instance.hooks.length) {
    instance.hooks.push({ type: 'effect', deps: undefined, cleanup: undefined, label });
  }

  // 렌더 후 flushEffects에서 처리할 수 있도록 대기열에 등록
  instance.pendingEffects.push({ idx, callback, deps, label });
}

// ── flushEffects: 렌더 후 requestAnimationFrame에서 호출 ──────────────────────
export function flushEffects(instance) {
  const effects = instance.pendingEffects.splice(0);

  for (const { idx, callback, deps, label } of effects) {
    const hook = instance.hooks[idx];
    const prevDeps = hook.deps;

    const shouldRun =
      prevDeps === undefined ||   // 첫 마운트
      deps === undefined ||        // deps 없음 → 매 렌더
      !shallowEqual(prevDeps, deps);

    if (shouldRun) {
      if (typeof hook.cleanup === 'function') {
        trace('EFFECT', { hook: 'useEffect', phase: 'cleanup', idx, label: label || hook.label });
        hook.cleanup();
      }
      trace('EFFECT', { hook: 'useEffect', phase: 'run', idx, deps, label: label || hook.label });
      const cleanup = callback();
      hook.deps = deps ? [...deps] : undefined;
      hook.cleanup = cleanup;
    }
  }
}

// 컴포넌트 소멸 시 모든 effect cleanup 실행
export function cleanupAllEffects(instance) {
  for (const hook of instance.hooks) {
    if (hook.type === 'effect' && typeof hook.cleanup === 'function') {
      hook.cleanup();
    }
  }
  instance.pendingEffects.length = 0;
}

// ── router compat: hashchange 시 앱 루트 리렌더 ──────────────────────────────
export function scheduleRender() {
  if (appInstance) appInstance.scheduleUpdate();
}

// ── helpers ───────────────────────────────────────────────────────────────────
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function shallowEqualState(prev, next) {
  if (prev === next) return true;
  if (prev == null || next == null) return false;
  if (typeof prev !== typeof next) return false;

  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return false;
    return prev.every((v, i) => Object.is(v, next[i]));
  }

  if (typeof prev === 'object' && typeof next === 'object') {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) return false;
    return prevKeys.every(k => Object.is(prev[k], next[k]));
  }

  return false;
}

function normalizeTraceCause(cause) {
  if (!cause) return null;
  if (typeof cause === 'string') return cause;
  if (typeof cause === 'object') {
    return cause.summary || cause.label || cause.phase || null;
  }
  return String(cause);
}

// ── useMemo ───────────────────────────────────────────────────────────────────
export function useMemo(factory, deps) {
  const instance = currentInstance;
  const idx = instance.hookIndex++;

  // 첫 렌더: factory 실행 후 결과와 deps를 저장
  if (idx >= instance.hooks.length) {
    const value = factory();
    instance.hooks.push({ type: 'memo', value, deps: deps ? [...deps] : undefined });
    trace('HOOK', { hook: 'useMemo', phase: 'init', idx });
    return value;
  }

  const hook = instance.hooks[idx];
  const prevDeps = hook.deps;

  const shouldRecompute =
    prevDeps === undefined ||   // 첫 마운트
    deps === undefined ||        // deps 없음 → 매 렌더
    !shallowEqual(prevDeps, deps);

  if (shouldRecompute) {
    trace('HOOK', { hook: 'useMemo', phase: 'recompute', idx });
    hook.value = factory();
    hook.deps = deps ? [...deps] : undefined;
  } else {
    trace('HOOK', { hook: 'useMemo', phase: 'cache-hit', idx });
  }

  return hook.value;
}

// ── 테스트 유틸리티 ───────────────────────────────────────────────────────────
export function __resetHooksForTests() {
  currentInstance = null;
  appInstance = null;
}

// 하위 호환 스텁 (테스트·기타 파일에서 import 시 에러 방지)
export function setRenderFn() {}
export function getLastChangedStateKey() { return null; }
export function cleanupEffects() {}
export function __getHookStore() { return new Map(); }
export function __getEffectStore() { return new Map(); }
export function __getPendingEffects() { return []; }
