// ── tracer.js ────────────────────────────────────────────────────────────────
// Flicker DevTools용 trace 버스

// trace 타입 정의 (색상 + 아이콘)
export const TRACE_TYPES = {
  ACTION: { color: '#60a5fa', icon: '▶', label: 'ACTION' },
  HOOK:   { color: '#fbbf24', icon: '⚡', label: 'HOOK'   },
  STATE:  { color: '#fbbf24', icon: '📦', label: 'STATE'  },
  EFFECT: { color: '#f97316', icon: '🔄', label: 'EFFECT' },
  MEMO:   { color: '#a78bfa', icon: '🧠', label: 'MEMO'   },
  VDOM:   { color: '#c084fc', icon: '🌳', label: 'VDOM'   },
  DIFF:   { color: '#c084fc', icon: '🔍', label: 'DIFF'   },
  PATCH:  { color: '#34d399', icon: '✏️', label: 'PATCH'  },
  RENDER: { color: '#34d399', icon: '✅', label: 'RENDER' },
  UPDATE: { color: '#60a5fa', icon: '🔃', label: 'UPDATE' },
};

const traceListeners = new Set();
const traceHistory = [];
const TRACE_HISTORY_LIMIT = 200;
let traceEnabled = false;
let traceSeq = 0;

export function setTraceEnabled(enabled) {
  traceEnabled = Boolean(enabled);
}

export function isTraceEnabled() {
  return traceEnabled;
}

export function trace(type, detail = {}) {
  if (!traceEnabled) return null;

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
}
