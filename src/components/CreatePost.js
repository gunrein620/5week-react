// ── CreatePost.js ─────────────────────────────────────────────────────────────
// 순수 함수 컴포넌트: 상태 없음, 부모(App)로부터 props만 받아 렌더링합니다.

import { createElement } from '../framework/vdom.js';
import { navigate } from '../framework/router.js';

export function CreatePost({
  text = '',
  imageData = null,
  preview = null,
  loading = false,
  error = '',
  onTextInput,
  onImageChange,
  onSubmit,
  onRemoveImage,
} = {}) {
  return createElement('div', { class: 'create-page' },
    createElement('div', { class: 'create-card' },
      createElement('div', { class: 'create-header' },
        createElement('button', { class: 'btn-back', onClick: () => navigate('#/feed') }, '← 돌아가기'),
        createElement('h2', { class: 'create-title' }, '새 순간 공유'),
        createElement('p', { class: 'create-hint' }, '10초 후 사라집니다. 좋아요를 받으면 3초씩 연장!')
      ),
      createElement('form', { class: 'create-form', onSubmit },
        preview
          ? createElement('div', { class: 'create-preview' },
              createElement('img', { src: preview, class: 'create-preview__img', alt: '' }),
              text ? createElement('div', { class: 'create-preview__overlay' },
                createElement('p', {}, text)
              ) : createElement('span', {}),
              createElement('button', { class: 'create-preview__remove', onClick: onRemoveImage }, '✕')
            )
          : createElement('label', { class: 'create-upload', for: 'file-input' },
              createElement('div', { class: 'create-upload__icon' }, '📷'),
              createElement('p', { class: 'create-upload__text' }, '사진 추가'),
              createElement('input', {
                id: 'file-input',
                type: 'file',
                accept: 'image/*',
                class: 'create-upload__input',
                onChange: onImageChange,
              })
            ),
        createElement('textarea', {
          class: 'create-textarea',
          placeholder: '이 순간을 표현해보세요...',
          maxlength: '100',
          onInput: onTextInput,
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
