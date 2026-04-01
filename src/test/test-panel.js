// ── test-panel.js ─────────────────────────────────────────────────────────────
// 앱 우측 하단 플로팅 버튼 + 슬라이드인 터미널 패널

import { addUpdateListener, getSuites, runAll } from './test-runner.js';
// 테스트 파일 import → describe/it 등록 (사이드이펙트)
import './unit-tests.js';
import './feature-tests.js';

// ── 내부 상태 ──────────────────────────────────────────────────────────────────
let panelOpen    = false;
let panelEl      = null;
let toggleBtn    = null;
let startTime    = null;
let isRunning    = false;

const collapsedSuites = new Set();

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getStats() {
  let pass = 0, fail = 0, skip = 0, total = 0;
  for (const suite of getSuites()) {
    for (const test of suite.tests) {
      total++;
      if (test.status === 'pass')  pass++;
      else if (test.status === 'fail')  fail++;
      else if (test.status === 'skip')  skip++;
    }
  }
  return { pass, fail, skip, total };
}

const STATUS_ICON = {
  pass:    '✓',
  fail:    '✗',
  skip:    '─',
  running: '●',
  pending: '○',
};

// ── 렌더 ──────────────────────────────────────────────────────────────────────
function renderPanel() {
  if (!panelEl) return;

  const suites  = getSuites();
  const { pass, fail, skip, total } = getStats();
  const body    = panelEl.querySelector('.tp-body');
  const footer  = panelEl.querySelector('.tp-footer');
  const runBtn  = panelEl.querySelector('#tp-run-btn');

  if (runBtn) runBtn.disabled = isRunning;

  // ── 스위트 목록 ──
  body.innerHTML = suites.map((suite, si) => {
    const collapsed  = collapsedSuites.has(si);
    const suiteFail  = suite.tests.filter(t => t.status === 'fail').length;
    const suitePass  = suite.tests.filter(t => t.status === 'pass').length;
    const suiteTotal = suite.tests.length;

    const suiteIcon = suiteFail > 0 ? '✗'
      : suitePass === suiteTotal ? '✓'
      : '·';
    const suiteIconColor = suiteFail > 0 ? 'color:#f87171'
      : suitePass === suiteTotal ? 'color:#22c55e'
      : 'color:#374151';

    const testsHtml = collapsed ? '' : suite.tests.map(test => {
      const icon = STATUS_ICON[test.status] || '○';
      const ms   = test.durationMs !== null ? `${test.durationMs}ms` : '';
      const errHtml = test.error
        ? `<div class="tp-test-error">${esc(test.error)}</div>`
        : '';

      return `
        <div class="tp-test ${test.status}">
          <span class="tp-test-icon">${icon}</span>
          <span class="tp-test-name" title="${esc(test.name)}">${esc(test.name)}</span>
          <span class="tp-test-ms">${ms}</span>
        </div>
        ${errHtml}
      `;
    }).join('');

    return `
      <div class="tp-suite">
        <div class="tp-suite-header" data-suite-idx="${si}">
          <span class="tp-suite-icon" style="${suiteIconColor}">${suiteIcon}</span>
          <span class="tp-suite-name">${esc(suite.name)}</span>
          <span class="tp-suite-badge">${suitePass}/${suiteTotal}</span>
          <span class="tp-suite-toggle">${collapsed ? '▸' : '▾'}</span>
        </div>
        <div class="tp-tests">${testsHtml}</div>
      </div>
    `;
  }).join('');

  // ── 아코디언 토글 이벤트 ──
  body.querySelectorAll('[data-suite-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.suiteIdx);
      if (collapsedSuites.has(idx)) collapsedSuites.delete(idx);
      else collapsedSuites.add(idx);
      renderPanel();
    });
  });

  // ── 푸터 통계 ──
  const elapsed  = startTime ? `${Math.round(performance.now() - startTime)}ms` : '';
  const runCount = suites.flatMap(s => s.tests).filter(t => t.status !== 'pending').length;

  footer.innerHTML = `
    <div class="tp-stats">
      <span class="s-pass">✓ ${pass}</span>
      <span class="s-fail">✗ ${fail}</span>
      <span class="s-skip">─ ${skip}</span>
      <span class="s-total">/ ${total}</span>
    </div>
    ${elapsed ? `<div class="tp-duration">Duration: ${elapsed}</div>` : ''}
    ${runCount > 0 && runCount < total ? `<div class="tp-status-line">Running ${runCount}/${total}…</div>` : ''}
  `;
}

// ── DOM 생성 ──────────────────────────────────────────────────────────────────
function createPanel() {
  // 플로팅 토글 버튼
  toggleBtn = document.createElement('button');
  toggleBtn.id    = 'test-panel-toggle';
  toggleBtn.title = 'Test Panel 열기/닫기';
  toggleBtn.textContent = '🧪';
  document.body.appendChild(toggleBtn);

  // 슬라이드인 패널
  panelEl = document.createElement('div');
  panelEl.id = 'test-panel';
  panelEl.innerHTML = `
    <div class="tp-header">
      <span class="tp-title">⚡ Test Terminal</span>
      <div class="tp-controls">
        <button class="tp-btn" id="tp-run-btn">▶ Run All</button>
        <button class="tp-btn-close" id="tp-close-btn" title="닫기">✕</button>
      </div>
    </div>
    <div class="tp-body"></div>
    <div class="tp-footer"></div>
  `;
  document.body.appendChild(panelEl);

  // ── 이벤트 ──
  toggleBtn.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panelEl.classList.toggle('open', panelOpen);
    if (panelOpen) renderPanel();
  });

  panelEl.querySelector('#tp-close-btn').addEventListener('click', () => {
    panelOpen = false;
    panelEl.classList.remove('open');
  });

  panelEl.querySelector('#tp-run-btn').addEventListener('click', async () => {
    if (isRunning) return;
    isRunning  = true;
    startTime  = performance.now();
    renderPanel();
    await runAll();
    isRunning = false;
    renderPanel();
  });
}

// ── 공개 API ──────────────────────────────────────────────────────────────────
export function initTestPanel() {
  if (typeof document === 'undefined') return;

  // CSS 동적 로드
  if (!document.querySelector('link[href="/styles/test-panel.css"]')) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = '/styles/test-panel.css';
    document.head.appendChild(link);
  }

  createPanel();

  // test-runner 업데이트 구독 → 패널 열려있으면 리렌더
  addUpdateListener(() => {
    if (panelOpen) renderPanel();
  });

  // 초기 렌더 (패널 닫힌 상태에서도 통계 준비)
  renderPanel();
}
