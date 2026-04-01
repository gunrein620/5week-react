# 시나리오 트레이싱 개선 계획

## 문제 정의

현재 Flicker DevTools의 시나리오 트레이싱 시스템은 다음 문제를 갖고 있다:
- 모든 트레이스가 필터 없이 표시되어 핵심 상태 변경을 파악하기 어려움
- 시간 감소 타이머가 시나리오 검증을 방해
- TTL/좋아요 시나리오의 사전 작업(게시글 생성)이 수동이라 타이밍 이슈 발생
- 글 작성 시나리오에서 트레이싱 UI와 백그라운드 로직 간 Race Condition 존재

## 현재 코드베이스 상태

### 파일 구조 (관련 파일)
```
src/
├── framework/
│   ├── tracer.js        (79줄)  — trace 이벤트 버스, 필터링 없음
│   ├── hooks.js         (221줄) — useState, useEffect + trace 삽입
│   ├── component.js     (120줄) — renderApp + trace 삽입
│   └── vdom.js          (422줄) — diff/patch + 이벤트 위임
├── test/
│   ├── devtools-panel.js (663줄) — DevTools UI + 시나리오 실행
│   └── scenarios.js      (322줄) — 5개 시나리오 정의
├── components/
│   └── PostCard.js       — TTL 타이머 (window.__dtPauseTimers 체크)
└── services/
    └── api.js            — Fetch 래퍼
server/
└── index.js              (170줄) — Express API + 서버사이드 TTL 관리
```

### 기존 메커니즘 분석

**tracer.js:**
- `trace(type, detail)` → `traceEnabled`이면 기록, 아니면 무시
- `traceHistory` 배열 (최대 200개, 원형 버퍼)
- `traceListeners` Set으로 실시간 구독
- **문제: 레벨/필터링 시스템 없음 → 모든 trace가 동일 우선순위**

**scenarios.js — 타이머 제어:**
- `window.__dtPauseTimers` 플래그 존재
- PostCard.js의 setInterval 내에서 `if (window.__dtPauseTimers) return;`
- devtools-panel.js에서 TTL 시나리오가 아니면 `__dtPauseTimers = true` 설정
- **문제: 클라이언트만 정지, 서버 TTL은 계속 감소 → 불일치**

**scenarios.js — Setup:**
- Like 시나리오: 기존 피드에 게시글이 있다고 가정, 없으면 실패
- TTL 시나리오: 기존 게시글의 TTL을 관찰, 수동 생성 필요
- **문제: 사전 게시글 생성이 자동화되어 있지 않음**

**devtools-panel.js — 타이밍:**
- 300ms 간격으로 트레이스 그룹을 순차 렌더링 (애니메이션)
- `await scenario.run()` 후 트레이스 수집 → 그룹핑 → 렌더링
- **문제: 렌더링 중 서버 TTL이 계속 감소하여 글이 먼저 사라짐**

---

## 전체 개선 아키텍처 요약

```
┌─────────────────────────────────────────────────────────┐
│                    개선 아키텍처                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. TraceFilter (레벨링)      → tracer.js 확장          │
│     ├─ CORE / DETAIL / DEBUG 3단계 레벨                 │
│     └─ DevTools UI에 레벨 토글 추가                      │
│                                                         │
│  2. TimeController (시간 제어) → time-controller.js 신규 │
│     ├─ 클라이언트: window.__dtPauseTimers               │
│     ├─ 서버: POST /api/__test/pause-timers 엔드포인트   │
│     └─ 시나리오 실행 전후 자동 적용                      │
│                                                         │
│  3. ScenarioSetup (자동화)     → scenario-setup.js 신규  │
│     ├─ silentCreatePost(): 트레이싱 OFF 상태로 글 생성  │
│     ├─ TTL 시나리오: 글 생성 완료 → 트레이싱 ON → 관찰  │
│     └─ 좋아요 시나리오: 글 생성 완료 → 트레이싱 ON      │
│                                                         │
│  4. TraceSyncController (동기화) → devtools-panel.js 수정│
│     ├─ 트레이스 렌더링 중 서버 타이머 일시정지           │
│     ├─ 렌더링 완료 후 타이머 재개                       │
│     └─ 또는 글 유지시간 동적 연장 (TTL += 표시시간)      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 요구사항 1: 트레이싱 노이즈 필터링 및 가시성 확보

### 문제
현재 `trace()` 함수는 `traceEnabled` 여부만 체크하고 모든 타입을 동등하게 기록한다.
ACTION, HOOK, STATE, EFFECT, VDOM, DIFF, PATCH, RENDER, UPDATE, MEMO 총 10가지 타입이
전부 표시되어 핵심 상태 변경점을 빠르게 파악하기 어렵다.

### 해결 방안

**3단계 트레이스 레벨 시스템 도입:**

| 레벨 | 표시 타입 | 용도 |
|------|-----------|------|
| `CORE` | ACTION, STATE, RENDER | 핵심 상태 변경만 (발표용) |
| `DETAIL` | + HOOK, EFFECT, MEMO | 훅 동작 포함 (학습용) |
| `DEBUG` | + VDOM, DIFF, PATCH, UPDATE | 전체 (디버깅용) |

**수정 대상 파일:**

#### `src/framework/tracer.js` 확장
```javascript
// 레벨 정의
const TRACE_LEVELS = {
  CORE: 0,    // 핵심만
  DETAIL: 1,  // 훅 포함
  DEBUG: 2,   // 전체
};

// 각 타입의 레벨 매핑
const TYPE_LEVEL = {
  ACTION: TRACE_LEVELS.CORE,
  STATE:  TRACE_LEVELS.CORE,
  RENDER: TRACE_LEVELS.CORE,
  HOOK:   TRACE_LEVELS.DETAIL,
  EFFECT: TRACE_LEVELS.DETAIL,
  MEMO:   TRACE_LEVELS.DETAIL,
  UPDATE: TRACE_LEVELS.DEBUG,
  VDOM:   TRACE_LEVELS.DEBUG,
  DIFF:   TRACE_LEVELS.DEBUG,
  PATCH:  TRACE_LEVELS.DEBUG,
};

let currentTraceLevel = TRACE_LEVELS.DETAIL; // 기본값

export function setTraceLevel(level) {
  currentTraceLevel = level;
}

// 기존 trace() 수정
export function trace(type, detail) {
  if (!traceEnabled) return;
  if (TYPE_LEVEL[type] > currentTraceLevel) return; // ★ 레벨 필터링

  const entry = { id: traceSeq++, type, detail, timestamp: performance.now() };
  traceHistory.push(entry);
  if (traceHistory.length > 200) traceHistory.shift();
  traceListeners.forEach(fn => fn(entry, [...traceHistory]));
  return entry;
}
```

#### `src/test/devtools-panel.js` — UI에 레벨 토글 추가
```
헤더 영역에 3-버튼 토글 추가:
┌────────────────────────────────────┐
│ ⚡ Flicker DevTools                │
│ 레벨: [CORE] [DETAIL] [DEBUG]     │  ← 클릭으로 전환
│ ...                                │
└────────────────────────────────────┘
```

- 선택된 레벨 버튼에 active 스타일 적용
- 레벨 변경 시 `setTraceLevel()` 호출
- 이미 수집된 로그도 현재 레벨에 맞게 필터링 표시

### 로직 흐름
```
사용자가 레벨 버튼 클릭
  → setTraceLevel(CORE)
  → trace() 내부에서 TYPE_LEVEL[type] > currentTraceLevel이면 무시
  → UI 리스너에게도 레벨 정보 전달
  → 기존 표시된 항목 중 레벨 초과 항목 CSS display:none 처리
```

---

## 요구사항 2: 시나리오별 시스템 시간(TTL/Timer) 제어

### 문제
- 클라이언트 측 `window.__dtPauseTimers`는 이미 있지만, PostCard의 setInterval만 제어
- **서버의 1초 setInterval은 계속 TTL을 감소**시키므로 클라이언트-서버 불일치 발생
- '로그인' 및 'TTL 검증' 시나리오를 제외한 나머지에서 시간 정지 필요

### 해결 방안

**클라이언트 + 서버 양쪽 시간 제어 동기화:**

#### `server/index.js` — 테스트용 타이머 제어 엔드포인트 추가
```javascript
let serverTimersPaused = false;

// 테스트 전용 엔드포인트
app.post('/api/__test/pause-timers', (req, res) => {
  serverTimersPaused = true;
  res.json({ ok: true, paused: true });
});

app.post('/api/__test/resume-timers', (req, res) => {
  // 정지 기간 동안의 경과시간을 무시하기 위해 lastSync 갱신
  const now = Date.now();
  for (const [id, post] of livePosts.entries()) {
    post.lastSync = now;
  }
  serverTimersPaused = false;
  res.json({ ok: true, paused: false });
});

// 기존 setInterval 수정
setInterval(() => {
  if (serverTimersPaused) return; // ★ 정지 상태면 건너뜀
  // ... 기존 TTL 감소 로직
}, 1000);
```

#### `src/test/scenario-setup.js` — TimeController 유틸리티 (신규)
```javascript
export const TimeController = {
  async pause() {
    window.__dtPauseTimers = true;
    await fetch('/api/__test/pause-timers', { method: 'POST' });
  },

  async resume() {
    window.__dtPauseTimers = false;
    await fetch('/api/__test/resume-timers', { method: 'POST' });
  },

  shouldPause(scenarioId) {
    // 로그인, TTL 시나리오는 시간 정지 안 함
    return !['login', 'ttl'].includes(scenarioId);
  }
};
```

#### `src/test/devtools-panel.js` — executeScenario 수정
```javascript
async function executeScenario(scenario) {
  // 기존: const shouldPauseTimers = scenario.id !== 'ttl';
  // 개선: 로그인도 제외
  if (TimeController.shouldPause(scenario.id)) {
    await TimeController.pause();
  }

  try {
    await scenario.run();
  } finally {
    if (TimeController.shouldPause(scenario.id)) {
      await TimeController.resume();
    }
  }
}
```

### 로직 흐름
```
시나리오 실행 시작
  → TimeController.shouldPause('like') === true
  → TimeController.pause()
     ├─ window.__dtPauseTimers = true  (클라이언트 타이머 정지)
     └─ POST /api/__test/pause-timers  (서버 타이머 정지)
  → scenario.run() 실행 (TTL 감소 없이 안전하게 테스트)
  → TimeController.resume()
     ├─ window.__dtPauseTimers = false
     └─ POST /api/__test/resume-timers (lastSync 갱신 후 재개)
```

---

## 요구사항 3: TTL 시나리오의 사전 작업(Setup) 자동화 및 은닉

### 문제
- TTL 만료를 테스트하려면 게시글이 필요하지만 수동으로 작성해야 함
- 글 작성 중 이미 타이머가 동작하여 정확한 TTL 측정 불가
- 글 생성 과정이 트레이싱에 섞여 노이즈가 됨

### 해결 방안

**Silent Setup 패턴 — 트레이싱 OFF 상태에서 백그라운드 글 생성:**

#### `src/test/scenario-setup.js` — silentCreatePost (신규)
```javascript
import { setTraceEnabled } from '../framework/tracer.js';

export async function silentCreatePost(username, text = '테스트 게시글') {
  // 1. 트레이싱 OFF (이미 꺼져있어도 안전)
  const wasEnabled = traceEnabled;
  setTraceEnabled(false);

  // 2. 서버 타이머 정지 (생성 중 TTL 감소 방지)
  await TimeController.pause();

  // 3. API로 직접 게시글 생성 (UI를 거치지 않음)
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, text }),
  });
  const data = await res.json();

  // 4. 서버 타이머 재개 (TTL 시나리오에서는 여기서부터 시작)
  await TimeController.resume();

  // 5. 트레이싱 상태 복원 (아직 ON하지 않음 — 호출자가 제어)
  setTraceEnabled(wasEnabled);

  return data;
}
```

#### `src/test/scenarios.js` — TTL 시나리오 수정
```javascript
{
  id: 'ttl',
  icon: '⏱️',
  title: 'TTL 자동 감소',

  // ★ Setup 단계 추가
  async setup() {
    // Silent: 트레이싱 없이 게시글 생성
    const data = await silentCreatePost(getUsername(), 'TTL 테스트 게시글');
    this._targetPostId = data.livePosts?.[0]?.id;
    // 이 시점에서 TTL=10, 서버 타이머 재개됨
  },

  async run() {
    // 트레이싱은 이 시점부터 시작됨
    // 이미 존재하는 게시글의 TTL 감소를 관찰
    trace('ACTION', {
      action: 'ttl-observe',
      message: `⏱️ TTL 타이머 관찰 시작 — 게시물 #${this._targetPostId}`,
    });

    // 피드 새로고침하여 생성된 글 표시
    await navigateToFeed();

    // TTL 감소 관찰 (3.5초)
    await wait(3500);
  },

  // Teardown은 별도로 필요 없음 (글은 자연 만료)
}
```

### 로직 흐름
```
[DevTools] 시나리오 실행 버튼 클릭
  │
  ├─ [Silent Setup Phase] ← 트레이싱 기록 안 됨
  │   ├─ setTraceEnabled(false)
  │   ├─ TimeController.pause()
  │   ├─ POST /api/posts → 게시글 생성 (TTL=10)
  │   └─ TimeController.resume() → 이 시점부터 서버 TTL 감소 시작
  │
  ├─ [Trace Phase] ← 여기서부터 트레이싱 기록
  │   ├─ setTraceEnabled(true)
  │   ├─ addTraceListener(collector)
  │   ├─ scenario.run() 시작
  │   │   ├─ [ACTION] TTL 관찰 시작
  │   │   ├─ [EFFECT] useEffect 타이머 등록
  │   │   ├─ [HOOK] useState (ttl: 10 → 9)
  │   │   ├─ [STATE] → [VDOM] → [DIFF] → [PATCH] → [RENDER]
  │   │   └─ ... 반복 (9→8→7→...)
  │   └─ removeTraceListener()
  │
  └─ [Display Phase]
      └─ 수집된 트레이스를 순차 렌더링
```

---

## 요구사항 4: '좋아요' 시나리오 사전 작업 자동화

### 문제
- 좋아요를 테스트하려면 대상 게시글이 필요하지만 수동 생성
- 게시글 생성 과정이 트레이싱에 포함되어 본래 목적(좋아요 상태변경)이 묻힘

### 해결 방안

**요구사항 3과 동일한 Silent Setup 패턴 적용:**

#### `src/test/scenarios.js` — 좋아요 시나리오 수정
```javascript
{
  id: 'like',
  icon: '👍',
  title: '좋아요 클릭',

  // ★ Setup 단계 추가
  async setup() {
    // Silent: 트레이싱 없이 게시글 생성
    await silentCreatePost(getUsername(), '좋아요 테스트 게시글');
    // 피드에 글이 준비된 상태
  },

  async run() {
    // 트레이싱은 이 시점부터 시작
    // 피드로 이동하여 좋아요 버튼 찾기
    await navigateToFeed();
    await wait(500); // 렌더링 대기

    const likeBtn = document.querySelector('.post-card__like-btn');
    if (!likeBtn) throw new Error('좋아요 버튼을 찾을 수 없습니다');

    trace('ACTION', {
      action: 'like',
      message: '👍 사용자가 좋아요를 눌렀습니다',
    });

    likeBtn.click();
    await wait(1800);
  },
}
```

### 라이프사이클 분리
```
[Silent Setup]           [Trace Recording]
──────────────           ─────────────────
 글 생성 (API)    →→→    좋아요 클릭 시점부터 기록
 트레이싱 OFF             트레이싱 ON
 타이머 정지              타이머 정지 (like는 TTL 불필요)
```

---

## 요구사항 5: 글 작성 시나리오 UI↔트레이싱 타이밍 동기화

### 문제
- `scenario.run()` 실행 → 글 작성 → 서버 저장 → 피드 이동
- 이후 트레이스 렌더링이 300ms × N그룹만큼 소요
- 렌더링 중에 서버 TTL이 계속 감소 → 글이 트레이스 표시 전에 사라짐

### 해결 방안

**2단계 접근: 타이머 정지 + 동적 TTL 연장**

#### 방안 A: 트레이스 렌더링 중 타이머 정지 (권장)
```javascript
// devtools-panel.js — executeScenario 수정

async function executeScenario(scenario) {
  // Phase 1: Setup (Silent)
  if (scenario.setup) {
    await scenario.setup();
  }

  // Phase 2: Run (Trace Collection)
  if (TimeController.shouldPause(scenario.id)) {
    await TimeController.pause();
  }
  setTraceEnabled(true);
  const collected = [];
  const listener = (entry) => collected.push(entry);
  addTraceListener(listener);

  try {
    await scenario.run();
  } finally {
    setTraceEnabled(false);
    removeTraceListener(listener);
  }

  // Phase 3: Display (★ 타이머 여전히 정지 상태)
  // → 트레이스 렌더링이 완료될 때까지 글이 사라지지 않음
  const groups = groupByCycle(collected);
  for (const group of groups) {
    renderTraceGroup(group);
    await wait(300); // 순차 애니메이션
  }

  // Phase 4: Verify
  const results = scenario.verify();
  renderVerifyResults(results);

  // Phase 5: Cleanup — 이제야 타이머 재개
  if (TimeController.shouldPause(scenario.id)) {
    await TimeController.resume();
  }
}
```

**핵심:** Phase 2(실행) → Phase 3(표시) → Phase 5(타이머 재개)로 이어져서,
트레이스가 모두 표시되고 검증까지 끝난 후에야 TTL 감소가 재개된다.

#### 방안 B: 동적 TTL 연장 (보조)
```javascript
// 트레이스 렌더링 예상 시간만큼 TTL 연장
const displayDuration = groups.length * 300 + 1000; // 여유분 1초
const extensionSeconds = Math.ceil(displayDuration / 1000);

// 서버에 TTL 연장 요청
await fetch('/api/__test/extend-ttl', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postId: targetPostId, extraSeconds: extensionSeconds }),
});
```

`server/index.js`에 추가:
```javascript
app.post('/api/__test/extend-ttl', (req, res) => {
  const { postId, extraSeconds } = req.body;
  const post = livePosts.get(postId);
  if (post) {
    post.ttl += extraSeconds;
    res.json({ ok: true, newTtl: post.ttl });
  } else {
    res.status(404).json({ ok: false });
  }
});
```

### 권장: 방안 A를 기본으로, 방안 B는 선택적 보조

방안 A만으로 충분히 해결되지만, '글 작성' 시나리오는 작성 후 피드에서 글을 볼 수 있어야 하므로
타이머 재개 후에도 글이 일정 시간 유지되도록 방안 B를 보조적으로 사용할 수 있다.

### 로직 흐름 (글 작성 시나리오)
```
[Silent Setup]
  └─ 없음 (글 작성 자체가 시나리오)

[Run Phase] 타이머 정지 상태
  ├─ TimeController.pause()
  ├─ 텍스트 입력 → 제출 → API 호출 → 피드 이동
  ├─ 트레이스 수집: ACTION → HOOK → STATE → VDOM → DIFF → PATCH → RENDER
  └─ scenario.run() 완료

[Display Phase] ★ 타이머 여전히 정지 ★
  ├─ 300ms 간격 순차 렌더링
  ├─ 사용자가 트레이스를 충분히 확인
  └─ 피드에 새 글이 계속 표시됨

[Verify Phase]
  └─ 검증 결과 표시

[Cleanup Phase]
  ├─ TimeController.resume() → 이제 TTL 감소 시작
  └─ 글은 이후 자연 만료 (사용자가 이미 확인 완료)
```

---

## 핵심 유틸리티 설계: `src/test/scenario-setup.js` (신규)

```javascript
import { setTraceEnabled } from '../framework/tracer.js';

/**
 * TimeController — 클라이언트/서버 타이머 동기 제어
 */
export const TimeController = {
  async pause() {
    window.__dtPauseTimers = true;
    try {
      await fetch('/api/__test/pause-timers', { method: 'POST' });
    } catch (e) {
      console.warn('[TimeController] 서버 타이머 정지 실패:', e);
    }
  },

  async resume() {
    try {
      await fetch('/api/__test/resume-timers', { method: 'POST' });
    } catch (e) {
      console.warn('[TimeController] 서버 타이머 재개 실패:', e);
    }
    window.__dtPauseTimers = false;
  },

  shouldPause(scenarioId) {
    return !['login', 'ttl'].includes(scenarioId);
  }
};

/**
 * silentCreatePost — 트레이싱 없이 게시글 백그라운드 생성
 * @param {string} username
 * @param {string} text
 * @returns {Promise<Object>} 생성 결과 (livePosts, myPosts)
 */
export async function silentCreatePost(username, text = '테스트 게시글') {
  setTraceEnabled(false);
  await TimeController.pause();

  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, text }),
  });
  const data = await res.json();

  await TimeController.resume();
  return data;
}

/**
 * silentLogin — 트레이싱 없이 로그인 수행
 * @param {string} username
 * @returns {Promise<Object>} 로그인 결과
 */
export async function silentLogin(username) {
  setTraceEnabled(false);

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();

  if (data.ok) {
    localStorage.setItem('username', username);
  }
  return data;
}

/**
 * getUsername — 현재 로그인된 사용자명 가져오기
 * 없으면 silentLogin 수행
 */
export async function ensureLoggedIn(defaultUser = 'testuser') {
  let username = localStorage.getItem('username');
  if (!username) {
    await silentLogin(defaultUser);
    username = defaultUser;
  }
  return username;
}
```

---

## 수정 대상 파일 요약

| 파일 | 변경 유형 | 요구사항 |
|------|-----------|----------|
| `src/framework/tracer.js` | 수정 | #1 레벨링 시스템 |
| `src/test/scenario-setup.js` | **신규** | #2,3,4 TimeController + silentCreatePost |
| `src/test/scenarios.js` | 수정 | #3,4 setup() 추가 |
| `src/test/devtools-panel.js` | 수정 | #1 레벨 UI, #2,5 실행 흐름 |
| `server/index.js` | 수정 | #2 타이머 제어 엔드포인트, #5 TTL 연장 |
| `public/styles/devtools.css` | 수정 | #1 레벨 토글 스타일 |

---

## 구현 순서

### Phase A: 기반 인프라
1. `src/framework/tracer.js` — 레벨 시스템 추가 (요구사항 1)
2. `server/index.js` — 테스트 엔드포인트 추가 (요구사항 2)
3. `src/test/scenario-setup.js` — 유틸리티 신규 생성 (요구사항 2,3,4)

### Phase B: 시나리오 개선
4. `src/test/scenarios.js` — TTL 시나리오 setup() 추가 (요구사항 3)
5. `src/test/scenarios.js` — 좋아요 시나리오 setup() 추가 (요구사항 4)
6. `src/test/scenarios.js` — 글 작성 시나리오 타이밍 대응 (요구사항 5)

### Phase C: DevTools UI 통합
7. `src/test/devtools-panel.js` — 레벨 토글 UI 추가 (요구사항 1)
8. `src/test/devtools-panel.js` — executeScenario 흐름 리팩토링 (요구사항 2,5)
9. `public/styles/devtools.css` — 레벨 토글 스타일 (요구사항 1)

### Phase D: 통합 테스트
10. 전체 시나리오 실행 확인 및 엣지 케이스 점검
