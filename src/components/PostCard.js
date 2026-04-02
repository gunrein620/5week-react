// ── PostCard.js ───────────────────────────────────────────────────────────────
// 순수 함수 컴포넌트: 상태 없음, 부모(Feed → App)로부터 props만 받아 렌더링합니다.

import { createElement } from '../framework/vdom.js';

export function PostCard({ post, ttl, liking = false, hasLiked = false, isArchiveView = false, rank = null, onLike } = {}) {
  const isArchived = Boolean(isArchiveView && post.isExpired);
  const shouldShowTtl = !isArchived;
  const currentTtl = ttl ?? post.ttl ?? 0;

  const displayTtl = Math.max(0, Math.ceil(currentTtl));
  const maxTtl = 15;
  const pct = shouldShowTtl ? Math.min(100, Math.max(0, (currentTtl / maxTtl) * 100)) : 100;
  const urgency = isArchived ? 'archived' : displayTtl > 7 ? 'green' : displayTtl > 4 ? 'yellow' : 'red';
  const opacity = isArchived ? 1 : Math.max(0.35, Math.min(1, currentTtl / 8));

  const handleLike = (e) => {
    e.stopPropagation();
    if (isArchived || hasLiked || liking) return;
    if (onLike) onLike(post.id);
  };

  return createElement('div', {
    class: `post-card post-card--${urgency}`,
    'data-key': post.id,
    style: `opacity: ${opacity}`,
  },
    createElement('div', { class: 'post-card__media' },
      rank !== null
        ? createElement('div', { class: `post-card__rank post-card__rank--${rank <= 3 ? rank : 'other'}` }, `#${rank}`)
        : createElement('span', {}),
      post.imageData
        ? createElement('img', { class: 'post-card__image', src: post.imageData, alt: '' })
        : createElement('div', { class: 'post-card__no-image' }),
      post.text
        ? createElement('div', { class: 'post-card__overlay' },
            createElement('p', { class: 'post-card__text' }, post.text)
          )
        : createElement('span', {})
    ),
    createElement('div', { class: 'post-card__footer' },
      createElement('span', { class: 'post-card__author' }, `@${post.author}`),
      shouldShowTtl
        ? createElement('div', { class: 'post-card__ttl-row' },
            createElement('div', { class: 'post-card__ttl-bar' },
              createElement('div', {
                class: `post-card__ttl-fill post-card__ttl-fill--${urgency}`,
                style: `width: ${pct}%`,
              })
            ),
            createElement('span', { class: `post-card__ttl-text post-card__ttl-text--${urgency}` },
              `${displayTtl}s`
            )
          )
        : createElement('div', { class: 'post-card__archive-row' },
            createElement('span', { class: 'post-card__badge' }, '보관됨'),
            createElement('span', { class: 'post-card__meta' }, `좋아요 ${post.likes}`)
          ),
      !isArchived
        ? createElement('button', {
            class: `post-card__like-btn${hasLiked ? ' post-card__like-btn--liked' : ''}${liking ? ' post-card__like-btn--loading' : ''}`,
            onClick: handleLike,
            title: hasLiked ? '이미 좋아요를 눌렀습니다' : '좋아요 (+3초)',
          },
            createElement('span', { class: 'post-card__like-icon' }, '♥'),
            createElement('span', { class: 'post-card__like-count' }, String(post.likes))
          )
        : createElement('span', {})
    )
  );
}
