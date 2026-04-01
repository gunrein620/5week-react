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
        createElement('div', { class: 'login-logo-icon' }, '🔥'),
        createElement('h1', { class: 'login-title' }, 'Flicker'),
        createElement('p', { class: 'login-subtitle' }, '10초의 순간')
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
