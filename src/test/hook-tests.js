// ── hook-tests.js ──────────────────────────────────────────────────────────────
// hooks.js 화이트박스 테스트 — hookStore / effectStore 직접 검증

import { describe, it, assert, log } from './test-runner.js';
import {
  setCurrentComponent,
  resetHookIndex,
  setRenderFn,
  useState,
  useEffect,
  flushEffects,
  __getHookStore,
  __getEffectStore,
  __getPendingEffects,
} from '../framework/hooks.js';
import * as hooks from '../framework/hooks.js';

function normalize(value) {
  if (value instanceof Set) return Array.from(value.values());
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, normalize(entryValue)]));
  }
  return value;
}

function snapshotStore(map, prefix) {
  return Array.from(map.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({ key, value: normalize(value) }));
}

// ── Suite 1: useState ──────────────────────────────────────────────────────────
describe('useState', {
  description: 'state 슬롯이 컴포넌트 key와 hookIndex로 배정되고, 값이 바뀔 때만 리렌더가 예약되는지 확인합니다.',
  notes: [
    'slot key = {componentKey}:state:{hookIndex}',
    '동일값 업데이트는 scheduleRender를 생략해야 함',
  ],
}, () => {

  it('초기값 저장 원리', {
    goal: '첫 useState 호출이 어떤 슬롯을 만들고, 반환값과 hookStore 값이 왜 같은지 보여줍니다.',
    checkpoints: ['current component key', 'hookIndex 0', '초기 state 슬롯 생성'],
  }, () => {
    const slotKey = 'T#1-init:state:0';

    setCurrentComponent('T#1-init');
    const [val] = useState(42);
    const store = __getHookStore();

    assert.equal(val, 42);
    assert.equal(store.get(slotKey), 42);

    log('동작 흐름', [
      '1. setCurrentComponent("T#1-init")가 현재 컴포넌트와 hookIndex=0을 준비한다.',
      '2. useState(42)는 "T#1-init:state:0" 슬롯이 비어 있으므로 42를 저장한다.',
      '3. 반환값과 hookStore 저장값이 같은지 확인하면 초기화 규칙을 볼 수 있다.',
    ].join('\n'));
    log('생성된 슬롯', { slotKey, returnedValue: val, storedValue: store.get(slotKey) });
    log('hookStore 스냅샷', snapshotStore(store, 'T#1-init'));
  });

  it('리렌더 시 상태 유지', {
    goal: '같은 component key에서 hookIndex를 다시 0으로 맞추면 기존 state 슬롯을 다시 읽는다는 점을 검증합니다.',
    checkpoints: ['setState 즉시 저장', 'resetHookIndex', '같은 슬롯 재사용'],
  }, () => {
    const slotKey = 'T#2-persist:state:0';

    setCurrentComponent('T#2-persist');
    const [, setState] = useState(42);
    setState(100);

    resetHookIndex();
    const [val2] = useState(42);
    const store = __getHookStore();

    assert.equal(val2, 100);
    assert.equal(store.get(slotKey), 100);

    log('동작 흐름', [
      '1. 첫 호출은 42를 저장한다.',
      '2. setState(100)은 hookStore의 같은 슬롯 값을 100으로 바꾼다.',
      '3. 같은 컴포넌트에서 hookIndex를 0으로 되돌린 뒤 다시 useState를 호출하면, 초기값 42 대신 저장된 100을 읽는다.',
    ].join('\n'));
    log('슬롯 재사용 결과', {
      slotKey,
      storedAfterSetState: store.get(slotKey),
      rereadValue: val2,
    });
    log('hookStore 스냅샷', snapshotStore(store, 'T#2-persist'));
  });

  it('함수 업데이터 vs 직접값', {
    goal: '직접값 업데이트와 함수형 업데이트가 모두 같은 state 슬롯을 갱신하지만, 함수형은 이전 값을 입력으로 받는다는 점을 보여줍니다.',
    checkpoints: ['직접값 저장', 'prev 기반 계산', '최종 slot 값'],
  }, () => {
    const slotKey = 'T#3-updater:state:0';

    setCurrentComponent('T#3-updater');
    const [, setState] = useState(0);
    const store = __getHookStore();

    setState(5);
    const afterDirectSet = store.get(slotKey);

    setState((prev) => prev + 1);
    const afterUpdater = store.get(slotKey);

    assert.equal(afterDirectSet, 5);
    assert.equal(afterUpdater, 6);

    log('동작 흐름', [
      '1. setState(5)는 이전 값과 상관없이 슬롯을 5로 덮어쓴다.',
      '2. setState(prev => prev + 1)은 현재 저장된 5를 prev로 받아 6을 계산한다.',
      '3. 두 방식 모두 최종적으로 같은 state 슬롯을 갱신한다.',
    ].join('\n'));
    log('업데이트 결과', {
      slotKey,
      afterDirectSet,
      afterUpdater,
    });
    log('hookStore 스냅샷', snapshotStore(store, 'T#3-updater'));
  });

  it('동일값 bailout', {
    goal: '같은 값을 다시 넣으면 hookStore는 유지되지만 scheduleRender가 호출되지 않는다는 점을 확인합니다.',
    checkpoints: ['동일값 비교', 'queueMicrotask 미예약', 'renderFn 미호출'],
  }, async () => {
    setCurrentComponent('T#4-bailout');
    const [, setState] = useState(42);

    let renderCalled = false;
    setRenderFn(() => { renderCalled = true; });

    setState(42);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.true(!renderCalled);

    log('동작 흐름', [
      '1. setState는 새 값과 현재 슬롯 값을 비교한다.',
      '2. 값이 같으면 hookStore를 다시 쓰지 않고 scheduleRender도 생략한다.',
      '3. 그래서 queueMicrotask 이후에도 renderFn이 호출되지 않는다.',
    ].join('\n'));
    log('검증 결과', {
      attemptedValue: 42,
      renderCalled,
      storeSnapshot: snapshotStore(__getHookStore(), 'T#4-bailout'),
    });

    setRenderFn(null);
  });

});

// ── Suite 2: useEffect ─────────────────────────────────────────────────────────
describe('useEffect', {
  description: 'effect는 먼저 pending queue에 쌓이고, flushEffects 시점에 deps 비교 후 실행됩니다. cleanup은 재실행 직전에 먼저 호출됩니다.',
  notes: [
    'slot key = {componentKey}:effect:{hookIndex}',
    'deps 없음 = 매 렌더 실행 / [] = 최초 1회 실행',
  ],
}, () => {

  it('마운트 시 실행 + effectStore', {
    goal: '첫 렌더에서는 pending effect가 flush 시 실행되고, effectStore에 deps/cleanup이 저장되는 흐름을 확인합니다.',
    checkpoints: ['pending queue 증가', 'flush 후 실행', 'effectStore 기록'],
  }, () => {
    const slotKey = 'E#5-mount:effect:0';
    let called = false;
    const cleanupFn = () => {};
    const pendingBefore = __getPendingEffects().length;

    setCurrentComponent('E#5-mount');
    useEffect(() => {
      called = true;
      return cleanupFn;
    }, []);

    const pendingAfterRegister = __getPendingEffects().length;
    flushEffects();

    const pendingAfterFlush = __getPendingEffects().length;
    const store = __getEffectStore();
    const entry = store.get(slotKey);

    assert.true(called);
    assert.equal(entry.deps, []);
    assert.true(typeof entry.cleanup === 'function');

    log('동작 흐름', [
      '1. useEffect는 즉시 실행되지 않고 pendingEffects에 등록된다.',
      '2. flushEffects()가 호출되면 첫 렌더이므로 shouldRun=true가 되어 callback을 실행한다.',
      '3. 반환된 cleanup 함수와 deps 사본이 effectStore에 저장된다.',
    ].join('\n'));
    log('큐와 저장소 변화', {
      pendingBefore,
      pendingAfterRegister,
      pendingAfterFlush,
      effectEntry: normalize(entry),
    });
    log('effectStore 스냅샷', snapshotStore(store, 'E#5-mount'));
  });

  it('deps 변경 → 재실행', {
    goal: '같은 effect 슬롯에서 deps가 바뀌면 shallow 비교 결과가 달라져 callback이 다시 실행되는지 검증합니다.',
    checkpoints: ['첫 flush 1회', 'deps 변경 감지', '최종 deps 저장'],
  }, () => {
    let callCount = 0;

    setCurrentComponent('E#6-deps');
    useEffect(() => { callCount += 1; }, [1]);
    flushEffects();
    const afterFirstFlush = callCount;

    setCurrentComponent('E#6-deps');
    useEffect(() => { callCount += 1; }, [2]);
    flushEffects();

    const store = __getEffectStore();
    const entry = store.get('E#6-deps:effect:0');

    assert.equal(afterFirstFlush, 1);
    assert.equal(callCount, 2);
    assert.equal(entry.deps, [2]);

    log('동작 흐름', [
      '1. 첫 flush에서는 이전 deps가 없으므로 effect가 실행된다.',
      '2. 두 번째 flush에서는 [1]과 [2]를 shallow 비교해 변경을 감지한다.',
      '3. 변경되었으므로 effect를 다시 실행하고 effectStore의 deps를 [2]로 교체한다.',
    ].join('\n'));
    log('호출 횟수와 deps', {
      afterFirstFlush,
      afterSecondFlush: callCount,
      storedDeps: entry.deps,
    });
    log('effectStore 스냅샷', snapshotStore(store, 'E#6-deps'));
  });

  it('cleanup 실행 순서', {
    goal: 'deps가 바뀐 재실행에서는 이전 cleanup이 먼저 돌고, 그 뒤 새 effect가 실행되는 순서를 확인합니다.',
    checkpoints: ['이전 effect 실행', 'cleanup 선행', '새 effect 후행'],
  }, () => {
    const order = [];

    setCurrentComponent('E#7-cleanup');
    useEffect(() => {
      order.push('effect');
      return () => order.push('cleanup');
    }, [1]);
    flushEffects();

    setCurrentComponent('E#7-cleanup');
    useEffect(() => {
      order.push('new effect');
    }, [2]);
    flushEffects();

    assert.equal(order, ['effect', 'cleanup', 'new effect']);

    log('동작 흐름', [
      '1. 첫 effect는 cleanup 함수를 effectStore에 남긴다.',
      '2. deps가 바뀐 두 번째 flush에서 이전 cleanup이 먼저 호출된다.',
      '3. cleanup 이후에야 새 effect가 실행된다.',
    ].join('\n'));
    log('실행 순서', order);
  });

  it('빈 deps vs deps 없음', {
    goal: '[]와 undefined deps가 완전히 다른 실행 정책을 가진다는 점을 비교합니다.',
    checkpoints: ['[]는 최초 1회', 'undefined는 매번 실행', '호출 횟수 비교'],
  }, () => {
    const callsEmpty = [];

    setCurrentComponent('E#8a-empty');
    useEffect(() => { callsEmpty.push('first render'); }, []);
    flushEffects();
    setCurrentComponent('E#8a-empty');
    useEffect(() => { callsEmpty.push('second render'); }, []);
    flushEffects();

    const callsNoDeps = [];

    setCurrentComponent('E#8b-nodeps');
    useEffect(() => { callsNoDeps.push('first render'); }, undefined);
    flushEffects();
    setCurrentComponent('E#8b-nodeps');
    useEffect(() => { callsNoDeps.push('second render'); }, undefined);
    flushEffects();

    assert.equal(callsEmpty, ['first render']);
    assert.equal(callsNoDeps, ['first render', 'second render']);

    log('동작 흐름', [
      '1. []는 이전 deps와 같으면 shouldRun=false가 되어 재실행되지 않는다.',
      '2. deps가 undefined면 shouldRun 조건에서 항상 실행 대상으로 간주된다.',
      '3. 따라서 같은 컴포넌트라도 []는 1회, undefined는 매 렌더 실행된다.',
    ].join('\n'));
    log('호출 비교', {
      emptyDepsCalls: callsEmpty,
      noDepsCalls: callsNoDeps,
    });
  });

});

// ── Suite 3: useMemo (조건부) ──────────────────────────────────────────────────
if (typeof hooks.useMemo === 'function') {
  const { useMemo } = hooks;

  describe('useMemo', {
    description: '값과 deps를 memo 슬롯에 저장해 재계산을 줄이는 동작을 검증합니다.',
    notes: [
      'slot key = {componentKey}:memo:{hookIndex}',
      'deps가 같으면 factory를 다시 호출하지 않아야 함',
    ],
  }, () => {

    it('deps 불변 시 캐싱', {
      goal: '같은 deps로 다시 호출하면 factory 대신 기존 memo 값을 재사용하는지 검증합니다.',
      checkpoints: ['factory 1회', '같은 deps', 'memo cache hit'],
    }, () => {
      let factoryCalls = 0;

      setCurrentComponent('M#9-cache');
      const firstValue = useMemo(() => { factoryCalls += 1; return 'val'; }, [1]);
      resetHookIndex();
      const secondValue = useMemo(() => { factoryCalls += 1; return 'val'; }, [1]);

      assert.equal(factoryCalls, 1);

      log('동작 흐름', [
        '1. 첫 호출은 memo 슬롯을 만들고 factory를 실행한다.',
        '2. 같은 컴포넌트와 같은 deps로 다시 호출하면 기존 값을 그대로 반환한다.',
        '3. 그래서 factory 호출 횟수는 1회로 유지된다.',
      ].join('\n'));
      log('검증 결과', { firstValue, secondValue, factoryCalls });
      log('memo 슬롯 스냅샷', snapshotStore(__getHookStore(), 'M#9-cache'));
    });

    it('deps 변경 시 재계산', {
      goal: 'deps가 달라지면 memo cache를 버리고 factory를 다시 실행하는지 검증합니다.',
      checkpoints: ['factory 2회', 'deps 변경 감지', '새 값 저장'],
    }, () => {
      let factoryCalls = 0;

      setCurrentComponent('M#10-recompute');
      useMemo(() => { factoryCalls += 1; return 'a'; }, [1]);
      resetHookIndex();
      useMemo(() => { factoryCalls += 1; return 'b'; }, [2]);

      assert.equal(factoryCalls, 2);

      log('동작 흐름', [
        '1. 첫 호출은 [1] 기준으로 memo 값을 저장한다.',
        '2. 두 번째 호출에서 deps가 [2]로 달라지면 shallow 비교가 실패한다.',
        '3. factory를 다시 실행해 새 memo 값을 저장한다.',
      ].join('\n'));
      log('검증 결과', { factoryCalls });
      log('memo 슬롯 스냅샷', snapshotStore(__getHookStore(), 'M#10-recompute'));
    });

    it('여러 useMemo 독립성', {
      goal: '같은 컴포넌트 안의 여러 memo 슬롯이 hookIndex 기준으로 독립 저장되는지 확인합니다.',
      checkpoints: ['memo:0', 'memo:1', '슬롯 독립성'],
    }, () => {
      setCurrentComponent('M#11-multi');
      const a = useMemo(() => 'aaa', [1]);
      const b = useMemo(() => 'bbb', [2]);

      assert.equal(a, 'aaa');
      assert.equal(b, 'bbb');

      log('동작 흐름', [
        '1. 첫 useMemo는 memo:0 슬롯을 사용한다.',
        '2. 두 번째 useMemo는 memo:1 슬롯을 사용한다.',
        '3. 슬롯이 다르므로 deps와 값이 서로 섞이지 않는다.',
      ].join('\n'));
      log('검증 결과', { a, b });
      log('memo 슬롯 스냅샷', snapshotStore(__getHookStore(), 'M#11-multi'));
    });

  });
} else {
  describe.skip('useMemo', {
    description: '현재 프로젝트에는 useMemo 구현이 없어 실행은 건너뛰고, 나중에 어떤 동작을 검증해야 하는지만 안내합니다.',
    notes: [
      '구현이 추가되면 캐싱 / 재계산 / 슬롯 독립성 테스트가 활성화됨',
    ],
    skipReason: 'src/framework/hooks.js에 useMemo가 정의되어 있지 않음',
  }, () => {
    it.skip('deps 불변 시 캐싱', {
      goal: '같은 deps에서 factory를 다시 호출하지 않고 기존 memo 값을 재사용해야 합니다.',
      checkpoints: ['cache hit', 'factory 1회'],
      skipReason: '현재 프로젝트에 useMemo 구현이 없음',
    }, () => {});

    it.skip('deps 변경 시 재계산', {
      goal: 'deps가 달라지면 memo cache를 무효화하고 새 값을 계산해야 합니다.',
      checkpoints: ['deps 비교', 'factory 재실행'],
      skipReason: '현재 프로젝트에 useMemo 구현이 없음',
    }, () => {});

    it.skip('여러 useMemo 독립성', {
      goal: '하나의 컴포넌트 안에서 memo 슬롯이 hookIndex별로 독립 저장되어야 합니다.',
      checkpoints: ['memo:0', 'memo:1', '슬롯 분리'],
      skipReason: '현재 프로젝트에 useMemo 구현이 없음',
    }, () => {});
  });
}
