// ── component.js ──────────────────────────────────────────────────────────────
// 렌더 엔진: FunctionComponent 클래스 기반 컴포넌트 실행 → diff → patch

import { diff, patch, vnodeToDOM, deepCopy, cleanupHandlers } from './vdom.js';
import { setCurrentInstance, clearCurrentInstance, flushEffects, cleanupAllEffects, setAppInstance } from './hooks.js';
import { trace } from './tracer.js';

export class FunctionComponent {
  constructor(fn, container) {
    this.fn = fn;
    this.container = container;
    this.hooks = [];        // 상태 저장용 hooks 배열
    this.hookIndex = 0;
    this.vTree = null;
    this.rootDOM = null;
    this.pendingEffects = [];
    this.renderScheduled = false;
  }

  // 처음 렌더링
  mount() {
    setCurrentInstance(this);
    const vTree = this.fn();
    clearCurrentInstance();

    this.rootDOM = vnodeToDOM(vTree);
    this.container.appendChild(this.rootDOM);
    this.vTree = deepCopy(vTree);
    cleanupHandlers(this.rootDOM);

    trace('RENDER', { phase: 'mount', component: this.fn.name });
    requestAnimationFrame(() => flushEffects(this));
  }

  // 상태 변경 후 다시 렌더링
  update() {
    this.renderScheduled = false;
    const t0 = performance.now();

    setCurrentInstance(this);
    const newVTree = this.fn();
    clearCurrentInstance();

    const patches = diff(this.vTree, newVTree);
    if (patches.length > 0) {
      this.rootDOM = patch(this.rootDOM, patches);
    }
    this.vTree = deepCopy(newVTree);
    cleanupHandlers(this.rootDOM);

    trace('RENDER', {
      phase: 'update',
      component: this.fn.name,
      patchCount: patches.length,
      duration: Math.round((performance.now() - t0) * 10) / 10,
    });
    requestAnimationFrame(() => flushEffects(this));
  }

  scheduleUpdate() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    trace('STATE', { reason: 'scheduleUpdate', component: this.fn.name });
    queueMicrotask(() => this.update());
  }

  destroy() {
    cleanupAllEffects(this);
  }
}

export function mount(fn, container) {
  const instance = new FunctionComponent(fn, container);
  setAppInstance(instance);
  instance.mount();
  return instance;
}

// Backward compat stubs (컴포넌트 파일에서 호출 시 무해하게 동작)
export function beginComponent() {}
export function endComponent() {}

export function __resetComponentForTests() {}
