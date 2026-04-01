// ── component.js ──────────────────────────────────────────────────────────────
// 렌더 엔진: 컴포넌트 실행 → diff → patch

import { diff, patch, vnodeToDOM, deepCopy, cleanupHandlers } from './vdom.js';
import { cleanupEffects, flushEffects, setCurrentComponent, setRenderFn, getLastChangedStateKey } from './hooks.js';
import { trace } from './tracer.js';

let rootDOM = null;        // 실제 DOM 루트 노드
let currentVTree = null;   // 현재 VNode 트리
let rootComponent = null;  // 최상위 컴포넌트 함수
let mountTarget = null;    // 마운트할 DOM 요소

// 컴포넌트 호출 스택 (훅 아이덴티티용)
const componentStack = [];
let componentCallCount = {};
let activeRenderKeys = null;
let previousRenderKeys = new Set();

export function beginComponent(name) {
  componentCallCount[name] = (componentCallCount[name] || 0) + 1;
  const key = `${name}#${componentCallCount[name]}`;
  componentStack.push(key);
  if (activeRenderKeys) activeRenderKeys.add(key);
  setCurrentComponent(key);
  return key;
}

export function endComponent() {
  componentStack.pop();
  const parent = componentStack[componentStack.length - 1];
  if (parent) setCurrentComponent(parent);
}

function renderApp() {
  if (!rootComponent || !mountTarget) return;
  const renderStart = performance.now();
  const nextRenderKeys = new Set();
  activeRenderKeys = nextRenderKeys;

  // 컴포넌트 콜 카운트 초기화 (렌더마다 새로 셈)
  componentCallCount = {};
  trace('UPDATE', {
    component: rootComponent.name || 'AnonymousComponent',
    cause: getLastChangedStateKey(),
  });

  // 최상위 컴포넌트 실행 → 새 VNode 트리
  beginComponent('App');
  const newVTree = rootComponent();
  endComponent();
  trace('VDOM', {
    root: summarizeVNode(newVTree),
  });

  let patchCount = 0;

  if (!currentVTree) {
    // 첫 렌더: DOM 생성
    rootDOM = vnodeToDOM(newVTree);
    mountTarget.appendChild(rootDOM);
  } else {
    // 이후 렌더: diff → patch
    const patches = diff(currentVTree, newVTree);
    patchCount = patches.length;
    if (patches.length > 0) {
      rootDOM = patch(rootDOM, patches);
    }
  }

  currentVTree = deepCopy(newVTree);
  cleanupHandlers(rootDOM);
  for (const key of previousRenderKeys) {
    if (!nextRenderKeys.has(key)) {
      cleanupEffects(key);
    }
  }
  previousRenderKeys = nextRenderKeys;
  activeRenderKeys = null;
  trace('RENDER', {
    count: patchCount,
    duration: Math.round((performance.now() - renderStart) * 10) / 10,
  });

  // effects 실행 (DOM 패치 후)
  requestAnimationFrame(() => {
    flushEffects();
  });
}

export function mount(component, target) {
  rootComponent = component;
  mountTarget = target;
  setRenderFn(renderApp);
  renderApp();
}

export function __resetComponentForTests() {
  rootDOM = null;
  currentVTree = null;
  rootComponent = null;
  mountTarget = null;
  componentStack.length = 0;
  componentCallCount = {};
  activeRenderKeys = null;
  previousRenderKeys = new Set();
}

function summarizeVNode(vnode) {
  if (!vnode) return null;
  if (vnode.type === 'text') {
    return { type: 'text', text: vnode.text };
  }

  return {
    type: vnode.type,
    tagName: vnode.tagName,
    childCount: (vnode.children || []).length,
  };
}
