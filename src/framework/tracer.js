// ── tracer.js ────────────────────────────────────────────────────────────────
// Flicker DevTools용 trace 버스

// trace 타입 정의 (색상 + 아이콘)
export const TRACE_TYPES = {
  ACTION: { color: '#60a5fa', icon: '▶', label: 'ACTION' },
  HOOK:   { color: '#fbbf24', icon: '⚡', label: 'HOOK'   },
  STATE:  { color: '#fbbf24', icon: '📦', label: 'STATE'  },
  EFFECT: { color: '#f97316', icon: '🔄', label: 'EFFECT' },
  MEMO:   { color: '#2dd4bf', icon: '🧠', label: 'MEMO'   },
  VDOM:   { color: '#c084fc', icon: '🌳', label: 'VDOM'   },
  DIFF:   { color: '#c084fc', icon: '🔍', label: 'DIFF'   },
  PATCH:  { color: '#34d399', icon: '✏️', label: 'PATCH'  },
  RENDER: { color: '#34d399', icon: '✅', label: 'RENDER' },
  UPDATE: { color: '#60a5fa', icon: '🔃', label: 'UPDATE' },
};

// ── 트레이스 레벨 시스템 ──────────────────────────────────────────────────────
// CORE  : 핵심 상태 변경만 (발표용)
// DETAIL: 훅 동작 포함   (학습용, 기본값)
// DEBUG : 전체 표시       (디버깅용)
export const TRACE_LEVELS = {
  CORE:   0,
  DETAIL: 1,
  DEBUG:  2,
};

// 각 타입이 속하는 최소 표시 레벨
const TYPE_MIN_LEVEL = {
  ACTION: TRACE_LEVELS.CORE,
  STATE:  TRACE_LEVELS.CORE,
  RENDER: TRACE_LEVELS.CORE,
  HOOK:   TRACE_LEVELS.DETAIL,
  EFFECT: TRACE_LEVELS.DETAIL,
  MEMO:   TRACE_LEVELS.DETAIL,
  UPDATE: TRACE_LEVELS.DETAIL,
  VDOM:   TRACE_LEVELS.DEBUG,
  DIFF:   TRACE_LEVELS.DEBUG,
  PATCH:  TRACE_LEVELS.DEBUG,
};

const traceListeners = new Set();
const traceHistory = [];
const TRACE_HISTORY_LIMIT = 200;
let traceEnabled = false;
let traceSeq = 0;
let currentTraceLevel = TRACE_LEVELS.DETAIL; // 기본값: DETAIL
let currentTraceCause = null;

export function setTraceEnabled(enabled) {
  traceEnabled = Boolean(enabled);
}

export function isTraceEnabled() {
  return traceEnabled;
}

export function setTraceLevel(level) {
  currentTraceLevel = level;
}

export function getTraceLevel() {
  return currentTraceLevel;
}

export function getCurrentTraceCause() {
  return currentTraceCause;
}

export function runWithTraceCause(cause, fn) {
  const prev = currentTraceCause;
  currentTraceCause = cause;
  try {
    return fn();
  } finally {
    currentTraceCause = prev;
  }
}

export function trace(type, detail = {}) {
  if (!traceEnabled) return null;

  // 현재 레벨보다 높은 상세도 타입은 무시
  const minLevel = TYPE_MIN_LEVEL[type] ?? TRACE_LEVELS.DEBUG;
  if (minLevel > currentTraceLevel) return null;

  const entry = {
    id: ++traceSeq,
    type,
    detail,
    timestamp: Date.now(),
  };

  traceHistory.push(entry);
  if (traceHistory.length > TRACE_HISTORY_LIMIT) {
    traceHistory.shift();
  }

  for (const listener of traceListeners) {
    listener(entry, getTraceHistory());
  }

  return entry;
}

export function addTraceListener(listener) {
  traceListeners.add(listener);
}

export function removeTraceListener(listener) {
  traceListeners.delete(listener);
}

export function getTraceHistory() {
  return traceHistory.slice();
}

export function clearTraceHistory() {
  traceHistory.length = 0;

  for (const listener of traceListeners) {
    listener(null, getTraceHistory());
  }
}

export function __resetTracerForTests() {
  traceEnabled = false;
  traceHistory.length = 0;
  traceSeq = 0;
  currentTraceLevel = TRACE_LEVELS.DETAIL;
  currentTraceCause = null;
}
