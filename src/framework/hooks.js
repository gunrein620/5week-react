// ── hooks.js ──────────────────────────────────────────────────────────────────
// useState, useEffect 구현

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
  const key = `${currentKey}:state:${hookIndex++}`;

  if (!hookStore.has(key)) {
    hookStore.set(key, typeof initialValue === 'function' ? initialValue() : initialValue);
  }

  const value = hookStore.get(key);

  const setState = (newVal) => {
    const resolved = typeof newVal === 'function'
      ? newVal(hookStore.get(key))
      : newVal;

    if (resolved === hookStore.get(key)) return; // 동일하면 렌더 생략
    hookStore.set(key, resolved);
    lastChangedStateKey = key;
    scheduleRender();
  };

  return [value, setState];
}

// ── useEffect ─────────────────────────────────────────────────────────────────
export function useEffect(callback, deps) {
  const key = `${currentKey}:effect:${hookIndex++}`;

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
        prev.cleanup();
      }
      // 새 effect 실행
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
      if (typeof cleanup === 'function') cleanup();
      effectStore.delete(key);
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

// Test diagnostics (read-only)
export function __getHookStore() { return hookStore; }
export function __getEffectStore() { return effectStore; }
export function __getPendingEffects() { return pendingEffects; }
