// ── CreatePost.js ─────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { navigate } from '../framework/router.js';
import { api } from '../services/api.js';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

export function CreatePost() {
  beginComponent('CreatePost');
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  endComponent();

  const username = localStorage.getItem('username');

  const handleTextInput = (e) => setText(e.target.value);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type && !file.type.startsWith('image/')) {
      setError('이미지 파일만 올릴 수 있어요.');
      return;
    }

    setError('');
    readFileAsDataURL(file)
      .then(data => {
        setImageData(data);
        setPreview(data);
      })
      .catch(() => {
        setError('사진을 처리하지 못했어요. 다른 이미지를 선택해보세요.');
      });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imageData) {
      setError('텍스트나 이미지를 추가해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/api/posts', { username, text: text.trim(), imageData });
      if (data.ok) {
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

  const handleRemoveImage = (e) => {
    e.preventDefault();
    setImageData(null);
    setPreview(null);
    setError('');
  };

  return createElement('div', { class: 'create-page' },
    createElement('div', { class: 'create-card' },
      createElement('div', { class: 'create-header' },
        createElement('button', { class: 'btn-back', onClick: () => navigate('#/feed') }, '← 돌아가기'),
        createElement('h2', { class: 'create-title' }, '새 순간 공유'),
        createElement('p', { class: 'create-hint' }, '10초 후 사라집니다. 좋아요를 받으면 3초씩 연장!')
      ),
      createElement('form', { class: 'create-form', onSubmit: handleSubmit },
        // 미리보기
        preview
          ? createElement('div', { class: 'create-preview' },
              createElement('img', { src: preview, class: 'create-preview__img', alt: '' }),
              text ? createElement('div', { class: 'create-preview__overlay' },
                createElement('p', {}, text)
              ) : createElement('span', {}),
              createElement('button', { class: 'create-preview__remove', onClick: handleRemoveImage }, '✕')
            )
          : createElement('label', { class: 'create-upload', for: 'file-input' },
              createElement('div', { class: 'create-upload__icon' }, '📷'),
              createElement('p', { class: 'create-upload__text' }, '사진 추가'),
              createElement('input', {
                id: 'file-input',
                type: 'file',
                accept: 'image/*',
                class: 'create-upload__input',
                onChange: handleImageChange,
              })
            ),
        createElement('textarea', {
          class: 'create-textarea',
          placeholder: '이 순간을 표현해보세요...',
          maxlength: '100',
          onInput: handleTextInput,
          rows: '3',
        }, text),
        error ? createElement('p', { class: 'error-msg' }, error) : createElement('span', {}),
        createElement('button', {
          class: `btn btn-primary${loading ? ' btn-loading' : ''}`,
          type: 'submit',
        }, loading ? '올리는 중...' : '공유하기')
      )
    )
  );
}
