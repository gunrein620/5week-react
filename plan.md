# Flicker DevTools - 시나리오 트레이스 구현 계획

## 1. 컨셉

PASS/FAIL 테스트 러너를 버린다.
대신 **시나리오를 선택하면 프레임워크 내부 동작을 단계별로 트레이스**하는 DevTools 패널을 만든다.

### 왜?

| | 기존 PASS/FAIL | 시나리오 트레이스 |
|---|---|---|
| 시연 시간 | 0.3초 (순식간에 끝남) | 시나리오당 5~10초 |
| 가독성 | 초록 체크 31줄 | 단계별 흐름이 읽힘 |
| 설명력 | "다 통과했습니다" | "이 과정을 거쳐서 동작합니다" |
| 이해도 증명 | 안 드러남 | useState→VDOM→Diff→Patch 전체 흐름 |

---

## 2. 시나리오 목록

### 핵심 시나리오 (발표용)

| # | 시나리오 | 보여주는 핵심 로직 | 트레이스 단계 |
|---|---------|-------------------|--------------|
| 1 | 👍 좋아요 클릭 | **useState** 상태변경 → 리렌더 전체 흐름 | ACTION→HOOK→STATE→VDOM→DIFF→PATCH→RENDER |
| 2 | ⏱️ TTL 자동 감소 | **useEffect** 타이머 등록 + cleanup | ACTION→EFFECT→HOOK→STATE→VDOM→DIFF→PATCH→RENDER |
| 3 | 🔑 로그인 | **useState** + **useEffect** 조합 + 라우팅 | ACTION→HOOK→STATE→EFFECT→VDOM→DIFF→PATCH→RENDER |
| 4 | ✏️ 글 작성 | 입력 → 검증 → 상태 반영 | ACTION→HOOK→STATE→VDOM→DIFF→PATCH→RENDER |
| 5 | 🧠 메모이제이션 | **useMemo** 캐싱 vs 재계산 *(추후 추가)* | ACTION→MEMO→HOOK→STATE→VDOM→DIFF→PATCH→RENDER |

### 시나리오 5번 (useMemo) 상세

useMemo는 추후 구현 예정이므로, DevTools에는 **자리만 만들어두고 비활성 상태**로 표시:

```
┌─────────────────────────────────┐
│  🧠 메모이제이션 (useMemo)      │
│  ─────────────────────────────  │
│                                 │
│  ⚠️ useMemo는 다음 버전에서     │
│     구현 예정입니다              │
│                                 │
│  구현 시 트레이스할 내용:       │
│  ├─ deps 비교 → 캐시 히트/미스  │
│  ├─ factory 함수 실행 여부      │
│  └─ 불필요한 재계산 스킵 확인   │
│                                 │
└─────────────────────────────────┘
```

useMemo 구현 후 바로 연결되도록 tracer.js에 `MEMO` 타입을 미리 정의해둔다.

---

## 3. 트레이스 출력 상세

### 시나리오 1: 👍 좋아요 클릭

```
[ACTION] 👍 사용자가 게시물 #p001 에 좋아요를 눌렀습니다
───────────────────────────────────────────

[HOOK]   useState 호출
         ├─ hookIndex : 0
         ├─ slot key  : PostCard#1:state:0
         ├─ 이전 state : { likes: 2, ttl: 10 }
         └─ 새 state   : { likes: 3, ttl: 15 }

[STATE]  상태 변경 감지 → scheduleRender()
         ├─ 변경된 키 : likes (2 → 3)
         └─ 변경된 키 : ttl   (10 → 15)

[VDOM]   Virtual DOM 생성 완료
         └─ 변경 노드 : <span class="likes">3</span>
                        <span class="ttl">15s</span>

[DIFF]   이전 VDOM ↔ 새 VDOM 비교
         ├─ TEXT  : likes  "2" → "3"
         ├─ TEXT  : ttl    "10s" → "15s"
         └─ SKIP  : 나머지 노드 (변경 없음)

[PATCH]  실제 DOM 업데이트
         ├─ ✅ .likes textContent = "3"
         └─ ✅ .ttl   textContent = "15s"

[RENDER] 완료 (2개 노드 변경 / 12ms)

────────── 검증 ──────────
✅ likes 값이 3으로 증가했는가
✅ TTL이 15로 리셋되었는가
✅ DOM에 정확히 반영되었는가
✅ 변경 없는 노드는 스킵했는가
```

### 시나리오 2: ⏱️ TTL 자동 감소

```
[ACTION] ⏱️ TTL 타이머 시작 — 게시물 #p001
───────────────────────────────────────────

[EFFECT] useEffect 등록
         ├─ hookIndex : 1
         ├─ slot key  : PostCard#1:effect:1
         ├─ deps      : [postId]
         └─ 동작      : setInterval(1초마다 ttl--)

[HOOK]   useState 호출 (타이머 콜백)
         ├─ hookIndex : 0
         ├─ 이전 state : { ttl: 15 }
         └─ 새 state   : { ttl: 14 }

[STATE]  상태 변경 감지 → scheduleRender()
         └─ 변경된 키 : ttl (15 → 14)

[VDOM]   Virtual DOM 생성 완료
         └─ 변경 노드 : <span class="ttl">14s</span>

[DIFF]   이전 VDOM ↔ 새 VDOM 비교
         ├─ TEXT  : ttl "15s" → "14s"
         └─ SKIP  : 나머지 노드

[PATCH]  실제 DOM 업데이트
         └─ ✅ .ttl textContent = "14s"

[RENDER] 완료 (1개 노드 변경 / 3ms)

         ... (14 → 13 → 12 → ... → 1 → 0)

[EFFECT] cleanup 실행
         ├─ slot key  : PostCard#1:effect:1
         ├─ 동작      : clearInterval(timerId)
         └─ 이유      : ttl === 0, 게시물 만료

────────── 검증 ──────────
✅ useEffect가 마운트 시 1회 등록되었는가
✅ 1초마다 ttl이 감소하는가
✅ ttl=0 도달 시 cleanup(clearInterval)이 실행되는가
✅ cleanup 후 타이머가 멈추는가
```

### 시나리오 3: 🔑 로그인

```
[ACTION] 🔑 사용자가 로그인 버튼을 클릭했습니다
───────────────────────────────────────────

[HOOK]   useState 호출 (입력값 읽기)
         ├─ slot key  : Login#1:state:0
         └─ 현재 state : { username: "kimyong" }

[STATE]  API 호출 시작
         └─ POST /api/login { username: "kimyong" }

[HOOK]   useState 호출 (로그인 결과 저장)
         ├─ slot key  : App#1:state:0
         ├─ 이전 state : { user: null }
         └─ 새 state   : { user: "kimyong" }

[EFFECT] useEffect 실행 (로그인 후처리)
         ├─ slot key  : App#1:effect:0
         ├─ deps      : [user]  (null → "kimyong")
         └─ 동작      : localStorage.setItem + navigate('#/feed')

[VDOM]   Virtual DOM 생성 완료
         └─ 루트 변경 : Login 컴포넌트 → Feed 컴포넌트

[DIFF]   이전 VDOM ↔ 새 VDOM 비교
         └─ REPLACE : 전체 트리 교체 (Login → Feed)

[PATCH]  실제 DOM 업데이트
         └─ ✅ 전체 DOM 교체 (replaceChild)

[RENDER] 완료 (전체 교체 / 45ms)

────────── 검증 ──────────
✅ 로그인 후 user 상태가 저장되었는가
✅ useEffect가 deps 변경을 감지했는가
✅ 라우트가 #/feed로 변경되었는가
✅ Feed 컴포넌트가 렌더링되었는가
```

### 시나리오 4: ✏️ 글 작성

```
[ACTION] ✏️ 사용자가 글 작성 버튼을 클릭했습니다
───────────────────────────────────────────

[HOOK]   useState 호출 (입력 내용)
         ├─ slot key  : CreatePost#1:state:0
         └─ 현재 state : { content: "오늘 날씨 좋다" }

[STATE]  입력 검증
         ├─ content.length : 8
         └─ 결과 : ✅ 통과 (1자 이상)

[STATE]  API 호출
         └─ POST /api/posts { content: "오늘 날씨 좋다" }

[HOOK]   useState 호출 (입력 초기화)
         ├─ slot key  : CreatePost#1:state:0
         ├─ 이전 state : { content: "오늘 날씨 좋다" }
         └─ 새 state   : { content: "" }

[EFFECT] useEffect 실행 (작성 후 피드 이동)
         ├─ deps      : [submitted]  (false → true)
         └─ 동작      : navigate('#/feed')

[VDOM]   Virtual DOM 생성 완료
         └─ 루트 변경 : CreatePost → Feed (새 글 포함)

[DIFF]   이전 VDOM ↔ 새 VDOM 비교
         └─ REPLACE : 전체 트리 교체

[PATCH]  실제 DOM 업데이트
         └─ ✅ 전체 DOM 교체

[RENDER] 완료

────────── 검증 ──────────
✅ 빈 내용이면 작성이 거부되는가 (엣지)
✅ 작성 후 입력 필드가 초기화되는가
✅ 피드로 이동하는가
✅ 새 글이 피드 목록에 표시되는가
```

### 시나리오 5: 🧠 메모이제이션 (useMemo) — 추후 구현

```
[ACTION] 🧠 피드 정렬 변경 (최신순 → 좋아요순)
───────────────────────────────────────────

[MEMO]   useMemo 호출
         ├─ slot key  : Feed#1:memo:0
         ├─ deps      : [sortType]  ("latest" → "popular")
         ├─ 캐시      : ❌ MISS (deps 변경)
         └─ factory   : posts.sort((a,b) => b.likes - a.likes)

[HOOK]   useState — 정렬된 목록 반영
         ├─ 이전 state : [p003, p001, p002]  (시간순)
         └─ 새 state   : [p001, p002, p003]  (좋아요순)

         ... (VDOM → DIFF → PATCH → RENDER)

[ACTION] 🧠 다른 상태 변경 (좋아요 클릭)
───────────────────────────────────────────

[MEMO]   useMemo 호출
         ├─ slot key  : Feed#1:memo:0
         ├─ deps      : [sortType]  ("popular" → "popular")
         ├─ 캐시      : ✅ HIT (deps 동일 — 재계산 스킵!)
         └─ factory   : 실행 안 함 (캐시된 결과 사용)

         ... (나머지 흐름은 동일)

────────── 검증 ──────────
✅ deps 변경 시 factory가 재실행되는가
✅ deps 동일 시 캐시된 값을 반환하는가 (재계산 스킵)
✅ 여러 useMemo가 독립적으로 동작하는가
```

---

## 4. UI 레이아웃

### 메인 화면

```
┌──────────────────────────────┬───────────────────────────────────────┐
│                              │  ⚡ Flicker DevTools            [✕]  │
│                              │                                      │
│                              │  ▼ 시나리오 선택                     │
│     Flicker 앱 화면          │  ┌────────────────────────────────┐  │
│     (좌측, 실제 동작)         │  │ 👍 좋아요 클릭                 │  │
│                              │  │ ⏱️ TTL 자동 감소               │  │
│                              │  │ 🔑 로그인                      │  │
│                              │  │ ✏️ 글 작성                     │  │
│                              │  │ 🧠 메모이제이션 ⚠️ 준비중      │  │
│                              │  └────────────────────────────────┘  │
│                              │                                      │
│                              │  [▶ 실행]  [🔄 초기화]               │
│                              │                                      │
└──────────────────────────────┴───────────────────────────────────────┘
```

### 시나리오 실행 중

```
┌──────────────────────────────┬───────────────────────────────────────┐
│                              │  ⚡ Flicker DevTools            [✕]  │
│                              │  ◀ 뒤로   👍 좋아요 클릭             │
│                              │  ─────────────────────────────────── │
│     Flicker 앱 화면          │                                      │
│     (좌측, 실제로             │  [ACTION] 👍 #p001 좋아요           │
│      좋아요가 눌림)           │  ────────────────────                │
│                              │                                      │
│                              │  [HOOK]  useState 호출               │
│                              │          ├─ likes: 2 → 3             │
│                              │          └─ ttl: 10 → 15             │
│                              │                                      │
│                              │  [STATE] 변경 감지 → 리렌더 예약     │
│                              │                                      │
│                              │  [VDOM]  새 트리 생성                │
│                              │                                      │
│                              │  [DIFF]  2개 변경 / 나머지 스킵      │
│                              │                                      │
│                              │  [PATCH] DOM 업데이트 ✅             │
│                              │                                      │
│                              │  [RENDER] 완료 (12ms)               │
│                              │                                      │
│                              │  ────────── 검증 ──────────          │
│                              │  ✅ likes = 3                        │
│                              │  ✅ TTL = 15                         │
│                              │  ✅ DOM 반영 정확                    │
│                              │  ✅ 불필요한 노드 스킵               │
│                              │                                      │
└──────────────────────────────┴───────────────────────────────────────┘
```

### 스타일

- **배경**: `#1a1a2e` (다크 네이비)
- **폰트**: `'SF Mono', 'Fira Code', monospace` 14px
- **색상 규칙**:
  - `[ACTION]` → `#60a5fa` (파란색)
  - `[HOOK]` `[STATE]` → `#fbbf24` (노란색) — useState/setState 강조
  - `[EFFECT]` → `#f97316` (오렌지) — useEffect 강조
  - `[MEMO]` → `#a78bfa` (보라색) — useMemo 강조 (추후)
  - `[VDOM]` `[DIFF]` → `#c084fc` (연보라)
  - `[PATCH]` `[RENDER]` → `#34d399` (초록)
  - `✅` → `#34d399` / `❌` → `#f87171`
  - 트리 구조 (`├─ └─`) → `#6b7280` (회색)
- **애니메이션**: 각 `[단계]`가 0.3초 간격으로 순차 등장 (타이핑 효과)

---

## 5. 파일 구조

```
src/
  ├── framework/
  │   ├── tracer.js          ← 새로 생성
  │   ├── hooks.js           ← trace 포인트 삽입
  │   ├── component.js       ← trace 포인트 삽입
  │   └── vdom.js            ← trace 포인트 삽입
  └── test/
      ├── devtools-panel.js  ← 새로 생성 (UI + 시나리오 실행)
      ├── scenarios.js       ← 새로 생성 (5개 시나리오 정의)
      └── test-runner.js     ← 삭제 또는 보관
public/
  └── styles/
      └── devtools.css       ← 새로 생성
```

---

## 6. 구현 상세

### 6-A. tracer.js — 이벤트 버스

```js
// trace 타입 정의 (useMemo용 MEMO 미리 포함)
const TRACE_TYPES = {
  ACTION:  { color: '#60a5fa', icon: '▶' },
  HOOK:    { color: '#fbbf24', icon: '⚡' },   // useState
  STATE:   { color: '#fbbf24', icon: '📦' },   // 상태 변경
  EFFECT:  { color: '#f97316', icon: '🔄' },   // useEffect
  MEMO:    { color: '#a78bfa', icon: '🧠' },   // useMemo (추후)
  VDOM:    { color: '#c084fc', icon: '🌳' },   // VDOM 생성
  DIFF:    { color: '#c084fc', icon: '🔍' },   // diff
  PATCH:   { color: '#34d399', icon: '✏️' },   // patch
  RENDER:  { color: '#34d399', icon: '✅' },   // 렌더 완료
};

let traceEnabled = false;
let traceLog = [];
const listeners = [];

export function trace(type, data) {
  if (!traceEnabled) return;          // 꺼져있으면 성능 영향 0
  const entry = { type, data, timestamp: performance.now() };
  traceLog.push(entry);
  listeners.forEach(fn => fn(entry)); // 실시간 UI 갱신
}

export function onTrace(fn) { listeners.push(fn); }
export function enableTrace() { traceEnabled = true; }
export function disableTrace() { traceEnabled = false; }
export function clearTrace() { traceLog = []; }
export function getTraceLog() { return traceLog; }
```

### 6-B. 프레임워크 trace 포인트 삽입

**hooks.js — useState:**
```js
export function useState(initialValue) {
  const key = `${currentKey}:state:${hookIndex++}`;
  const isNew = !hookStore.has(key);
  if (isNew) {
    hookStore.set(key, typeof initialValue === 'function' ? initialValue() : initialValue);
  }
  const value = hookStore.get(key);

  const setState = (newVal) => {
    const prev = hookStore.get(key);
    const resolved = typeof newVal === 'function' ? newVal(prev) : newVal;
    if (resolved === prev) return;

    // ★ trace 삽입
    trace('HOOK', {
      hook: 'useState', key,
      prev, next: resolved
    });
    trace('STATE', {
      changed: diffObject(prev, resolved)
    });

    hookStore.set(key, resolved);
    scheduleRender();
  };

  return [value, setState];
}
```

**hooks.js — useEffect:**
```js
// flushEffects 내부, shouldRun이 true일 때:
trace('EFFECT', {
  hook: 'useEffect', key,
  deps, prevDeps,
  hasCleanup: typeof prev.cleanup === 'function'
});
```

**hooks.js — useMemo (추후 구현 시):**
```js
// useMemo 내부:
trace('MEMO', {
  hook: 'useMemo', key,
  deps, prevDeps,
  cacheHit: shallowEqual(prevDeps, deps),   // true면 HIT, false면 MISS
  result: cached ? '(캐시 사용)' : '(재계산)'
});
```

**component.js — renderApp:**
```js
trace('VDOM', { component: 'App', childCount: newVTree.children?.length });
trace('DIFF', {
  patchCount: patches.length,
  types: patches.map(p => p.type)
});
trace('PATCH', {
  applied: patches.length,
  duration: `${(performance.now() - start).toFixed(1)}ms`
});
trace('RENDER', {
  totalChanges: patches.length,
  duration: `${(performance.now() - renderStart).toFixed(1)}ms`
});
```

### 6-C. scenarios.js — 시나리오 정의

```js
export const scenarios = [
  {
    id: 'like',
    icon: '👍',
    title: '좋아요 클릭',
    description: 'useState로 likes/ttl 상태 변경 → VDOM diff → DOM 패치',
    highlights: ['useState'],        // 강조할 훅
    enabled: true,
    run: async (app, trace) => { ... },
    verify: (dom) => [
      { label: 'likes 값이 증가했는가', check: () => ... },
      { label: 'TTL이 리셋되었는가', check: () => ... },
      { label: 'DOM에 반영되었는가', check: () => ... },
      { label: '불필요한 노드 스킵', check: () => ... },
    ]
  },
  {
    id: 'ttl',
    icon: '⏱️',
    title: 'TTL 자동 감소',
    highlights: ['useEffect'],
    enabled: true,
    run: async (app, trace) => { ... },
    verify: ...
  },
  {
    id: 'login',
    icon: '🔑',
    title: '로그인',
    highlights: ['useState', 'useEffect'],
    enabled: true,
    run: async (app, trace) => { ... },
    verify: ...
  },
  {
    id: 'create-post',
    icon: '✏️',
    title: '글 작성',
    highlights: ['useState', 'useEffect'],
    enabled: true,
    run: async (app, trace) => { ... },
    verify: ...
  },
  {
    id: 'memo',
    icon: '🧠',
    title: '메모이제이션 (useMemo)',
    highlights: ['useMemo'],
    enabled: false,                    // ← 추후 구현 시 true로 변경
    disabledMessage: '다음 버전에서 구현 예정',
    plannedVerify: [
      'deps 변경 시 factory 재실행',
      'deps 동일 시 캐시 반환 (재계산 스킵)',
      '여러 useMemo 독립 동작',
    ],
    run: async (app, trace) => { ... },
    verify: ...
  },
];
```

### 6-D. devtools-panel.js — UI 컴포넌트

**기능:**
- 🧪 플로팅 버튼 → 클릭 시 우측 슬라이드 패널
- 시나리오 목록 화면 → 선택 시 실행 화면
- trace 로그를 0.3초 간격으로 순차 렌더링 (타이핑 효과)
- 각 단계별 색상 + 트리 구조 들여쓰기
- 검증 결과를 마지막에 표시
- useMemo 시나리오는 비활성 상태 + 안내 메시지

---

## 7. 구현 순서

### Phase 1: tracer 기반 (핵심)
1. `src/framework/tracer.js` 생성 — trace() + 이벤트 버스 + MEMO 타입 포함
2. `hooks.js` 수정 — useState, useEffect에 trace 삽입 + useMemo 자리 확보
3. `component.js` 수정 — renderApp에 trace 삽입
4. `vdom.js` 수정 — diff, patch에 trace 삽입

### Phase 2: 시나리오 정의
1. `src/test/scenarios.js` 생성 — 5개 시나리오 (useMemo는 enabled:false)
2. 각 시나리오의 run() 함수 구현
3. 각 시나리오의 verify() 함수 구현

### Phase 3: DevTools UI
1. `public/styles/devtools.css` 생성 — 다크 터미널 스타일
2. `src/test/devtools-panel.js` 생성 — 패널 UI + 시나리오 실행 + 트레이스 렌더링
3. 앱에 플로팅 버튼 연결

### Phase 4: 정리
1. 기존 test-runner.js, hook-tests.js, integration-tests.js 보관/삭제
2. test.html 업데이트 또는 제거
3. 전체 시나리오 실행 확인

---

## 8. useMemo 추후 연결 가이드

useMemo를 hooks.js에 구현한 후:

1. **hooks.js**에 `useMemo` 함수 추가
   ```js
   export function useMemo(factory, deps) {
     const key = `${currentKey}:memo:${hookIndex++}`;
     const prev = hookStore.get(key);
     const prevDeps = prev?.deps;

     if (prev && shallowEqual(prevDeps, deps)) {
       trace('MEMO', { hook: 'useMemo', key, cacheHit: true });
       return prev.value;
     }

     const value = factory();
     trace('MEMO', { hook: 'useMemo', key, cacheHit: false, deps });
     hookStore.set(key, { value, deps: [...deps] });
     return value;
   }
   ```

2. **scenarios.js**에서 `enabled: true`로 변경

3. 끝. tracer와 UI는 이미 MEMO 타입을 지원하므로 추가 작업 없음.

---

## 9. 발표 데모 시나리오

### 추천 순서 (3분)

1. 앱에서 `🧪` 버튼 클릭 → DevTools 패널 열림
   > "저희가 만든 프레임워크의 내부 동작을 추적하는 DevTools입니다"

2. **👍 좋아요 클릭** 시나리오 선택 → 실행
   > "좋아요를 누르면 useState가 상태를 변경하고,
   >  Virtual DOM을 새로 만들고, 이전 트리와 비교해서
   >  바뀐 2개 노드만 실제 DOM에 패치합니다"

3. **⏱️ TTL 자동 감소** 시나리오 선택 → 실행
   > "useEffect로 타이머를 등록하고, TTL이 0이 되면
   >  cleanup 함수가 clearInterval을 호출합니다.
   >  React의 useEffect cleanup과 동일한 원리입니다"

4. **🧠 메모이제이션** 시나리오 (비활성)
   > "useMemo는 다음 버전에서 구현 예정이고,
   >  DevTools에는 이미 자리를 잡아두었습니다"

5. 마무리
   > "이 DevTools를 통해 React가 내부에서 하는 일을
   >  저희가 직접 구현하고, 추적하고, 검증할 수 있습니다"
