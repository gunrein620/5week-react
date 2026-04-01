// ── CreatePost.js ─────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { navigate } from '../framework/router.js';
import { api } from '../services/api.js';

// Canvas로 이미지 압축
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = (height / width) * MAX; width = MAX; }
          else { width = (width / height) * MAX; height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
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
    compressImage(file).then(data => {
      setImageData(data);
      setPreview(data);
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
        }, loading ? '올리는 중...' : '공유하기 🔥')
      )
    )
  );
}
