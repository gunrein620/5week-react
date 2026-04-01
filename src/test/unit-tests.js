// ── unit-tests.js ──────────────────────────────────────────────────────────────
// 블랙박스 단위 테스트 — 내부 store 직접 접근 없이 DOM 결과로 검증

import { describe, it, assert, log, createSandbox } from './test-runner.js';
import { createElement, diff, patch, vnodeToDOM, cleanupHandlers } from '../framework/vdom.js';
import { useState, useEffect, setCurrentComponent } from '../framework/hooks.js';
import { mount } from '../framework/component.js';

// ── 타이밍 헬퍼 ───────────────────────────────────────────────────────────────
const waitMicrotask = () => new Promise(r => queueMicrotask(r));
const waitFrame    = () => new Promise(r => requestAnimationFrame(r));

// ── useState ──────────────────────────────────────────────────────────────────
describe('useState', {
  description: '상태 훅의 초기값·업데이트·bailout을 DOM 수준에서 검증합니다.',
  notes: ['내부 hookStore 직접 접근 없이 반환값과 DOM으로만 확인'],
}, () => {

  it('초기값을 반환한다', {
    goal: 'useState(42) → 반환된 값이 42',
    checkpoints: ['반환값 동등성'],
  }, () => {
    setCurrentComponent('Unit#1');
    const [val] = useState(42);
    log('반환값', val);
    assert.equal(val, 42);
  });

  it('setState 후 리렌더에서 값이 바뀐다', {
    goal: 'setState(5) 호출 → 다음 렌더 시 DOM이 "5" 출력',
    checkpoints: ['초기 DOM = 0', 'click → setState(5)', '리렌더 후 DOM = 5'],
  }, async () => {
    const sandbox = createSandbox('useState-rerender');

    function Display() {
      const [n, setN] = useState(0);
      return createElement('div', { id: 'disp' },
        String(n),
        createElement('button', { id: 'btn5', onClick: () => setN(5) }, 'set5')
      );
    }

    mount(Display, sandbox);
    log('초기 textContent', sandbox.querySelector('#disp').childNodes[0].textContent);
    assert.equal(sandbox.querySelector('#disp').childNodes[0].textContent, '0');

    sandbox.querySelector('#btn5').click();
    await waitMicrotask();

    log('setState 후 textContent', sandbox.querySelector('#disp').childNodes[0].textContent);
    assert.equal(sandbox.querySelector('#disp').childNodes[0].textContent, '5');
  });

  it('함수 업데이터가 이전 값을 받는다', {
    goal: 'setState(prev => prev + 1) → 이전 값 기반으로 1 증가',
    checkpoints: ['함수형 업데이터', 'prev = 0 → new = 1'],
  }, async () => {
    const sandbox = createSandbox('useState-updater');

    function Counter() {
      const [n, setN] = useState(0);
      return createElement('div', { id: 'cnt' },
        String(n),
        createElement('button', { id: 'inc', onClick: () => setN(prev => prev + 1) }, '+')
      );
    }

    mount(Counter, sandbox);
    sandbox.querySelector('#inc').click();
    await waitMicrotask();

    log('증가 후 DOM', sandbox.querySelector('#cnt').childNodes[0].textContent);
    assert.equal(sandbox.querySelector('#cnt').childNodes[0].textContent, '1');
  });

  it('같은 값이면 리렌더 안 한다 (엣지)', {
    goal: 'setState(현재값) → renderCount 증가 없음',
    checkpoints: ['동일값 bailout', '렌더 1회 유지'],
  }, async () => {
    const sandbox = createSandbox('useState-bailout');
    let renderCount = 0;

    function Static() {
      renderCount++;
      const [, setN] = useState(0);
      return createElement('div', {},
        createElement('button', { id: 'same', onClick: () => setN(0) }, 'same')
      );
    }

    mount(Static, sandbox);
    assert.equal(renderCount, 1);

    sandbox.querySelector('#same').click();
    await waitMicrotask();

    log('렌더 횟수', renderCount);
    assert.equal(renderCount, 1);
  });

});

// ── useEffect ─────────────────────────────────────────────────────────────────
describe('useEffect', {
  description: '이펙트의 실행 타이밍·deps 비교·cleanup 순서를 실제 컴포넌트로 검증합니다.',
  notes: ['effects는 requestAnimationFrame 이후 flushEffects에서 실행'],
}, () => {

  it('마운트 시 1회 실행된다', {
    goal: '컴포넌트 마운트 직후 effect가 1회 실행',
    checkpoints: ['mount 후 effectCount = 1'],
  }, async () => {
    const sandbox = createSandbox('effect-mount');
    let effectCount = 0;

    function Widget() {
      useEffect(() => { effectCount++; }, []);
      return createElement('div', {}, 'hello');
    }

    mount(Widget, sandbox);
    await waitFrame();

    log('effect 실행 횟수', effectCount);
    assert.equal(effectCount, 1);
  });

  it('deps 변경 시 재실행된다', {
    goal: 'state 변경 → deps 바뀜 → effect 2회 실행',
    checkpoints: ['초기 1회', '상태 변경 후 2회'],
  }, async () => {
    const sandbox = createSandbox('effect-deps');
    let effectCount = 0;

    function Widget() {
      const [x, setX] = useState(0);
      useEffect(() => { effectCount++; }, [x]);
      return createElement('div', {},
        createElement('button', { id: 'chg', onClick: () => setX(1) }, 'change')
      );
    }

    mount(Widget, sandbox);
    await waitFrame();
    assert.equal(effectCount, 1);

    sandbox.querySelector('#chg').click();
    await waitMicrotask();
    await waitFrame();

    log('deps 변경 후 effect 횟수', effectCount);
    assert.equal(effectCount, 2);
  });

  it('cleanup이 재실행 전 호출된다', {
    goal: '순서: effect-0 → cleanup-0 → effect-1',
    checkpoints: ['cleanup 선행 보장', '실행 순서 배열 확인'],
  }, async () => {
    const sandbox = createSandbox('effect-cleanup');
    const order = [];

    function Widget() {
      const [x, setX] = useState(0);
      useEffect(() => {
        order.push(`effect-${x}`);
        return () => order.push(`cleanup-${x}`);
      }, [x]);
      return createElement('div', {},
        createElement('button', { id: 'trigger', onClick: () => setX(1) }, 'go')
      );
    }

    mount(Widget, sandbox);
    await waitFrame();

    sandbox.querySelector('#trigger').click();
    await waitMicrotask();
    await waitFrame();

    log('실행 순서', order);
    assert.equal(order, ['effect-0', 'cleanup-0', 'effect-1']);
  });

  it('deps=[] 이면 마운트에서만 실행 (엣지)', {
    goal: '빈 deps → 여러 번 리렌더해도 effect 1회만 실행',
    checkpoints: ['[] deps', '렌더 2회 후에도 effectCount = 1'],
  }, async () => {
    const sandbox = createSandbox('effect-empty-deps');
    let effectCount = 0;

    function Widget() {
      const [x, setX] = useState(0);
      useEffect(() => { effectCount++; }, []);
      return createElement('div', {},
        createElement('button', { id: 'inc', onClick: () => setX(n => n + 1) }, '+')
      );
    }

    mount(Widget, sandbox);
    await waitFrame();

    sandbox.querySelector('#inc').click();
    await waitMicrotask();
    await waitFrame();

    sandbox.querySelector('#inc').click();
    await waitMicrotask();
    await waitFrame();

    log('effect 실행 횟수 (2회 리렌더 후)', effectCount);
    assert.equal(effectCount, 1);
  });

});

// ── vdom - createElement ──────────────────────────────────────────────────────
describe('vdom - createElement', {
  description: 'createElement가 올바른 VNode 구조를 만드는지 검증합니다.',
  notes: ['handlers 분리', 'null/false children 필터링'],
}, () => {

  it('기본 VNode 구조를 만든다', {
    goal: 'type, tagName, props 필드 정확성 확인',
    checkpoints: ['type = element', 'tagName = div', 'props.class 확인'],
  }, () => {
    const vnode = createElement('div', { class: 'box' });
    log('생성된 VNode', { type: vnode.type, tagName: vnode.tagName, props: vnode.props });
    assert.equal(vnode.type, 'element');
    assert.equal(vnode.tagName, 'div');
    assert.equal(vnode.props.class, 'box');
  });

  it('children이 문자열이면 text VNode로 변환', {
    goal: '"hello" → { type: "text", text: "hello" }',
    checkpoints: ['text VNode 타입', 'text 값 보존'],
  }, () => {
    const vnode = createElement('p', {}, 'hello');
    log('자식 VNode', vnode.children[0]);
    assert.equal(vnode.children[0].type, 'text');
    assert.equal(vnode.children[0].text, 'hello');
  });

  it('on* props를 handlers로 분리한다', {
    goal: 'onClick → handlers.click, class는 props에 유지',
    checkpoints: ['handlers.click 존재', 'props에 onClick 없음'],
  }, () => {
    const handler = () => {};
    const vnode = createElement('button', { onClick: handler, class: 'btn' });
    log('handlers', Object.keys(vnode.handlers));
    log('props keys', Object.keys(vnode.props));
    assert.equal(vnode.handlers.click, handler);
    assert.equal(vnode.props.class, 'btn');
    assert.true(!('onClick' in vnode.props));
  });

  it('null/undefined children을 무시한다 (엣지)', {
    goal: 'null, undefined, false → 자식 배열에서 제거',
    checkpoints: ['유효한 자식만 1개', 'text = valid'],
  }, () => {
    const vnode = createElement('div', {}, null, undefined, false, 'valid');
    log('children 수', vnode.children.length);
    assert.equal(vnode.children.length, 1);
    assert.equal(vnode.children[0].text, 'valid');
  });

});

// ── vdom - diff & patch ───────────────────────────────────────────────────────
describe('vdom - diff & patch', {
  description: 'diff로 패치를 생성하고 patch로 실제 DOM에 반영하는지 검증합니다.',
  notes: ['동일 트리 → 패치 0개 엣지 케이스 포함'],
}, () => {

  it('텍스트 변경 패치', {
    goal: 'diff → TEXT 패치, patch → DOM 텍스트 갱신',
    checkpoints: ['TEXT 패치 존재', 'DOM textContent 변경 확인'],
  }, () => {
    const sandbox = createSandbox('diff-text');
    const oldV = createElement('p', {}, 'before');
    const newV = createElement('p', {}, 'after');

    const el = vnodeToDOM(oldV);
    sandbox.appendChild(el);
    assert.equal(el.textContent, 'before');

    const patches = diff(oldV, newV);
    log('생성된 패치', patches.map(p => ({ type: p.type, text: p.text })));
    assert.true(patches.some(p => p.type === 'TEXT'));

    patch(el, patches);
    log('패치 후 DOM', el.textContent);
    assert.equal(el.textContent, 'after');
  });

  it('props 변경 패치', {
    goal: 'class 변경 → PROPS 패치 생성',
    checkpoints: ['PROPS 패치 존재'],
  }, () => {
    const oldV = createElement('div', { class: 'foo' });
    const newV = createElement('div', { class: 'bar' });
    const patches = diff(oldV, newV);
    log('패치 목록', patches.map(p => p.type));
    assert.true(patches.some(p => p.type === 'PROPS'));
  });

  it('자식 추가 → INSERT 패치', {
    goal: '자식 없는 ul에 li 추가 → INSERT 패치 생성',
    checkpoints: ['INSERT 패치 존재'],
  }, () => {
    const oldV = createElement('ul', {});
    const newV = createElement('ul', {}, createElement('li', {}, 'item'));
    const patches = diff(oldV, newV);
    log('패치 목록', patches.map(p => p.type));
    assert.true(patches.some(p => p.type === 'INSERT'));
  });

  it('같은 트리면 패치 0개 (엣지)', {
    goal: 'diff(same, same) → 패치 배열 길이 0',
    checkpoints: ['패치 0개'],
  }, () => {
    const vnode = createElement('div', { class: 'box' }, 'hello');
    const patches = diff(vnode, vnode);
    log('패치 수', patches.length);
    assert.equal(patches.length, 0);
  });

  it('빈 문자열 텍스트 노드가 있어도 props 패치 대상이 밀리지 않는다', {
    goal: '앞쪽 빈 text node가 있어도 input value 패치가 sibling에 잘못 적용되지 않음',
    checkpoints: ['input value = demo', 'sibling span에 value 속성 없음'],
  }, () => {
    const sandbox = createSandbox('diff-empty-text-offset');
    const oldV = createElement('div', {},
      createElement('header', {},
        createElement('span', { id: 'ghost-label' }, '')
      ),
      createElement('form', {},
        createElement('input', { id: 'nickname', value: '' }),
        createElement('span', { id: 'status' }),
        createElement('button', { id: 'submit', type: 'submit' }, '입장하기')
      )
    );
    const newV = createElement('div', {},
      createElement('header', {},
        createElement('span', { id: 'ghost-label' }, '')
      ),
      createElement('form', {},
        createElement('input', { id: 'nickname', value: 'demo' }),
        createElement('span', { id: 'status' }),
        createElement('button', { id: 'submit', type: 'submit' }, '입장하기')
      )
    );

    const el = vnodeToDOM(oldV);
    sandbox.appendChild(el);

    const patches = diff(oldV, newV);
    patch(el, patches);

    const input = sandbox.querySelector('#nickname');
    const status = sandbox.querySelector('#status');
    log('input value', input.getAttribute('value'));
    log('status value attr', status.getAttribute('value'));
    assert.equal(input.getAttribute('value'), 'demo');
    assert.equal(status.getAttribute('value'), null);
  });

});

// ── 이벤트 위임 ───────────────────────────────────────────────────────────────
describe('이벤트 위임', {
  description: 'data-vdom-id 기반 이벤트 위임 동작을 검증합니다.',
  notes: ['document capturing listener', 'patch 후 새 요소도 이벤트 수신'],
}, () => {

  it('click 핸들러가 실행된다', {
    goal: 'vnodeToDOM으로 만든 버튼 클릭 → 핸들러 호출',
    checkpoints: ['data-vdom-id 부여', 'handler 실행'],
  }, () => {
    const sandbox = createSandbox('event-click');
    let clicked = false;

    const vnode = createElement('button', { onClick: () => { clicked = true; } }, 'click me');
    const el = vnodeToDOM(vnode);
    sandbox.appendChild(el);

    log('data-vdom-id', el.getAttribute('data-vdom-id'));
    assert.true(!!el.getAttribute('data-vdom-id'));

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    log('clicked', clicked);
    assert.true(clicked);
  });

  it('동적으로 추가된 요소도 이벤트를 받는다', {
    goal: 'patch로 삽입된 버튼 클릭 → 핸들러 호출',
    checkpoints: ['INSERT 패치', 'click 이벤트 수신'],
  }, () => {
    const sandbox = createSandbox('event-dynamic');
    let count = 0;

    const oldV = createElement('div', {}, createElement('span', {}, 'old'));
    const newV = createElement('div', {},
      createElement('button', { id: 'dyn-btn', onClick: () => count++ }, 'new')
    );

    const el = vnodeToDOM(oldV);
    sandbox.appendChild(el);

    const patches = diff(oldV, newV);
    patch(el, patches);

    const btn = sandbox.querySelector('#dyn-btn');
    log('버튼 존재', !!btn);
    assert.true(!!btn);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    log('count', count);
    assert.equal(count, 1);
  });

  it('삭제된 요소의 핸들러가 정리된다 (엣지)', {
    goal: 'cleanupHandlers 후 DOM에서 사라진 요소의 data-vdom-id 없음',
    checkpoints: ['patch으로 버튼→스팬 교체', 'cleanup 후 잔여 data-vdom-id 0'],
  }, () => {
    const sandbox = createSandbox('event-cleanup');

    const oldV = createElement('div', {},
      createElement('button', { onClick: () => {} }, 'a'),
      createElement('button', { onClick: () => {} }, 'b')
    );
    const newV = createElement('div', {},
      createElement('span', {}, 'a'),
      createElement('span', {}, 'b')
    );

    const el = vnodeToDOM(oldV);
    sandbox.appendChild(el);
    log('patch 전 data-vdom-id 수', el.querySelectorAll('[data-vdom-id]').length);
    assert.equal(el.querySelectorAll('[data-vdom-id]').length, 2);

    const patches = diff(oldV, newV);
    patch(el, patches);
    cleanupHandlers(el);

    log('cleanup 후 data-vdom-id 수', el.querySelectorAll('[data-vdom-id]').length);
    assert.equal(el.querySelectorAll('[data-vdom-id]').length, 0);
  });

});
