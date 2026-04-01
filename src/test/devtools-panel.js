// ── devtools-panel.js ─────────────────────────────────────────────────────────
// Flicker DevTools 패널 — 시나리오 선택 → 실행 → 트레이스 렌더링

import { scenarios } from './scenarios.js';
import {
  setTraceEnabled,
  clearTraceHistory,
  addTraceListener,
  removeTraceListener,
  TRACE_TYPES,
  TRACE_LEVELS,
  setTraceLevel,
  getTraceLevel,
} from '../framework/tracer.js';
import { TimeController } from './scenario-setup.js';

// ── 내부 상태 ──────────────────────────────────────────────────────────────────
let panelOpen = false;
let panelEl   = null;
let toggleBtn = null;
let view      = 'list';   // 'list' | 'run' | 'disabled'
let selectedIdx    = null;   // 현재 선택된 시나리오 인덱스
let isRunning      = false;

// ── 유틸 ──────────────────────────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── 트레이스 타입별 색상/아이콘 ───────────────────────────────────────────────
function getTypeInfo(type) {
  return TRACE_TYPES[type] || { color: '#9ca3af', icon: '·', label: type };
}

// ── trace detail 포맷팅 ───────────────────────────────────────────────────────

// 대용량/노이즈 데이터 정제 헬퍼
const IMAGE_KEYS = new Set(['imageData', 'preview', 'base64', 'dataUrl', 'src']);
const MAX_STR_LEN = 100;

function sanitizeValue(value, key = '') {
  if (value === null || value === undefined) return value;

  // 이미지/base64 데이터 은닉
  if (IMAGE_KEYS.has(key) || (typeof value === 'string' && value.startsWith('data:'))) {
    return `[image omitted, length: ${String(value).length}]`;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STR_LEN ? value.slice(0, MAX_STR_LEN) + '…' : value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[] (0개)';
    const first = value[0];
    const summary = first && typeof first === 'object'
      ? JSON.stringify(sanitizeObject(first)).slice(0, 80)
      : String(first).slice(0, 80);
    return `[배열 ${value.length}개] 첫 항목: ${summary}`;
  }

  if (typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (IMAGE_KEYS.has(k) || (typeof v === 'string' && v.startsWith('data:'))) {
      result[k] = `[image omitted, length: ${String(v).length}]`;
    } else if (typeof v === 'string' && v.length > MAX_STR_LEN) {
      result[k] = v.slice(0, MAX_STR_LEN) + '…';
    } else if (Array.isArray(v)) {
      result[k] = `[배열 ${v.length}개]`;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function formatDetail(type, detail) {
  if (!detail || typeof detail !== 'object') return '';

  const rows = [];
  const tree = (label, value, isLast = false) => {
    const prefix = isLast ? '└─' : '├─';
    const sanitized = sanitizeValue(value, label);
    const valStr = sanitized === null || sanitized === undefined
      ? '<span style="color:#4b5563">null</span>'
      : typeof sanitized === 'object'
        ? `<span style="color:#9ca3af">${esc(JSON.stringify(sanitized))}</span>`
        : `<span style="color:#e2e8f0">${esc(String(sanitized))}</span>`;
    rows.push(`<span style="color:#4b5563">${prefix}</span> <span style="color:#9ca3af">${esc(label)}</span> : ${valStr}`);
  };

  switch (type) {
    case 'ACTION': {
      if (detail.message) rows.push(`<span style="color:#60a5fa">${esc(detail.message)}</span>`);
      if (detail.eventType) tree('eventType', detail.eventType);
      if (detail.target?.className) tree('target', detail.target.className, true);
      break;
    }

    case 'HOOK': {
      const { hook, phase, hookIndex, key, value, prev, next, deps, bailout, cause } = detail;
      tree('hook', hook);
      if (phase) tree('phase', phase);
      if (hookIndex !== undefined) tree('hookIndex', hookIndex);
      if (key) tree('key', key.split(':').slice(-2).join(':'));
      if (phase === 'read' && value !== undefined) {
        tree('value', value, true);
      }
      if (phase === 'set') {
        if (prev !== undefined) tree('이전 state', prev);
        if (next !== undefined) tree('새 state', next);
        if (cause) tree('origin', cause);
        if (bailout !== undefined) tree('bailout', bailout, true);
      }
      if (deps !== undefined) tree('deps', JSON.stringify(deps), true);
      break;
    }

    case 'STATE': {
      const { reason, prev, next, changedKeys, cause } = detail;
      if (reason) tree('reason', reason);
      if (cause) tree('cause', cause);
      if (changedKeys?.length) tree('changedKeys', changedKeys.map(k => k.split(':').pop()).join(', '));
      if (prev !== undefined) tree('이전', prev);
      if (next !== undefined) tree('새 값', next, true);
      break;
    }

    case 'EFFECT': {
      const { phase, key, deps, prevDeps, hasCleanup, reason, label } = detail;
      if (label) tree('label', label);
      tree('phase', phase);
      if (phase === 'timer-tick') {
        tree('note', 'setInterval 콜백 — useEffect [] 에 의해 마운트 시 등록됨', true);
      } else {
        if (key) tree('key', key.split(':').slice(-2).join(':'));
        if (deps !== undefined) tree('deps', JSON.stringify(deps));
        if (prevDeps !== undefined) tree('prevDeps', JSON.stringify(prevDeps));
        if (hasCleanup !== undefined) tree('cleanup', hasCleanup ? '있음' : '없음', !reason);
        if (reason) tree('reason', reason, true);
      }
      break;
    }

    case 'VDOM': {
      const { root } = detail;
      if (root) {
        tree('tagName', root.tagName || root.type);
        tree('childCount', root.childCount, true);
      }
      break;
    }

    case 'DIFF': {
      const { count, patches } = detail;
      tree('변경된 노드', count);
      if (patches?.length) {
        const types = patches.map(p => p.type).join(', ');
        tree('패치 목록', types, true);
      }
      if (count === 0) rows.push(`<span style="color:#4b5563">  (변경 없음 — 스킵)</span>`);
      break;
    }

    case 'PATCH': {
      const { count, applied } = detail;
      tree('적용된 패치', count);
      if (applied?.length) {
        applied.slice(0, 3).forEach((p, i) => {
          const desc = p.type === 'TEXT'
            ? `${p.type} "${esc(String(p.from ?? ''))}" → "${esc(String(p.to ?? ''))}"`
            : `${p.type}${p.tagName ? ` <${p.tagName}>` : ''}`;
          tree(`  [${i}]`, desc, i === Math.min(applied.length - 1, 2));
        });
        if (applied.length > 3) rows.push(`<span style="color:#4b5563">  ... 외 ${applied.length - 3}개</span>`);
      }
      break;
    }

    case 'RENDER': {
      const { duration } = detail;
      const patchCount = detail.patchCount ?? detail.count ?? 0;
      tree('변경 노드', `${patchCount}개`);
      tree('소요 시간', `${duration}ms`, true);
      break;
    }

    case 'UPDATE': {
      tree('component', detail.component, !detail.cause);
      if (detail.cause) tree('cause', detail.cause, true);
      break;
    }

    default: {
      // 알 수 없는 타입은 JSON으로 fallback
      const entries = Object.entries(detail);
      entries.forEach(([k, v], i) => {
        tree(k, typeof v === 'object' ? JSON.stringify(v) : v, i === entries.length - 1);
      });
    }
  }

  return rows.join('\n');
}

// ── 트레이스 엔트리 DOM 생성 ───────────────────────────────────────────────────
function createEntryEl(entry) {
  const info = getTypeInfo(entry.type);
  const detail = entry.detail || {};

  const wrapper = document.createElement('div');
  wrapper.className = 'dt-entry';

  // 구분선 (ACTION 앞에)
  if (entry.type === 'ACTION') {
    const sep = document.createElement('div');
    sep.className = 'dt-entry-sep';
    sep.textContent = '─'.repeat(32);
    wrapper.appendChild(sep);
  }

  // 타입 배지 + 요약
  const mainRow = document.createElement('div');
  const typeBadge = document.createElement('span');
  typeBadge.className = 'dt-entry-type';
  typeBadge.style.color = info.color;
  typeBadge.textContent = `[${info.label}]`;
  mainRow.appendChild(typeBadge);

  // 요약 텍스트
  const summaryEl = document.createElement('span');
  summaryEl.className = 'dt-entry-body';
  summaryEl.innerHTML = getSummary(entry.type, detail);
  mainRow.appendChild(summaryEl);

  wrapper.appendChild(mainRow);

  // 상세 (detail row가 있으면)
  const detailHtml = formatDetail(entry.type, detail);
  if (detailHtml) {
    const detailEl = document.createElement('div');
    detailEl.className = 'dt-entry-detail';
    detailEl.innerHTML = detailHtml;
    wrapper.appendChild(detailEl);
  }

  return wrapper;
}

function getSummary(type, detail) {
  switch (type) {
    case 'ACTION':
      if (detail.message) return `<span style="color:#60a5fa">${esc(detail.message)}</span>`;
      return `<span style="color:#60a5fa">${esc(detail.eventType || '')} ${esc(detail.target?.text || '')}</span>`;
    case 'HOOK':
      if (detail.hook === 'useState' && detail.phase === 'set') {
        return `<span style="color:#fbbf24">useState</span> <span style="color:#9ca3af">상태 업데이트</span>`;
      }
      if (detail.hook === 'useState') {
        return `<span style="color:#fbbf24">useState</span> <span style="color:#9ca3af">호출</span>`;
      }
      return `<span style="color:#fbbf24">${esc(detail.hook || 'hook')}</span> <span style="color:#9ca3af">${esc(detail.phase || '')}</span>`;
    case 'STATE':
      if (detail.reason === 'scheduleRender') {
        return `<span style="color:#9ca3af">상태 변경 감지 → scheduleRender()</span>`;
      }
      if (detail.cause) {
        return `<span style="color:#9ca3af">상태 변경 감지</span> <span style="color:#6b7280">(${esc(detail.cause)})</span>`;
      }
      return `<span style="color:#9ca3af">상태 변경 감지</span>`;
    case 'EFFECT': {
      const labelPart = detail.label ? ` <span style="color:#e2e8f0">${esc(detail.label)}</span>` : '';
      if (detail.phase === 'run') return `<span style="color:#f97316">useEffect</span>${labelPart} <span style="color:#9ca3af">실행</span>`;
      if (detail.phase === 'cleanup') return `<span style="color:#f97316">useEffect</span>${labelPart} <span style="color:#9ca3af">cleanup 실행</span>`;
      if (detail.phase === 'timer-tick') return `<span style="color:#f97316">useEffect</span>${labelPart} <span style="color:#9ca3af">타이머 틱</span>`;
      return `<span style="color:#f97316">useEffect</span>${labelPart} <span style="color:#9ca3af">${esc(detail.phase || '')}</span>`;
    }
    case 'VDOM':
      return `<span style="color:#9ca3af">Virtual DOM 생성 완료</span>`;
    case 'DIFF': {
      const n = detail.count ?? '?';
      return n === 0
        ? `<span style="color:#9ca3af">이전 VDOM과 동일 — 패치 없음</span>`
        : `<span style="color:#9ca3af">이전 VDOM ↔ 새 VDOM 비교 (${n}개 변경)</span>`;
    }
    case 'PATCH': {
      const n = detail.count ?? '?';
      return n === 0
        ? `<span style="color:#9ca3af">DOM 업데이트 없음</span>`
        : `<span style="color:#34d399">실제 DOM 업데이트 (${n}개 패치 적용)</span>`;
    }
    case 'RENDER': {
      const patchCount = detail.patchCount ?? detail.count ?? 0;
      return `<span style="color:#34d399">렌더 완료</span> <span style="color:#6b7280">(${patchCount}개 변경 / ${detail.duration}ms)</span>`;
    }
    case 'UPDATE':
      if (detail.cause) {
        return `<span style="color:#9ca3af">컴포넌트 업데이트</span> <span style="color:#6b7280">(${esc(detail.cause)})</span>`;
      }
      return `<span style="color:#9ca3af">컴포넌트 업데이트</span>`;
    default:
      return `<span style="color:#9ca3af">${esc(JSON.stringify(detail).slice(0, 60))}</span>`;
  }
}

// ── 패널 렌더 ─────────────────────────────────────────────────────────────────
function renderListView() {
  const listView = panelEl.querySelector('#dt-list-view');
  const runView  = panelEl.querySelector('#dt-run-view');
  listView.style.display = 'flex';
  runView.style.display  = 'none';

  const listEl  = panelEl.querySelector('#dt-scenario-list');
  const runBtn  = panelEl.querySelector('#dt-run-btn');

  // 시나리오 목록
  listEl.innerHTML = scenarios.map((s, i) => {
    const isSelected = i === selectedIdx;
    const isDisabled = !s.enabled;

    const highlightTags = (s.highlights || []).map(h => {
      const cls = h === 'useEffect' ? 'dt-highlight-tag--effect'
        : h === 'useMemo' ? 'dt-highlight-tag--memo'
        : '';
      return `<span class="dt-highlight-tag ${cls}">${esc(h)}</span>`;
    }).join(' ');

    return `
      <div class="dt-scenario-item${isSelected ? ' dt-scenario-item--selected' : ''}${isDisabled ? ' dt-scenario-item--disabled' : ''}"
           data-idx="${i}">
        <div class="dt-scenario-icon">${s.icon}</div>
        <div class="dt-scenario-info">
          <div class="dt-scenario-title">
            ${esc(s.title)}
            ${highlightTags}
            ${isDisabled ? '<span class="dt-scenario-badge">준비중</span>' : ''}
          </div>
          <div class="dt-scenario-desc">${esc(s.description)}</div>
          ${isDisabled ? `<div class="dt-scenario-disabled-msg">⚠️ ${esc(s.disabledMessage || '')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // 클릭 이벤트
  listEl.querySelectorAll('.dt-scenario-item:not(.dt-scenario-item--disabled)').forEach(el => {
    el.addEventListener('click', () => {
      selectedIdx = parseInt(el.dataset.idx, 10);
      renderListView();
    });
  });

  // 실행 버튼 상태
  if (runBtn) {
    runBtn.disabled = selectedIdx === null || isRunning;
  }
}

function renderRunView(scenario) {
  const listView = panelEl.querySelector('#dt-list-view');
  const runView  = panelEl.querySelector('#dt-run-view');
  listView.style.display = 'none';
  runView.style.display  = 'flex';

  const titleEl   = runView.querySelector('.dt-run-scenario-name');
  const outputEl  = runView.querySelector('#dt-trace-output');
  const verifyEl  = runView.querySelector('#dt-verify');

  if (titleEl)  titleEl.textContent = `${scenario.icon} ${scenario.title}`;
  if (outputEl) outputEl.innerHTML  = '';
  if (verifyEl) verifyEl.innerHTML  = '';
}

function showDisabledView(scenario) {
  const listView = panelEl.querySelector('#dt-list-view');
  const runView  = panelEl.querySelector('#dt-run-view');
  listView.style.display = 'none';
  runView.style.display  = 'flex';

  const titleEl  = runView.querySelector('.dt-run-scenario-name');
  const outputEl = runView.querySelector('#dt-trace-output');
  const verifyEl = runView.querySelector('#dt-verify');

  if (titleEl) titleEl.textContent = `${scenario.icon} ${scenario.title}`;

  if (outputEl) {
    const plannedList = (scenario.plannedVerify || [])
      .map(v => `<li>${esc(v)}</li>`)
      .join('');

    outputEl.innerHTML = `
      <div class="dt-disabled-detail">
        <div class="dt-disabled-detail-title">⚠️ ${esc(scenario.disabledMessage || '준비 중')}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">
          useMemo 구현 후 <code style="color:#a78bfa">scenarios.js</code>에서<br>
          <code style="color:#34d399">enabled: true</code>로 변경하면 바로 활성화됩니다.
        </div>
        ${plannedList ? `
          <div class="dt-disabled-planned">
            구현 시 트레이스할 내용:
            <ul style="list-style:none;padding:0;margin:6px 0 0 0;">${plannedList}</ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (verifyEl) verifyEl.innerHTML = '';
}

// ── trace 그룹핑 ──────────────────────────────────────────────────────────────
// 수집된 trace 엔트리를 렌더 사이클(UPDATE~RENDER)과 단독 엔트리로 분류
function groupTraceEntries(entries) {
  const groups = [];
  let cycleEntries = null;

  for (const entry of entries) {
    if (entry.type === 'UPDATE') {
      // 새 렌더 사이클 시작
      if (cycleEntries) {
        groups.push({ type: 'render-cycle', entries: cycleEntries });
      }
      cycleEntries = [entry];
    } else if (cycleEntries) {
      cycleEntries.push(entry);
      if (entry.type === 'RENDER') {
        // 렌더 사이클 완료
        groups.push({ type: 'render-cycle', entries: cycleEntries });
        cycleEntries = null;
      }
    } else {
      groups.push({ type: 'single', entry });
    }
  }

  // 닫히지 않은 사이클
  if (cycleEntries) {
    groups.push({ type: 'render-cycle', entries: cycleEntries });
  }

  return groups;
}

// 렌더 사이클 블록 DOM 생성 (접힘 가능)
function createRenderCycleEl(group) {
  const entries = group.entries;
  const updateEntry = entries[0];
  const renderEntry = entries.find(e => e.type === 'RENDER');
  const diffEntry = entries.find(e => e.type === 'DIFF');
  const patchEntry = entries.find(e => e.type === 'PATCH');

  const cause = updateEntry?.detail?.cause;
  const patchCount = renderEntry?.detail?.patchCount ?? renderEntry?.detail?.count ?? diffEntry?.detail?.count ?? '?';
  const duration = renderEntry?.detail?.duration ?? '?';

  // 요약 정보
  const causeLabel = cause
    ? cause.split(':').slice(-2).join(':')
    : 'update';

  const wrapper = document.createElement('div');
  wrapper.className = 'dt-entry dt-render-cycle';
  wrapper.style.borderLeft = '2px solid #2d2d50';
  wrapper.style.paddingLeft = '12px';
  wrapper.style.marginLeft = '4px';
  wrapper.style.cursor = 'pointer';

  // 요약 행
  const summary = document.createElement('div');
  summary.style.display = 'flex';
  summary.style.alignItems = 'center';
  summary.style.gap = '8px';
  summary.innerHTML = `
    <span style="color:#4b5563;font-size:11px;" class="dt-cycle-toggle">▸</span>
    <span class="dt-entry-type" style="color:#60a5fa;">[RENDER CYCLE]</span>
    <span style="color:#9ca3af;font-size:12px;">
      ${patchCount}개 패치 / ${duration}ms
      <span style="color:#4b5563;margin-left:6px;">← ${esc(causeLabel)}</span>
    </span>
  `;
  wrapper.appendChild(summary);

  // 상세 엔트리 (접힌 상태)
  const detailContainer = document.createElement('div');
  detailContainer.style.display = 'none';
  detailContainer.style.marginTop = '4px';

  for (const entry of entries) {
    detailContainer.appendChild(createEntryEl(entry));
  }
  wrapper.appendChild(detailContainer);

  // 토글
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = detailContainer.style.display !== 'none';
    detailContainer.style.display = isOpen ? 'none' : 'block';
    summary.querySelector('.dt-cycle-toggle').textContent = isOpen ? '▸' : '▾';
  });

  return wrapper;
}

// ── 시나리오 실행 ─────────────────────────────────────────────────────────────
async function executeScenario(scenario) {
  if (isRunning) return;
  isRunning = true;

  const runView  = panelEl.querySelector('#dt-run-view');
  const outputEl = runView.querySelector('#dt-trace-output');
  const verifyEl = runView.querySelector('#dt-verify');
  const backBtn  = runView.querySelector('.dt-run-back');

  if (outputEl) outputEl.innerHTML = '';
  if (verifyEl) verifyEl.innerHTML = '';
  if (backBtn)  backBtn.disabled   = true;

  // ── Phase 1: Silent Setup ─────────────────────────────────────────────────
  // setup()이 있으면 트레이싱 OFF 상태로 사전 작업 수행
  // (게시글 생성, 로그인 보장 등 — 트레이스에 기록되지 않음)
  if (typeof scenario.setup === 'function') {
    const setupEl = document.createElement('div');
    setupEl.className = 'dt-running-indicator';
    setupEl.innerHTML = `<div class="dt-spinner"></div><span>사전 준비 중...</span>`;
    if (outputEl) outputEl.appendChild(setupEl);

    try {
      await scenario.setup();
    } catch (err) {
      console.error('[DevTools] setup 오류:', err);
    }

    if (outputEl) outputEl.innerHTML = '';
  }

  // ── Phase 2: Run (Trace Collection) ──────────────────────────────────────
  // 타이머 정지 + 트레이싱 ON + 시나리오 실행
  const shouldPause = TimeController.shouldPause(scenario.id);
  if (shouldPause) {
    await TimeController.pause();
  }

  const collected = [];
  const listener = (entry) => {
    if (entry) collected.push(entry);
  };
  addTraceListener(listener);
  clearTraceHistory();
  setTraceEnabled(true);

  const runningEl = document.createElement('div');
  runningEl.className = 'dt-running-indicator';
  runningEl.innerHTML = `<div class="dt-spinner"></div><span>시나리오 실행 중...</span>`;
  if (outputEl) outputEl.appendChild(runningEl);

  try {
    await scenario.run(null, null);
  } catch (err) {
    console.error('[DevTools] 시나리오 실행 오류:', err);
  } finally {
    setTraceEnabled(false);
    removeTraceListener(listener);
  }

  if (outputEl) outputEl.innerHTML = '';

  // ── Phase 3: Display ──────────────────────────────────────────────────────
  // 타이머는 아직 정지 상태 — 트레이스 렌더링 중 글이 사라지지 않음
  const groups = groupTraceEntries(collected);

  for (const group of groups) {
    await wait(300);
    if (!panelOpen || view !== 'run') break;

    if (group.type === 'render-cycle') {
      // 렌더 사이클: 접힘 가능한 블록
      const cycleEl = createRenderCycleEl(group);
      if (outputEl) {
        outputEl.appendChild(cycleEl);
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    } else {
      // 단독 엔트리 (ACTION, STATE 등)
      const el = createEntryEl(group.entry);
      if (outputEl) {
        outputEl.appendChild(el);
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    }
  }

  // 마지막 구분선
  if (outputEl && collected.length > 0) {
    const endSep = document.createElement('div');
    endSep.className = 'dt-entry-sep';
    endSep.textContent = '─'.repeat(32);
    outputEl.appendChild(endSep);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  await wait(300);

  // ── Phase 4: Verify ───────────────────────────────────────────────────────
  if (verifyEl) {
    let verifyResults = [];
    try {
      verifyResults = scenario.verify() || [];
    } catch (err) {
      console.error('[DevTools] verify 오류:', err);
    }

    if (verifyResults.length) {
      const titleEl = document.createElement('div');
      titleEl.className = 'dt-verify-title';
      titleEl.textContent = '────────── 검증 ──────────';
      verifyEl.appendChild(titleEl);

      for (const result of verifyResults) {
        let ok = false;
        try { ok = Boolean(result.check()); } catch { ok = false; }

        const item = document.createElement('div');
        item.className = `dt-verify-item ${ok ? 'pass' : 'fail'}`;
        item.textContent = `${ok ? '✅' : '❌'} ${result.label}`;
        verifyEl.appendChild(item);
      }
    }
  }

  // ── Phase 5: Cleanup ──────────────────────────────────────────────────────
  // 트레이스 표시 + 검증이 끝난 후에야 타이머 재개
  // → 글 작성 시나리오에서 피드 표시를 확인한 뒤 TTL 감소 시작
  if (shouldPause) {
    await TimeController.resume();
  }

  isRunning = false;
  if (backBtn) backBtn.disabled = false;
}

// ── DOM 생성 ──────────────────────────────────────────────────────────────────
function createPanel() {
  // 플로팅 토글 버튼
  toggleBtn = document.createElement('button');
  toggleBtn.id    = 'dt-toggle';
  toggleBtn.title = 'Flicker DevTools 열기/닫기';
  toggleBtn.textContent = '🧪';
  document.body.appendChild(toggleBtn);

  // 패널 본체
  panelEl = document.createElement('div');
  panelEl.id = 'dt-panel';
  panelEl.innerHTML = `
    <div class="dt-header">
      <span class="dt-title">⚡ Flicker DevTools</span>
      <div class="dt-header-right">
        <button class="dt-btn-close" id="dt-close-btn" title="닫기">✕</button>
      </div>
    </div>

    <!-- 레벨 토글 -->
    <div class="dt-level-bar">
      <span class="dt-level-label">레벨:</span>
      <button class="dt-level-btn" data-level="0" title="핵심 상태 변경만 표시">CORE</button>
      <button class="dt-level-btn dt-level-btn--active" data-level="1" title="훅 동작 포함 (기본)">DETAIL</button>
      <button class="dt-level-btn" data-level="2" title="VDOM/DIFF/PATCH 포함">DEBUG</button>
    </div>

    <!-- 리스트 뷰 -->
    <div id="dt-list-view" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
      <div class="dt-section-label">▼ 시나리오 선택</div>
      <div id="dt-scenario-list"></div>
      <div class="dt-list-actions">
        <button class="dt-btn" id="dt-run-btn" disabled>▶ 실행</button>
        <button class="dt-btn" id="dt-reset-btn" title="시나리오 선택 초기화">🔄 초기화</button>
      </div>
    </div>

    <!-- 실행 뷰 -->
    <div id="dt-run-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
      <div class="dt-run-header">
        <button class="dt-run-back" id="dt-back-btn">◀ 뒤로</button>
        <span class="dt-run-scenario-name"></span>
      </div>
      <div id="dt-trace-output"></div>
      <div id="dt-verify" class="dt-verify"></div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // ── 이벤트 ────────────────────────────────────────────────────────────────

  // 토글
  toggleBtn.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panelEl.classList.toggle('open', panelOpen);
    if (panelOpen) {
      view = 'list';
      renderListView();
    }
  });

  // 닫기
  panelEl.querySelector('#dt-close-btn').addEventListener('click', () => {
    panelOpen = false;
    panelEl.classList.remove('open');
  });

  // 레벨 토글
  panelEl.querySelectorAll('.dt-level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.dataset.level, 10);
      setTraceLevel(level);
      panelEl.querySelectorAll('.dt-level-btn').forEach(b => b.classList.remove('dt-level-btn--active'));
      btn.classList.add('dt-level-btn--active');
    });
  });

  // 초기화
  panelEl.querySelector('#dt-reset-btn').addEventListener('click', () => {
    selectedIdx = null;
    renderListView();
  });

  // 실행
  panelEl.querySelector('#dt-run-btn').addEventListener('click', async () => {
    if (selectedIdx === null || isRunning) return;
    const scenario = scenarios[selectedIdx];
    if (!scenario) return;

    if (!scenario.enabled) {
      view = 'disabled';
      showDisabledView(scenario);
      return;
    }

    view = 'run';
    renderRunView(scenario);
    await executeScenario(scenario);
  });

  // 뒤로
  panelEl.querySelector('#dt-back-btn').addEventListener('click', () => {
    if (isRunning) return;
    view = 'list';
    renderListView();
  });
}

// ── 공개 API ──────────────────────────────────────────────────────────────────
export function initDevTools() {
  if (typeof document === 'undefined') return;

  // CSS 동적 로드
  if (!document.querySelector('link[href="/styles/devtools.css"]')) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = '/styles/devtools.css';
    document.head.appendChild(link);
  }

  createPanel();
  renderListView();
}
