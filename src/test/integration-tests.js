// ── integration-tests.js ───────────────────────────────────────────────────────
// vdom / component 블랙박스 통합 테스트

import { describe, it, assert, log, createSandbox } from './test-runner.js';
import { createElement, vnodeToDOM, diff, patch } from '../framework/vdom.js';
import { mount, beginComponent, endComponent } from '../framework/component.js';
import { useState } from '../framework/hooks.js';

describe('vdom / component', {
  description: 'VNode 생성, diff/patch, 이벤트 위임, mount 기반 리렌더까지 실제 DOM 수준에서 검증합니다.',
  notes: [
    'DOM은 매 테스트마다 sandbox에 격리됨',
    'mount 테스트는 클릭 이후 비동기 리렌더까지 기다림',
  ],
}, () => {

  it('createElement → VNode 구조', {
    goal: 'JSX 없이 만든 VNode가 어떤 구조를 가지는지 바로 확인합니다.',
    checkpoints: ['element node', 'props', 'text child'],
  }, () => {
    const vnode = createElement('div', { class: 'a' }, 'hello');

    assert.equal(vnode.type, 'element');
    assert.equal(vnode.tagName, 'div');
    assert.equal(vnode.props.class, 'a');
    assert.equal(vnode.children[0].type, 'text');
    assert.equal(vnode.children[0].text, 'hello');

    log('생성된 VNode', vnode);
  });

  it('Diff → 패치 생성', {
    goal: 'old/new VNode를 비교했을 때 어떤 patch가 생성되는지 봅니다.',
    checkpoints: ['TEXT patch', 'oldText', 'newText'],
  }, () => {
    const oldV = createElement('div', {}, 'old text');
    const newV = createElement('div', {}, 'new text');
    const patches = diff(oldV, newV, [], { v: 0 }, 'root');

    const textPatch = patches.find((entry) => entry.type === 'TEXT');
    assert.true(textPatch !== undefined);
    assert.equal(textPatch.text, 'new text');
    assert.equal(textPatch.oldText, 'old text');

    log('생성된 patch 목록', patches.map((entry) => ({
      type: entry.type,
      path: entry.path,
      oldText: entry.oldText,
      text: entry.text,
    })));
  });

  it('Patch → DOM 반영', {
    goal: '생성된 patch가 실제 DOM 텍스트를 어떻게 바꾸는지 확인합니다.',
    checkpoints: ['before text', 'after text', 'patch 적용'],
  }, () => {
    const sandbox = createSandbox('patch-dom');
    const container = document.createElement('div');
    sandbox.appendChild(container);

    const oldV = createElement('div', {}, 'before');
    const dom = vnodeToDOM(oldV);
    container.appendChild(dom);

    assert.equal(dom.textContent, 'before');

    const newV = createElement('div', {}, 'after');
    const patches = diff(oldV, newV, [], { v: 0 }, 'root');
    patch(dom, patches);

    assert.equal(dom.textContent, 'after');

    log('DOM 변화', {
      before: 'before',
      after: dom.textContent,
      patches,
    });
  });

  it('이벤트 위임', {
    goal: 'data-vdom-id 기반 이벤트 위임이 실제 클릭까지 연결되는지 검증합니다.',
    checkpoints: ['data-vdom-id', 'delegated click', 'handler 호출'],
  }, () => {
    const sandbox = createSandbox('delegated-events');
    const container = document.createElement('div');
    sandbox.appendChild(container);

    let clicked = false;
    const btn = createElement('button', { onClick: () => { clicked = true; } }, 'click me');
    const dom = vnodeToDOM(btn);
    container.appendChild(dom);

    const hasId = dom.hasAttribute('data-vdom-id');
    dom.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    assert.true(hasId);
    assert.true(clicked);

    log('이벤트 위임 결과', {
      hasDelegationId: hasId,
      clicked,
      delegatedNode: dom.getAttribute('data-vdom-id'),
    });
  });

  it('mount → 상태변경 → 리렌더', {
    goal: 'mount 이후 useState 업데이트가 비동기 리렌더까지 이어지는 전체 흐름을 검증합니다.',
    checkpoints: ['초기 렌더 0', '클릭', '리렌더 후 1'],
  }, async () => {
    const sandbox = createSandbox('mount-rerender');
    const container = document.createElement('div');
    sandbox.appendChild(container);

    function Counter() {
      beginComponent('IntCounter');
      const [count, setCount] = useState(0);
      endComponent();

      return createElement('div', {},
        createElement('span', { 'data-testid': 'count' }, String(count)),
        createElement('button', { onClick: () => setCount((prev) => prev + 1) }, '+')
      );
    }

    mount(Counter, container);

    const span = container.querySelector('span');
    assert.equal(span.textContent, '0');

    container.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(span.textContent, '1');

    log('렌더 흐름', [
      '1. mount가 Counter를 실행해 count=0 화면을 만든다.',
      '2. 버튼 클릭은 setState(prev => prev + 1)를 호출한다.',
      '3. scheduleRender → renderApp → requestAnimationFrame(flushEffects) 순서로 리렌더가 완료된다.',
    ].join('\n'));
    log('최종 DOM 상태', {
      initialText: '0',
      afterClickText: span.textContent,
    });
  });

});
