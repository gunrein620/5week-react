// ── Login.js ──────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { navigate } from '../framework/router.js';
import { api } from '../services/api.js';

export function Login() {
  beginComponent('Login');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  endComponent();

  const handleInput = (e) => setUsername(e.target.value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setError('닉네임을 입력해주세요.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/api/auth/login', { username: name });
      if (data.ok) {
        localStorage.setItem('username', data.username);
        navigate('#/feed');
        setTimeout(() => {
          window.location.reload();
        }, 3);
      } else {
        setError(data.message || '오류가 발생했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

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
      createElement('form', { class: 'login-form', onSubmit: handleSubmit },
        createElement('div', { class: 'input-group' },
          createElement('input', {
            class: 'input',
            type: 'text',
            placeholder: '닉네임을 입력하세요',
            value: username,
            onInput: handleInput,
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
