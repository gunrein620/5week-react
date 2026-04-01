// ── test-runner.js ─────────────────────────────────────────────────────────────
// 자체 시각적 테스트 러너 (외부 프레임워크 사용 금지)

import { __resetHooksForTests } from '../framework/hooks.js';
import { __resetComponentForTests } from '../framework/component.js';
import { __resetVdomForTests } from '../framework/vdom.js';

// ── 내부 상태 ──────────────────────────────────────────────────────────────────
const suites = [];
let currentSuite = null;
let activeTest = null;
let mountedContainer = null;
let runLocked = false;
let runnerStatus = 'Run All 또는 각 테스트의 Run 버튼으로 실행하세요.';

// ── 유틸 ───────────────────────────────────────────────────────────────────────
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDefinition(optionsOrFn, maybeFn) {
  if (typeof optionsOrFn === 'function') {
    return { options: {}, fn: optionsOrFn };
  }
  return { options: optionsOrFn || {}, fn: maybeFn };
}

function normalizeForDisplay(value, seen = new WeakSet()) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return '[Function]';

  if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value.nodeType === Node.TEXT_NODE) {
      return `#text("${value.textContent || ''}")`;
    }
    const tag = value.nodeName.toLowerCase();
    const id = value.id ? `#${value.id}` : '';
    return `<${tag}${id}>`;
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entryValue]) => ({
      key,
      value: normalizeForDisplay(entryValue, seen),
    }));
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((entryValue) => normalizeForDisplay(entryValue, seen));
  }

  if (Array.isArray(value)) {
    return value.map((entryValue) => normalizeForDisplay(entryValue, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const next = {};
    for (const [key, entryValue] of Object.entries(value)) {
      next[key] = normalizeForDisplay(entryValue, seen);
    }
    seen.delete(value);
    return next;
  }

  return String(value);
}

function formatDisplay(data) {
  const normalized = normalizeForDisplay(data);
  if (typeof normalized === 'string') return normalized;
  try {
    return JSON.stringify(normalized, null, 2);
  } catch (_) {
    return String(normalized);
  }
}

function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class AssertionError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'AssertionError';
  }
}

// ── 공개 API ───────────────────────────────────────────────────────────────────
export const assert = {
  equal(actual, expected) {
    if (!deepEqual(actual, expected)) {
      throw new AssertionError(
        `Expected ${JSON.stringify(expected)}\n  Got     ${JSON.stringify(actual)}`
      );
    }
  },
  true(value) {
    if (!value) {
      throw new AssertionError(`Expected truthy, got ${JSON.stringify(value)}`);
    }
  },
};

export function log(label, data) {
  if (!activeTest) return;
  activeTest.logs.push({ label, display: formatDisplay(data) });
}

export function createSandbox(name = 'sandbox') {
  const root = document.createElement('div');
  root.dataset.testSandbox = 'true';
  root.dataset.testName = name;
  document.body.appendChild(root);
  return root;
}

export function describe(suiteName, optionsOrFn, maybeFn) {
  const { options, fn } = parseDefinition(optionsOrFn, maybeFn);
  const suite = {
    name: suiteName,
    description: options.description || '',
    notes: toArray(options.notes),
    skipReason: options.skipReason || '',
    skipped: false,
    tests: [],
  };

  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = null;
}

describe.skip = function (suiteName, optionsOrFn, maybeFn) {
  const { options, fn } = parseDefinition(optionsOrFn, maybeFn);
  const suite = {
    name: suiteName,
    description: options.description || '',
    notes: toArray(options.notes),
    skipReason: options.skipReason || '',
    skipped: true,
    tests: [],
  };

  suites.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } catch (_) {}
  currentSuite = prev;
};

export function it(testName, optionsOrFn, maybeFn) {
  if (!currentSuite) return;

  const { options, fn } = parseDefinition(optionsOrFn, maybeFn);
  const skip = currentSuite.skipped || Boolean(options.skip);

  currentSuite.tests.push({
    name: testName,
    fn,
    skip,
    skipReason: options.skipReason || currentSuite.skipReason || '',
    meta: {
      goal: options.goal || '',
      checkpoints: toArray(options.checkpoints),
    },
    logs: [],
    status: skip ? 'skip' : 'pending',
    error: null,
    running: false,
    durationMs: null,
  });
}

it.skip = function (testName, optionsOrFn, maybeFn) {
  const { options, fn } = parseDefinition(optionsOrFn, maybeFn);
  it(testName, { ...options, skip: true }, fn || (() => {}));
};

// ── 실행 ───────────────────────────────────────────────────────────────────────
function cleanupSandboxes() {
  document.querySelectorAll('[data-test-sandbox="true"]').forEach((node) => node.remove());
}

function resetProjectState() {
  cleanupSandboxes();
  __resetHooksForTests();
  __resetComponentForTests();
  __resetVdomForTests();
}

function resetTestRecord(test) {
  test.logs = [];
  test.error = null;
  test.running = false;
  test.durationMs = null;
  test.status = test.skip ? 'skip' : 'pending';
}

function syncRunnerChrome() {
  const statusEl = document.getElementById('runner-status');
  if (statusEl) statusEl.textContent = runnerStatus;

  const runAllBtn = document.getElementById('run-btn');
  if (runAllBtn) runAllBtn.disabled = runLocked;
}

async function runTest(test) {
  if (test.skip) {
    test.status = 'skip';
    return;
  }

  resetTestRecord(test);
  resetProjectState();
  activeTest = test;
  test.running = true;
  test.status = 'running';
  refreshUI();

  const start = performance.now();

  try {
    await test.fn();
    test.status = 'pass';
  } catch (e) {
    test.status = 'fail';
    test.error = e?.message || String(e);
  } finally {
    test.durationMs = Math.round((performance.now() - start) * 10) / 10;
    test.running = false;
    activeTest = null;
    cleanupSandboxes();
    refreshUI();
  }
}

async function runSingleTest(suiteIndex, testIndex) {
  if (runLocked) return;

  const suite = suites[suiteIndex];
  const test = suite?.tests[testIndex];
  if (!test) return;

  runLocked = true;
  runnerStatus = `${suite.name} / ${test.name} 실행 중`;
  refreshUI();

  await runTest(test);

  runLocked = false;
  runnerStatus = `${suite.name} / ${test.name} ${test.status === 'pass' ? '통과' : test.status === 'fail' ? '실패' : '스킵'}`;
  refreshUI();
}

export async function runAll() {
  if (runLocked) return;

  runLocked = true;
  suites.forEach((suite) => suite.tests.forEach(resetTestRecord));
  refreshUI();

  const runnable = suites.flatMap((suite) => suite.tests).filter((test) => !test.skip);
  let completed = 0;

  for (const suite of suites) {
    for (const test of suite.tests) {
      if (test.skip) {
        test.status = 'skip';
        continue;
      }

      completed += 1;
      runnerStatus = `전체 실행 중 ${completed}/${runnable.length}: ${suite.name} / ${test.name}`;
      refreshUI();
      await runTest(test);
    }
  }

  const { fail } = getStats();
  runLocked = false;
  runnerStatus = `전체 실행 완료: ${runnable.length}개 실행, 실패 ${fail}개`;
  refreshUI();
}

// ── UI 렌더 ───────────────────────────────────────────────────────────────────
const BADGE = {
  pass: '<span style="background:#16a34a;color:#f8fafc;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700">PASS</span>',
  fail: '<span style="background:#dc2626;color:#f8fafc;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700">FAIL</span>',
  skip: '<span style="background:#52525b;color:#f8fafc;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700">SKIP</span>',
  pending: '<span style="background:#27272a;color:#d4d4d8;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700">READY</span>',
  running: '<span style="background:#2563eb;color:#f8fafc;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700">RUNNING</span>',
};

function getStats() {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  let pending = 0;
  let total = 0;

  for (const suite of suites) {
    for (const test of suite.tests) {
      total += 1;
      if (test.status === 'pass') pass += 1;
      else if (test.status === 'fail') fail += 1;
      else if (test.status === 'skip') skip += 1;
      else pending += 1;
    }
  }

  return { pass, fail, skip, pending, total };
}

function renderStats(container) {
  const { pass, fail, skip, pending, total } = getStats();
  const bar = container.querySelector('#stats-bar');
  if (!bar) return;

  bar.innerHTML = `
    <span style="color:#4ade80">✓ ${pass} 통과</span>
    <span style="color:#f87171">✗ ${fail} 실패</span>
    <span style="color:#a1a1aa">— ${skip} 스킵</span>
    <span style="color:#cbd5e1">… ${pending} 대기</span>
    <span style="color:#64748b">/ ${total} 전체</span>
  `;
}

function renderGuideHTML() {
  return `
    <div style="margin-bottom:18px;padding:14px 16px;border:1px solid #1f2937;border-radius:12px;background:linear-gradient(135deg,#0f172a,#111827)">
      <div style="font-size:14px;font-weight:700;color:#f8fafc;margin-bottom:8px">어떻게 읽으면 되는지</div>
      <div style="font-size:13px;line-height:1.65;color:#cbd5e1">
        Run All은 모든 테스트를 독립 초기화 후 순서대로 실행합니다.<br>
        각 카드의 Run은 그 테스트만 별도로 다시 실행합니다.<br>
        실행이 끝나면 상세 로그가 자동으로 열리고, 내부 store/effect 변화가 그대로 표시됩니다.
      </div>
    </div>
  `;
}

function renderTags(values, palette = {}) {
  const background = palette.background || '#172033';
  const color = palette.color || '#bfdbfe';

  return values.map((value) => `
    <span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${background};color:${color};font-size:11px;font-weight:600">
      ${escHtml(value)}
    </span>
  `).join('');
}

function renderLogHTML(test) {
  const hasDetails = test.logs.length > 0 || test.error || test.skipReason;
  if (!hasDetails) return '';

  let html = '<div style="padding:12px 14px;border-top:1px solid #1f2937;background:#0b1120">';

  if (test.skipReason) {
    html += `
      <div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:#27272a">
        <div style="font-size:12px;font-weight:700;color:#f8fafc;margin-bottom:4px">스킵 이유</div>
        <div style="font-size:12px;line-height:1.6;color:#d4d4d8;white-space:pre-wrap">${escHtml(test.skipReason)}</div>
      </div>
    `;
  }

  for (const { label, display } of test.logs) {
    html += `
      <div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:#111827">
        <div style="font-size:12px;font-weight:700;color:#7dd3fc;margin-bottom:6px">${escHtml(label)}</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.65;color:#d4d4d8;white-space:pre-wrap">${escHtml(display)}</div>
      </div>
    `;
  }

  if (test.error) {
    html += `
      <div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:#2a1215;border:1px solid #7f1d1d">
        <div style="font-size:12px;font-weight:700;color:#fecaca;margin-bottom:6px">실패 메시지</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.65;color:#fecaca;white-space:pre-wrap">${escHtml(test.error)}</div>
      </div>
    `;
  }

  if (test.durationMs !== null) {
    html += `<div style="font-size:11px;color:#94a3b8">실행 시간: ${test.durationMs}ms</div>`;
  }

  html += '</div>';
  return html;
}

function renderTestHTML(test, suiteIndex, testIndex) {
  const actionDisabled = runLocked || test.skip;
  const actionLabel = test.running ? '실행 중...' : test.skip ? '스킵 유지' : 'Run';
  const showDetails = test.status !== 'pending' || Boolean(test.skipReason);
  const checkpoints = test.meta.checkpoints || [];

  return `
    <div style="margin-bottom:10px;border:1px solid #1f2937;border-radius:14px;overflow:hidden;background:#090f1c">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 16px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            ${BADGE[test.status] || BADGE.pending}
            <span style="font-size:14px;font-weight:700;color:#f8fafc">${escHtml(test.name)}</span>
          </div>
          ${test.meta.goal ? `<div style="font-size:13px;line-height:1.6;color:#cbd5e1;margin-bottom:${checkpoints.length ? '8px' : '0'}">${escHtml(test.meta.goal)}</div>` : ''}
          ${checkpoints.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${renderTags(checkpoints)}</div>` : ''}
        </div>
        <button
          class="run-test-btn"
          data-suite-index="${suiteIndex}"
          data-test-index="${testIndex}"
          ${actionDisabled ? 'disabled' : ''}
          style="flex-shrink:0;background:${actionDisabled ? '#334155' : '#2563eb'};color:#fff;border:none;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:${actionDisabled ? 'default' : 'pointer'}"
        >
          ${actionLabel}
        </button>
      </div>
      ${showDetails ? renderLogHTML(test) : ''}
    </div>
  `;
}

function renderSuiteHTML(suite, suiteIndex) {
  return `
    <section style="margin-bottom:20px;padding:18px;border:1px solid #27272a;border-radius:18px;background:linear-gradient(180deg,#09090b,#111827)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px">
        <div>
          <div style="font-size:18px;font-weight:800;color:#f8fafc">${escHtml(suite.name)}</div>
          ${suite.description ? `<div style="margin-top:8px;font-size:13px;line-height:1.7;color:#a1a1aa">${escHtml(suite.description)}</div>` : ''}
        </div>
        ${suite.skipped ? '<span style="flex-shrink:0;padding:5px 10px;border-radius:999px;background:#3f3f46;color:#fafafa;font-size:11px;font-weight:700">미구현 스킵</span>' : ''}
      </div>
      ${suite.notes.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${renderTags(suite.notes, { background: '#1f2937', color: '#cbd5e1' })}</div>` : ''}
      ${suite.tests.map((test, testIndex) => renderTestHTML(test, suiteIndex, testIndex)).join('')}
    </section>
  `;
}

function attachActionHandlers(container) {
  container.querySelectorAll('.run-test-btn').forEach((button) => {
    button.addEventListener('click', () => {
      runSingleTest(Number(button.dataset.suiteIndex), Number(button.dataset.testIndex));
    });
  });
}

export function renderUI(container) {
  mountedContainer = container;
  refreshUI(container);
}

export function refreshUI(container = mountedContainer) {
  if (!container) return;
  mountedContainer = container;

  container.innerHTML = `
    ${renderGuideHTML()}
    <div id="stats-bar" style="display:flex;gap:16px;flex-wrap:wrap;font-size:14px;font-weight:700;padding:14px 16px;background:#171717;border-radius:12px;margin-bottom:18px"></div>
    <div id="suite-list">${suites.map((suite, suiteIndex) => renderSuiteHTML(suite, suiteIndex)).join('')}</div>
  `;

  renderStats(container);
  attachActionHandlers(container);
  syncRunnerChrome();
}
