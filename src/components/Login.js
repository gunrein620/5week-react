// ── Login.js ──────────────────────────────────────────────────────────────────
// 순수 함수 컴포넌트: 상태 없음, 부모(App)로부터 props만 받아 렌더링합니다.

import { createElement } from '../framework/vdom.js';

export function Login({ username = '', error = '', loading = false, onInput, onSubmit } = {}) {
  return createElement('div', { class: 'login-page' },
    createElement('div', { class: 'login-card' },
      createElement('div', { class: 'login-logo' },
        createElement('div', { class: 'login-logo-mark' },
          createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', width: '28', height: '28' },
            createElement('path', { d: 'M12 2c0 6-6 8-6 13a6 6 0 0012 0c0-5-6-7-6-13z' })
          ),
          createElement('span', { class: 'login-logo-mark-text' }, 'Flicker')
        ),
        createElement('h1', { class: 'login-title' }, '지금 이 순간을'),
        createElement('p', { class: 'login-subtitle' }, '10초 후 사라집니다')
      ),
      createElement('form', { class: 'login-form', onSubmit },
        createElement('div', { class: 'input-group' },
          createElement('input', {
            class: 'input',
            type: 'text',
            placeholder: '닉네임을 입력하세요',
            value: username,
            onInput,
            maxlength: '20',
            autocomplete: 'off',
          }),
        ),
        error ? createElement('p', { class: 'error-msg' }, error) : createElement('span', {}),
        createElement('button', {
          class: `btn btn-primary${loading ? ' btn-loading' : ''}`,
          type: 'submit',
        }, loading ? '입장 중...' : '입장하기')
      )
    )
  );
}
