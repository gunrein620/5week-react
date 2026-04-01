// ── vdom.js ──────────────────────────────────────────────────────────────────
// week4 diff/patch 엔진을 ES 모듈로 추출 + 이벤트 위임 시스템 추가

export const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
]);

// ── 이벤트 위임 시스템 ────────────────────────────────────────────────────────
const EVENT_HANDLERS = new Map(); // vdomId → { click: fn, input: fn, ... }
let nextVdomId = 1;

const DELEGATED_EVENTS = ['click', 'input', 'change', 'submit', 'keydown', 'keyup'];

function initEventDelegation() {
  for (const eventType of DELEGATED_EVENTS) {
    document.addEventListener(eventType, (e) => {
      let target = e.target;
      while (target && target !== document.body) {
        const id = target.getAttribute && target.getAttribute('data-vdom-id');
        if (id) {
          const handlers = EVENT_HANDLERS.get(id);
          if (handlers && handlers[eventType]) {
            handlers[eventType](e);
            break;
          }
        }
        target = target.parentNode;
      }
    }, true);
  }
}

if (typeof document !== 'undefined') {
  initEventDelegation();
}

export function cleanupHandlers(domRoot) {
  if (!domRoot) return;
  const existingIds = new Set();
  domRoot.querySelectorAll('[data-vdom-id]').forEach(el => {
    existingIds.add(el.getAttribute('data-vdom-id'));
  });
  for (const id of EVENT_HANDLERS.keys()) {
    if (!existingIds.has(id)) {
      EVENT_HANDLERS.delete(id);
    }
  }
}

// ── VNode 생성 ────────────────────────────────────────────────────────────────
export function createElement(tagName, props = {}, ...children) {
  const flat = children.flat(Infinity).map(c => {
    if (c === null || c === undefined || c === false) return null;
    if (typeof c === 'string' || typeof c === 'number') {
      return { type: 'text', text: String(c), key: null };
    }
    return c;
  }).filter(Boolean);

  // on* 핸들러는 props에서 분리
  const cleanProps = {};
  const handlers = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on') && typeof v === 'function') {
      const eventType = k.slice(2).toLowerCase(); // onClick → click
      handlers[eventType] = v;
    } else if (v !== null && v !== undefined) {
      cleanProps[k] = v;
    }
  }

  return {
    type: 'element',
    tagName: tagName.toLowerCase(),
    props: cleanProps,
    handlers,
    children: flat,
    key: (props && props['data-key']) || null,
  };
}

// ── VNode → DOM ───────────────────────────────────────────────────────────────
export function vnodeToDOM(vnode, doc = document) {
  if (vnode.type === 'text') {
    return doc.createTextNode(vnode.text);
  }

  const el = doc.createElement(vnode.tagName);

  // 이벤트 핸들러 등록
  if (vnode.handlers && Object.keys(vnode.handlers).length > 0) {
    const id = String(nextVdomId++);
    el.setAttribute('data-vdom-id', id);
    EVENT_HANDLERS.set(id, vnode.handlers);
  }

  // 속성 설정
  for (const [k, v] of Object.entries(vnode.props || {})) {
    if (v !== null && v !== undefined) {
      try { el.setAttribute(k, v); } catch (_) {}
    }
  }

  if (!VOID_TAGS.has(vnode.tagName)) {
    for (const child of (vnode.children || [])) {
      el.appendChild(vnodeToDOM(child, doc));
    }
  }

  return el;
}

// ── DOM → VNode ───────────────────────────────────────────────────────────────
export function domToVNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (!text) return null;
    return { type: 'text', text, key: null };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const props = {};
  for (const attr of node.attributes) {
    props[attr.name] = attr.value;
  }
  const children = [];
  for (const child of node.childNodes) {
    const vc = domToVNode(child);
    if (vc) children.push(vc);
  }
  return {
    type: 'element',
    tagName: node.tagName.toLowerCase(),
    props,
    handlers: {},
    children,
    key: props['data-key'] || null,
  };
}

// ── countNodes ────────────────────────────────────────────────────────────────
export function countNodes(vnode) {
  if (!vnode || vnode.type === 'text') return 1;
  return 1 + (vnode.children || []).reduce((s, c) => s + countNodes(c), 0);
}

// ── diffProps ─────────────────────────────────────────────────────────────────
export function diffProps(op, np) {
  const result = {};
  const keys = new Set([...Object.keys(op || {}), ...Object.keys(np || {})]);
  for (const k of keys) {
    const ov = (op || {})[k] ?? null;
    const nv = (np || {})[k] ?? null;
    if (ov !== nv) result[k] = { old: ov, new: nv };
  }
  return Object.keys(result).length ? result : null;
}

// ── diff ──────────────────────────────────────────────────────────────────────
export function diff(oldV, newV, patches, idx, path) {
  patches = patches || [];
  idx     = idx     || { v: 0 };
  path    = path    || 'root';
  const cur = idx.v;

  if (oldV && newV &&
      (oldV.type !== newV.type ||
       (oldV.type === 'element' && oldV.tagName !== newV.tagName))) {
    patches.push({ type: 'REPLACE', index: cur, oldV, newV, path });
    return patches;
  }

  if (oldV && newV && oldV.type === 'text' && newV.type === 'text') {
    if (oldV.text !== newV.text) {
      patches.push({ type: 'TEXT', index: cur, oldText: oldV.text, text: newV.text, path });
    }
    return patches;
  }

  if (oldV && newV && oldV.type === 'element') {
    // handlers 변경 시 REPLACE로 처리 (이벤트 재등록)
    const oldHandlerKeys = Object.keys(oldV.handlers || {}).sort().join(',');
    const newHandlerKeys = Object.keys(newV.handlers || {}).sort().join(',');
    const pd = diffProps(oldV.props, newV.props);
    if (pd) patches.push({ type: 'PROPS', index: cur, propsDiff: pd, path });
    if (oldHandlerKeys !== newHandlerKeys) {
      patches.push({ type: 'REPLACE', index: cur, oldV, newV, path });
      return patches;
    }
    // handler 값이 달라지면 HANDLERS 패치
    const newHandlers = newV.handlers || {};
    if (Object.keys(newHandlers).length > 0) {
      patches.push({ type: 'HANDLERS', index: cur, handlers: newHandlers, path });
    }

    const oc = oldV.children || [];
    const nc = newV.children || [];
    const maxLen = Math.max(oc.length, nc.length);

    for (let i = 0; i < maxLen; i++) {
      idx.v++;
      const childPath = `${path}>${(oc[i] || nc[i])?.tagName || 'text'}[${i}]`;

      if (i >= nc.length) {
        patches.push({ type: 'REMOVE', index: idx.v, path: childPath });
        idx.v += countNodes(oc[i]) - 1;
      } else if (i >= oc.length) {
        patches.push({ type: 'INSERT', index: idx.v, newV: nc[i], path: childPath });
        idx.v += countNodes(nc[i]) - 1;
      } else {
        diff(oc[i], nc[i], patches, idx, childPath);
      }
    }
  }

  return patches;
}

// ── buildIndexMap ─────────────────────────────────────────────────────────────
export function buildIndexMap(node, map, idx) {
  map = map || new Map();
  idx = idx || { v: 0 };
  map.set(idx.v, node);
  if (node.nodeType !== Node.ELEMENT_NODE) return map;
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
    idx.v++;
    buildIndexMap(child, map, idx);
  }
  return map;
}

// ── flashNode ─────────────────────────────────────────────────────────────────
function flashNode(el) {
  if (!el || el.nodeType === Node.TEXT_NODE) return;
  el.classList.add('node-patched');
  setTimeout(() => el.classList.remove('node-patched'), 600);
}

// ── patch ─────────────────────────────────────────────────────────────────────
export function patch(domRoot, patches) {
  if (!domRoot || !patches || !patches.length) return domRoot;
  const map = buildIndexMap(domRoot);
  const doc = domRoot.ownerDocument || document;
  let currentRoot = domRoot;

  for (const p of patches) {
    const target = map.get(p.index);

    switch (p.type) {
      case 'REPLACE': {
        if (!target) break;
        const parent = target.parentNode;
        if (!parent) break;
        const neo = vnodeToDOM(p.newV, doc);
        parent.replaceChild(neo, target);
        if (target === currentRoot) currentRoot = neo;
        flashNode(neo);
        break;
      }
      case 'TEXT': {
        if (!target) break;
        target.textContent = p.text;
        break;
      }
      case 'PROPS': {
        if (!target || target.nodeType !== Node.ELEMENT_NODE) break;
        for (const [k, ch] of Object.entries(p.propsDiff)) {
          if (ch.new === null) {
            target.removeAttribute(k);
          } else {
            target.setAttribute(k, ch.new);
          }
        }
        break;
      }
      case 'HANDLERS': {
        if (!target || target.nodeType !== Node.ELEMENT_NODE) break;
        let id = target.getAttribute('data-vdom-id');
        if (!id) {
          id = String(nextVdomId++);
          target.setAttribute('data-vdom-id', id);
        }
        EVENT_HANDLERS.set(id, p.handlers);
        break;
      }
      case 'INSERT': {
        const neo = vnodeToDOM(p.newV, doc);
        if (target && target.parentNode) {
          target.parentNode.insertBefore(neo, target);
        } else {
          const prevNode = map.get(p.index - 1);
          const parent = prevNode
            ? (prevNode.nodeType === Node.ELEMENT_NODE ? prevNode : prevNode.parentNode)
            : domRoot;
          if (parent) parent.appendChild(neo);
        }
        flashNode(neo);
        break;
      }
      case 'REMOVE': {
        if (!target) break;
        const parent = target.parentNode;
        if (parent) parent.removeChild(target);
        break;
      }
    }
  }

  return currentRoot;
}

// ── deepCopy ──────────────────────────────────────────────────────────────────
export function deepCopy(obj) {
  // handlers 함수는 JSON으로 복사 불가 → 별도 처리
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(deepCopy);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'handlers') {
      result[k] = v; // 함수 참조 유지
    } else {
      result[k] = deepCopy(v);
    }
  }
  return result;
}
